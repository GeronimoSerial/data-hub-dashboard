'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  makeStyles,
  tokens,
  typographyStyles,
  Caption1,
  ToggleButton,
  Tooltip,
  Tab,
  TabList,
  type SelectTabData,
  type SelectTabEvent,
} from '@fluentui/react-components'
import {
  WeatherMoon24Regular,
  WeatherSunny24Regular,
  Home24Regular,
  DataArea24Regular,
  Map24Regular,
  DocumentText24Regular,
  Settings24Regular,
} from '@fluentui/react-icons'
import { useThemeMode } from '@/app/providers'
import { isMapViewerPath, isReadyHref } from '@/lib/nav'

const NAV = [
  { value: '/', label: 'Inicio', icon: <Home24Regular /> },
  { value: '/reportes', label: 'Reportes', icon: <DocumentText24Regular /> },
  { value: '/tableros', label: 'Tableros', icon: <DataArea24Regular /> },
  { value: '/mapas', label: 'Mapas', icon: <Map24Regular /> },
  { value: '/admin', label: 'Administración', icon: <Settings24Regular /> },
]

const useStyles = makeStyles({
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
  },
  pageViewer: {
    height: '100vh',
  },
  ribbon: {
    height: '4px',
    background: `linear-gradient(90deg, ${tokens.colorPaletteRedBackground3} 0 20%, ${tokens.colorPaletteMarigoldBackground3} 20% 40%, ${tokens.colorBrandBackground} 40% 65%, ${tokens.colorPaletteYellowBackground3} 65% 100%)`,
  },
  masthead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    paddingLeft: tokens.spacingHorizontalXXL,
    paddingRight: tokens.spacingHorizontalXXL,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  seal: {
    width: '36px',
    height: '36px',
    borderRadius: tokens.borderRadiusCircular,
    background: `radial-gradient(circle at center, ${tokens.colorPaletteYellowBackground3} 0 30%, ${tokens.colorPaletteGreenBackground3} 31% 55%, ${tokens.colorPaletteRedBackground3} 56% 75%, ${tokens.colorBrandBackground} 76%)`,
    flexShrink: 0,
  },
  brandText: {
    display: 'flex',
    flexDirection: 'column',
  },
  brandTitle: {
    ...typographyStyles.subtitle2,
  },
  division: {
    color: tokens.colorNeutralForeground3,
    textAlign: 'right',
    letterSpacing: '0.4px',
  },
  navBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    paddingLeft: tokens.spacingHorizontalXXL,
    paddingRight: tokens.spacingHorizontalXXL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: '1180px',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: tokens.spacingHorizontalXXL,
    paddingRight: tokens.spacingHorizontalXXL,
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXXL,
    minHeight: 0,
  },
  contentBleed: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 'none',
    marginLeft: 0,
    marginRight: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    paddingLeft: tokens.spacingHorizontalXXL,
    paddingRight: tokens.spacingHorizontalXXL,
    paddingTop: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalL,
    borderTop: `${tokens.strokeWidthThick} solid ${tokens.colorPaletteYellowBackground3}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground3,
  },
})

export function AppShell({ children }: { children: React.ReactNode }) {
  const styles = useStyles()
  const { mode, setMode } = useThemeMode()
  const router = useRouter()
  const pathname = usePathname()

  // Match the deepest nav item (so /reportes/x still highlights Reportes).
  const visibleNav = NAV.filter((n) => isReadyHref(n.value))
  const mapViewer = isMapViewerPath(pathname)

  const selected =
    visibleNav
      .filter((n) => n.value !== '/')
      .sort((a, b) => b.value.length - a.value.length)
      .find((n) => pathname.startsWith(n.value))?.value ?? '/'

  const onTabSelect = (_e: SelectTabEvent, data: SelectTabData) => {
    router.push(data.value as string)
  }

  return (
    <div className={mapViewer ? `${styles.page} ${styles.pageViewer}` : styles.page}>
      <div className={styles.ribbon} />
      <header className={styles.masthead}>
        <div className={styles.brand}>
          <span className={styles.seal} aria-hidden />
          <span className={styles.brandText}>
            <span className={styles.brandTitle}>Análisis Educativo</span>
            <Caption1>Ministerio de Educación · Corrientes</Caption1>
          </span>
        </div>
        <Caption1 className={styles.division}>
          DIRECCIÓN DE GESTIÓN ESCOLAR
          <br />
          DIRECCIÓN DE SISTEMAS DE INFORMACIÓN
        </Caption1>
      </header>

      <nav className={styles.navBar} aria-label="Navegación principal">
        <TabList
          selectedValue={selected}
          onTabSelect={onTabSelect}
          size="large"
        >
          {visibleNav.map((n) => (
            <Tab key={n.value} value={n.value} icon={n.icon}>
              {n.label}
            </Tab>
          ))}
        </TabList>
        <Tooltip
          content={mode === 'light' ? 'Tema oscuro' : 'Tema claro'}
          relationship="label"
        >
          <ToggleButton
            checked={mode === 'dark'}
            onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
            icon={
              mode === 'light' ? (
                <WeatherMoon24Regular />
              ) : (
                <WeatherSunny24Regular />
              )
            }
            appearance="subtle"
            aria-label="Cambiar tema"
          />
        </Tooltip>
      </nav>

      <main className={mapViewer ? styles.contentBleed : styles.content}>
        {children}
      </main>

      {mapViewer ? null : (
        <footer className={styles.footer}>
          <Caption1>
            Ministerio de Educación de Corrientes · Gobierno de la Provincia
          </Caption1>
          <Caption1>Hub de Datos · Información para decidir</Caption1>
        </footer>
      )}
    </div>
  )
}
