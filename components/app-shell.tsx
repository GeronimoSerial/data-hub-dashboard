'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Menu as MenuIcon, Moon, Search, Sun, UserRound } from 'lucide-react'
import { useThemeMode } from '@/app/providers'
import { authClient } from '@/lib/auth-client'
import { isStaff, type Role } from '@/lib/acl'
import type { ShellUser } from '@/lib/session'
import { canUseLanding, effectiveSections, sectionForPath } from '@/lib/hub-sections'
import { decideScrollAction, isBleedViewerPath, isMapViewerPath, isRestoreSettled, scrollRestorationKey } from '@/lib/nav'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { MarcaBanda, MarcaCompacta, MarcaHorizontal, MarcaHorizontalInversa } from '@/components/marca'

const NAV = [
  { href: '/', label: 'Inicio' },
  { href: '/explorar', label: 'Explorar' },
  { href: '/reportes', label: 'Reportes' },
  { href: '/mapas', label: 'Mapas' },
  { href: '/tableros', label: 'Tableros' },
  { href: '/mapas/infraestructura', label: 'Infraestructura escolar' },
  { href: '/situacion', label: 'Centro de Situación' },
]

const SectionAccessContext = React.createContext<(path: string) => boolean>(() => true)

export function useSectionAccess() {
  return React.useContext(SectionAccessContext)
}

const ResourceDetailsContext = React.createContext({
  expanded: false,
  setExpanded: (_expanded: boolean) => {},
})

export function useResourceDetails() {
  return React.useContext(ResourceDetailsContext)
}

// Every page scrolls inside the shell's <main>, never the document (see
// odd/tasks/mapa-natalidad.md T12) — the header sits outside that scroller
// and never moves. Anything that used to read `window.scrollY` or a
// `window` IntersectionObserver root belongs here instead.
type Scroller = HTMLElement | null
const AppScrollerContext = React.createContext<React.RefObject<Scroller> | null>(null)

/** The app shell's scroll container, for code that needs to read/observe it
 *  (e.g. an IntersectionObserver `root`, or a manual scrollTop read). Returns
 *  null outside the shell (there is none to render standalone pages). */
export function useAppScroller() {
  return React.useContext(AppScrollerContext)
}

function saveScrollPosition(key: string, top: number) {
  try {
    window.sessionStorage.setItem(key, String(top))
  } catch {
    // Storage can be unavailable (private browsing, quota) — restoration is
    // a nicety, never worth failing navigation over.
  }
}

// `.app-content` sets `scroll-behavior: smooth` (for anchor/skip-link jumps),
// which also applies to a plain `el.scrollTop = n` assignment: the browser
// animates toward it instead of applying it synchronously, so a read right
// after setting it can still observe the old value. That silently broke both
// the top-reset on forward navigation and the restore-on-back loop below
// (each retry re-triggered a fresh animation instead of converging). Force
// the assignment through `scroll-behavior: auto` so it always lands instantly.
function setScrollTopInstant(el: HTMLElement, value: number) {
  const previous = el.style.scrollBehavior
  el.style.scrollBehavior = 'auto'
  el.scrollTop = value
  el.style.scrollBehavior = previous
}

// Resets the shell scroller to the top on every route change (matching
// Next's default `router.push` behavior, which already resets `window`
// scroll on both pathname and search-param navigations that don't pass
// `{ scroll: false }` — see /explorar's filters), and restores the previous
// position on browser back/forward. Split out so only this leaf needs the
// Suspense boundary `useSearchParams` requires.
//
// Restoration is trickier than a plain scrollTop write because the outgoing
// position must be captured *before* the route change tears the old content
// down (a cleanup closure runs too late relative to unmount in some cases,
// and a pathname/searchParams-only effect never sees the pre-navigation
// value at all), and the incoming position must be applied *after* the new
// page has laid out enough height to actually hold it (right after mount,
// `scrollHeight` can still be clamped to the viewport while data/images are
// still settling, silently rounding the restore down to 0). So: the current
// key's position is tracked continuously via a throttled scroll listener
// (surviving even a hard navigation-time unmount), popstate is recorded
// before Next's own state update reaches this effect, and restoration retries
// across frames/ResizeObserver until the target is reachable or a time
// budget runs out.
const RESTORE_BUDGET_MS = 1000

// Next 16 handles back/forward through the Navigation API: the new route
// commits *before* `popstate` fires and even before `navigation.currentEntry`
// points at the destination entry. So a popstate flag or an entry lookup inside
// the route effect is always stale. Where the Navigation API exists, positions
// are stored per history entry (looked up lazily when scrolling) and restored
// from `currententrychange` for traversals; forward navigations reset in the
// route effect. Without the Navigation API, fall back to route key + popstate.
type NavigationEntryLike = { key?: string }
type NavigationLike = EventTarget & { currentEntry?: NavigationEntryLike | null }

function getNavigation(): NavigationLike | null {
  return (window as unknown as { navigation?: NavigationLike }).navigation ?? null
}

function storageKeyFor(routeKey: string): string {
  const entry = getNavigation()?.currentEntry?.key
  return entry ? `${routeKey}#${entry}` : routeKey
}

function currentRouteKey(): string {
  return scrollRestorationKey(window.location.pathname, window.location.search.replace(/^\?/, ''))
}

// Applies `target` once the content is tall enough to hold it, retrying across
// frames and resizes within a time budget. Returns a cancel function.
function restoreScroll(el: HTMLElement, target: number): () => void {
  let cancelled = false
  const startedAt = performance.now()
  const observer = new ResizeObserver(attempt)
  observer.observe(el)
  let rafId = requestAnimationFrame(attempt)

  function attempt() {
    if (cancelled) return
    setScrollTopInstant(el, target)
    if (isRestoreSettled(el.scrollTop, target, performance.now() - startedAt, RESTORE_BUDGET_MS)) {
      cancel()
      return
    }
    rafId = requestAnimationFrame(attempt)
  }

  function cancel() {
    cancelled = true
    cancelAnimationFrame(rafId)
    observer.disconnect()
  }

  return cancel
}

function ScrollManager({ pathname, scrollerRef }: { pathname: string; scrollerRef: React.RefObject<Scroller> }) {
  const searchParams = useSearchParams()
  const isPopNavigation = React.useRef(false)
  const currentRouteRef = React.useRef<string | null>(null)
  const cancelRestoreRef = React.useRef<(() => void) | null>(null)

  // `history.scrollRestoration` defaults to the browser restoring
  // `window`'s own scroll on back/forward — irrelevant now that `window`
  // never scrolls (T12), and it can fight this manual restore.
  React.useEffect(() => {
    if (!('scrollRestoration' in window.history)) return
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  // Traversal detection. With the Navigation API, restore as soon as the
  // destination entry is current (it has its own saved position). Without it,
  // flag popstate so the route effect restores instead of resetting.
  React.useEffect(() => {
    const nav = getNavigation()
    if (nav) {
      function handleEntryChange(event: Event) {
        const type = (event as Event & { navigationType?: string }).navigationType
        if (type !== 'traverse') return
        const el = scrollerRef.current
        if (!el) return
        const saved = window.sessionStorage.getItem(storageKeyFor(currentRouteKey()))
        const decision = decideScrollAction(true, saved)
        cancelRestoreRef.current?.()
        if (decision.type === 'restore') cancelRestoreRef.current = restoreScroll(el, decision.target)
        else setScrollTopInstant(el, 0)
      }
      nav.addEventListener('currententrychange', handleEntryChange)
      return () => nav.removeEventListener('currententrychange', handleEntryChange)
    }
    function handlePopState() {
      isPopNavigation.current = true
    }
    window.addEventListener('popstate', handlePopState, { capture: true })
    return () => window.removeEventListener('popstate', handlePopState, { capture: true })
  }, [scrollerRef])

  // Continuously persist the scroll position of the current route. The storage
  // key (route + history entry) is resolved at save time, when
  // `navigation.currentEntry` is already the entry being scrolled.
  React.useEffect(() => {
    const maybeEl = scrollerRef.current
    if (!maybeEl) return
    const el: HTMLElement = maybeEl
    const routeKey = scrollRestorationKey(pathname, searchParams.toString())
    currentRouteRef.current = routeKey

    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        ticking = false
        if (currentRouteRef.current === routeKey && currentRouteKey() === routeKey) {
          saveScrollPosition(storageKeyFor(routeKey), el.scrollTop)
        }
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // No final save on cleanup: it runs after the next route has committed,
    // when the scroller already shows the new page (scrollTop reset/clamped
    // to 0), and would overwrite the real position saved by the listener.
    return () => el.removeEventListener('scroll', onScroll)
  }, [pathname, searchParams, scrollerRef])

  // Route change: forward navigations start at the top. Traversals are handled
  // by `currententrychange` (Navigation API) or the popstate flag (fallback).
  React.useEffect(() => {
    const maybeEl = scrollerRef.current
    if (!maybeEl) return
    const el: HTMLElement = maybeEl
    const routeKey = scrollRestorationKey(pathname, searchParams.toString())

    if (getNavigation()) {
      // A traversal's entry change can land before or after this effect; if a
      // restore for this route is already running or the entry change is still
      // pending, resetting here would clobber it. Defer one frame and reset only
      // if no traversal restore claimed the scroller meanwhile.
      const claimedBefore = cancelRestoreRef.current
      const rafId = requestAnimationFrame(() => {
        if (cancelRestoreRef.current !== claimedBefore) return
        const saved = window.sessionStorage.getItem(storageKeyFor(routeKey))
        if (saved === null) setScrollTopInstant(el, 0)
      })
      return () => cancelAnimationFrame(rafId)
    }

    const wasPopNavigation = isPopNavigation.current
    isPopNavigation.current = false
    const decision = decideScrollAction(wasPopNavigation, window.sessionStorage.getItem(routeKey))
    if (decision.type === 'reset') {
      setScrollTopInstant(el, 0)
      return
    }
    const cancel = restoreScroll(el, decision.target)
    return cancel
  }, [pathname, searchParams, scrollerRef])

  return null
}

export function AppShell({
  children,
  initialUser,
  situacionEnabled = false,
}: {
  children: React.ReactNode
  initialUser: ShellUser | null
  situacionEnabled?: boolean
}) {
  const { mode, setMode } = useThemeMode()
  const router = useRouter()
  const pathname = usePathname()
  const session = authClient.useSession()
  // While the client session is pending (always during SSR), fall back to the
  // server-provided user so the header markup matches on hydration.
  const sessionUser = session.isPending ? initialUser : session.data?.user ?? null
  const role = (sessionUser as { role?: Role } | null)?.role
  const policy = (sessionUser as ShellUser | null)?.hubPolicy ?? initialUser?.hubPolicy ?? {}
  const sections = effectiveSections(policy)
  const canAccessPath = (path: string) => {
    const section = sectionForPath(path)
    return section === 'landing' ? canUseLanding(policy) : section ? sections.has(section) : true
  }
  const visibleNav = NAV.filter((item) => canAccessPath(item.href) && (item.href !== '/situacion' || situacionEnabled))
  const compactoMapa = isMapViewerPath(pathname)
  const mapViewer = isBleedViewerPath(pathname)
  const resourceViewer = pathname.startsWith('/recursos/')
  const [resourceDetailsExpanded, setResourceDetailsExpanded] = React.useState(false)
  const isCurrent = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const scrollerRef = React.useRef<Scroller>(null)

  async function signOut() {
    await authClient.signOut()
    router.replace('/login')
  }

  return (
    <div className="app-page">
      <React.Suspense fallback={null}>
        <ScrollManager pathname={pathname} scrollerRef={scrollerRef} />
      </React.Suspense>

      <a href="#contenido" className="skip-link">
        Ir al contenido
      </a>

      <header className={`app-header${compactoMapa ? ' app-header--mapa' : ''}`} data-compacto={compactoMapa ? 'true' : undefined}>
        {/* Institutional strip: five solid segments, one colour each. It sits
            inside the sticky header so it stays on screen while scrolling. */}
        <div className="app-ribbon" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        {/* Upper band: the official signature, used as supplied. It is never
            recoloured, rebuilt or scaled below its minimum (Manual §2.1–2.3). */}
        {compactoMapa ? null : (
          <div className="app-signature">
            <div className="app-signature__inner">
              <MarcaHorizontal />
              <MarcaHorizontalInversa />
              <MarcaCompacta />
              <span className="app-signature__reparticiones">
                <span>Dirección de Sistemas de Información</span>
                <span>Dirección de Gestión Escolar</span>
              </span>
              <span className="app-signature__aside">
                Provincia de Corrientes
                <br />
                República Argentina
              </span>
            </div>
          </div>
        )}

        {/* Lower band: the product and its navigation. */}
        <div className="app-header__band">
          <div className="app-header__inner">
            {compactoMapa ? <span className="app-header--mapa__marca"><MarcaBanda /></span> : null}
            {canAccessPath('/') ? (
              <Link href="/" className="app-brand" aria-label="Hub de Datos, inicio">
                <span className="app-brand__text">Hub de Datos</span>
              </Link>
            ) : <span className="app-brand"><span className="app-brand__text">Hub de Datos</span></span>}

            <nav className="app-nav" aria-label="Navegación principal">
              {visibleNav.map((item) => (
                <Link key={item.href} href={item.href} aria-current={isCurrent(item.href) ? 'page' : undefined}>
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="app-actions">
              {canAccessPath('/explorar') ? <Link href="/explorar" className="ui-button ui-button--ghost ui-button--icon" aria-label="Buscar recursos">
                <Search size={19} />
              </Link> : null}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
                aria-label={mode === 'light' ? 'Usar tema oscuro' : 'Usar tema claro'}
              >
                {mode === 'light' ? <Moon size={19} /> : <Sun size={19} />}
              </Button>

              <Menu>
                <MenuTrigger render={<Button variant="ghost" aria-label="Menú de cuenta" />}>
                  <UserRound size={19} />
                  <span className="app-actions__name">{sessionUser?.name ?? 'Cuenta'}</span>
                </MenuTrigger>
                <MenuContent>
                  {sessionUser ? (
                    <>
                      {isStaff(role) ? (
                        <>
                          <MenuItem onClick={() => router.push('/admin')}>Administración</MenuItem>
                          {situacionEnabled && canAccessPath('/situacion') ? <MenuItem onClick={() => router.push('/situacion')}>Centro de Situación</MenuItem> : null}
                        </>
                      ) : null}
                      <MenuItem onClick={() => router.push('/cuenta')}>Cambiar contraseña</MenuItem>
                      <MenuItem onClick={signOut}>Cerrar sesión</MenuItem>
                    </>
                  ) : (
                    <MenuItem onClick={() => router.push('/login')}>Iniciar sesión</MenuItem>
                  )}
                </MenuContent>
              </Menu>

              <Menu>
                <MenuTrigger render={<Button className="app-mobile" variant="ghost" size="icon" aria-label="Abrir navegación" />}>
                  <MenuIcon size={20} />
                </MenuTrigger>
                <MenuContent>
                  {visibleNav.map((item) => (
                    <MenuItem key={item.href} onClick={() => router.push(item.href)}>{item.label}</MenuItem>
                  ))}
                  {canAccessPath('/explorar') ? <MenuItem onClick={() => router.push('/explorar')}>Buscar</MenuItem> : null}
                </MenuContent>
              </Menu>

              {resourceViewer ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="resource-details-toggle"
                  aria-label={resourceDetailsExpanded ? 'Ocultar detalles del recurso' : 'Mostrar detalles del recurso'}
                  aria-expanded={resourceDetailsExpanded}
                  aria-controls="resource-details"
                  onClick={() => setResourceDetailsExpanded((expanded) => !expanded)}
                >
                  <ChevronDown size={20} aria-hidden />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <SectionAccessContext.Provider value={canAccessPath}>
        <ResourceDetailsContext.Provider value={{ expanded: resourceDetailsExpanded, setExpanded: setResourceDetailsExpanded }}>
        <AppScrollerContext.Provider value={scrollerRef}>
          <main id="contenido" ref={scrollerRef} className={mapViewer ? 'app-content--bleed' : 'app-content'}>
            {mapViewer ? (
              children
            ) : (
              <>
                <div className="app-content__inner">{children}</div>
                <footer className="app-footer">
                  <span>
                    Ministerio de Educación
                    <br />
                    Provincia de Corrientes
                  </span>
                  <span className="app-footer__links">
                    {canAccessPath('/explorar') ? <Link href="/explorar">Explorar recursos</Link> : null}
                    {canAccessPath('/mapas/infraestructura') ? <Link href="/mapas/infraestructura">Infraestructura escolar</Link> : null}
                  </span>
                </footer>
              </>
            )}
          </main>
        </AppScrollerContext.Provider>
        </ResourceDetailsContext.Provider>
      </SectionAccessContext.Provider>
    </div>
  )
}
