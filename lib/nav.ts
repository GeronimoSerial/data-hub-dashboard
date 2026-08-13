export const READY_HREFS = ['/', '/mapas'] as const

export function isReadyHref(href: string) {
  return (READY_HREFS as readonly string[]).includes(href)
}

export function isMapViewerPath(pathname: string) {
  return pathname.startsWith('/mapas/') && pathname !== '/mapas'
}
