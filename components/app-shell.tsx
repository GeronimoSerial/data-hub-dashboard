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

  async function signOut() {
    await authClient.signOut()
    router.replace('/')
  }

  return (
    <div className={`app-page${mapViewer ? ' app-page--viewer' : ''}`}>
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
        <main id="contenido" className={mapViewer ? 'app-content--bleed' : 'app-content'}>
          {children}
        </main>
      </ResourceDetailsContext.Provider>

      {mapViewer ? null : (
        <footer className="app-footer">
          <span>
            Ministerio de Educación
            <br />
            Provincia de Corrientes
          </span>
          <span className="app-footer__links">
            <Link href="/explorar">Explorar recursos</Link>
            <Link href="/problematicas">Problemáticas de infraestructura</Link>
          </span>
        </footer>
      )}
    </div>
  )
}
