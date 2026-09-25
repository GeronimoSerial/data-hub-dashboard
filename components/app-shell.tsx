'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Menu as MenuIcon, Moon, Search, Sun, UserRound } from 'lucide-react'
import { useThemeMode } from '@/app/providers'
import { authClient } from '@/lib/auth-client'
import { isStaff, type Role } from '@/lib/acl'
import { isBleedViewerPath, scrollRestorationKey } from '@/lib/nav'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { MarcaCompacta, MarcaHorizontal, MarcaHorizontalInversa } from '@/components/marca'

const NAV = [
  { href: '/', label: 'Inicio' },
  { href: '/explorar', label: 'Explorar' },
]

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

function ScrollManager({ pathname, scrollerRef }: { pathname: string; scrollerRef: React.RefObject<Scroller> }) {
  const searchParams = useSearchParams()
  const isPopNavigation = React.useRef(false)
  const currentKeyRef = React.useRef<string | null>(null)

  // `history.scrollRestoration` defaults to the browser restoring
  // `window`'s own scroll on back/forward — irrelevant now that `window`
  // never scrolls (T12), but left on it also fights this manual restore by
  // firing its own (no-op) adjustment mid-navigation.
  React.useEffect(() => {
    if (!('scrollRestoration' in window.history)) return
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  React.useEffect(() => {
    function handlePopState() {
      isPopNavigation.current = true
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Continuously persist the outgoing scroll position for the *current* key,
  // so it is up to date however the next navigation is triggered — a click
  // (React unmounts synchronously, before any cleanup runs the save) or a
  // popstate (the pathname effect below fires before any dedicated
  // "leaving" hook would).
  React.useEffect(() => {
    const maybeEl = scrollerRef.current
    if (!maybeEl) return
    const el: HTMLElement = maybeEl
    const key = scrollRestorationKey(pathname, searchParams.toString())
    currentKeyRef.current = key

    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        ticking = false
        if (currentKeyRef.current === key) saveScrollPosition(key, el.scrollTop)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      // Final save for this key in case the last scroll frame never fired.
      saveScrollPosition(key, el.scrollTop)
    }
  }, [pathname, searchParams, scrollerRef])

  React.useEffect(() => {
    const maybeEl = scrollerRef.current
    if (!maybeEl) return
    const el: HTMLElement = maybeEl
    const key = scrollRestorationKey(pathname, searchParams.toString())
    const wasPopNavigation = isPopNavigation.current
    isPopNavigation.current = false

    if (!wasPopNavigation) {
      el.scrollTop = 0
      return
    }

    const saved = window.sessionStorage.getItem(key)
    const target = saved ? Number(saved) : 0
    if (target <= 0) {
      el.scrollTop = 0
      return
    }

    let cancelled = false
    const startedAt = performance.now()
    const observer = new ResizeObserver(attempt)
    observer.observe(el)
    let rafId = requestAnimationFrame(attempt)

    function attempt() {
      if (cancelled) return
      el.scrollTop = target
      const reached = el.scrollTop >= target - 1
      const timedOut = performance.now() - startedAt > RESTORE_BUDGET_MS
      if (reached || timedOut) {
        cleanup()
        return
      }
      rafId = requestAnimationFrame(attempt)
    }

    function cleanup() {
      cancelled = true
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }

    return cleanup
  }, [pathname, searchParams, scrollerRef])

  return null
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { mode, setMode } = useThemeMode()
  const router = useRouter()
  const pathname = usePathname()
  const session = authClient.useSession()
  const sessionUser = session.data?.user
  const role = (sessionUser as { role?: Role } | undefined)?.role
  const mapViewer = isBleedViewerPath(pathname)
  const resourceViewer = pathname.startsWith('/recursos/')
  const [resourceDetailsExpanded, setResourceDetailsExpanded] = React.useState(false)
  const isCurrent = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const scrollerRef = React.useRef<Scroller>(null)

  async function signOut() {
    await authClient.signOut()
    router.replace('/')
  }

  return (
    <div className="app-page">
      <React.Suspense fallback={null}>
        <ScrollManager pathname={pathname} scrollerRef={scrollerRef} />
      </React.Suspense>

      <a href="#contenido" className="skip-link">
        Ir al contenido
      </a>

      <header className="app-header">
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

        {/* Lower band: the product and its navigation. */}
        <div className="app-header__band">
          <div className="app-header__inner">
            <Link href="/" className="app-brand" aria-label="Hub de Datos, inicio">
              <span className="app-brand__text">Hub de Datos</span>
            </Link>

            <nav className="app-nav" aria-label="Navegación principal">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} aria-current={isCurrent(item.href) ? 'page' : undefined}>
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="app-actions">
              <Link href="/explorar" className="ui-button ui-button--ghost ui-button--icon" aria-label="Buscar recursos">
                <Search size={19} />
              </Link>
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
                        <MenuItem onClick={() => router.push('/admin')}>Administración</MenuItem>
                      ) : null}
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
                  {NAV.map((item) => (
                    <MenuItem key={item.href} onClick={() => router.push(item.href)}>{item.label}</MenuItem>
                  ))}
                  <MenuItem onClick={() => router.push('/explorar')}>Buscar</MenuItem>
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
                    <Link href="/explorar">Explorar recursos</Link>
                    <Link href="/mapas/infraestructura">Infraestructura escolar</Link>
                  </span>
                </footer>
              </>
            )}
          </main>
        </AppScrollerContext.Provider>
      </ResourceDetailsContext.Provider>
    </div>
  )
}
