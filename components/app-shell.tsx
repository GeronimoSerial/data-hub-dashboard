'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, Menu as MenuIcon, Moon, Search, Sun, UserRound } from 'lucide-react'
import { useThemeMode } from '@/app/providers'
import { authClient } from '@/lib/auth-client'
import { isStaff, type Role } from '@/lib/acl'
import { isBleedViewerPath } from '@/lib/nav'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const { mode, setMode } = useThemeMode()
  const router = useRouter()
  const pathname = usePathname()
  const session = authClient.useSession()
  const sessionUser = session.data?.user
  const role = (sessionUser as { role?: Role } | undefined)?.role
  const mapViewer = isBleedViewerPath(pathname)
  const resourceViewer = pathname.startsWith('/recursos/')
  const [resourceDetails, setResourceDetails] = React.useState({ pathname, expanded: false })
  const resourceDetailsExpanded = resourceDetails.pathname === pathname && resourceDetails.expanded
  const setResourceDetailsExpanded = React.useCallback((next: boolean | ((value: boolean) => boolean)) => {
    setResourceDetails((current) => {
      const expanded = current.pathname === pathname ? current.expanded : false
      return {
        pathname,
        expanded: typeof next === 'function' ? next(expanded) : next,
      }
    })
  }, [pathname])
  const isCurrent = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  async function signOut() {
    await authClient.signOut()
    router.replace('/')
  }

  return (
    <div className={`app-page${mapViewer ? ' app-page--viewer' : ''}`}>
      <div className="app-ribbon" />
      <header className="app-header">
        <div className="app-header__inner">
          <Link href="/" className="app-brand" aria-label="Hub de Datos, inicio">
            <span className="app-brand__seal" aria-hidden />
            <span className="app-brand__text">
              <strong>Análisis Educativo</strong>
              <small>Ministerio de Educación · Corrientes</small>
            </span>
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
      </header>

      <ResourceDetailsContext.Provider value={{ expanded: resourceDetailsExpanded, setExpanded: setResourceDetailsExpanded }}>
        <main className={mapViewer ? 'app-content--bleed' : 'app-content'}>{children}</main>
      </ResourceDetailsContext.Provider>

      {mapViewer ? null : (
        <footer className="app-footer">
          <span>Ministerio de Educación de Corrientes</span>
          <span>Hub de Datos · Información para decidir</span>
        </footer>
      )}
    </div>
  )
}
