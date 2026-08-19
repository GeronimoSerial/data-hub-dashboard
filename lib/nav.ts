export const READY_HREFS = ['/', '/reportes', '/tableros', '/mapas'] as const

export const STATIC_HREFS = [
  '/tablero',
  '/mapa_interactivo',
  '/mapa_sobreedad',
  '/mapa_notas',
] as const

export function isReadyHref(href: string) {
  return (READY_HREFS as readonly string[]).includes(href)
}

export function isStaticHref(href: string) {
  const path = href.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/'
  return (
    (STATIC_HREFS as readonly string[]).includes(path) ||
    /\.(html|pdf)$/i.test(path)
  )
}

export function isMapViewerPath(pathname: string) {
  return pathname.startsWith('/mapas/') && pathname !== '/mapas'
}
