export const READY_HREFS = ['/', '/reportes', '/tableros', '/mapas'] as const

export const STATIC_HREFS = [
  '/tablero',
  '/mapa_interactivo',
  '/mapa_sobreedad',
  '/mapa_notas',
] as const

export const GATED_STATIC_PREFIXES = [
  '/tablero',
  '/mapa_interactivo',
  '/mapa_sobreedad',
  '/mapa_notas',
] as const

export function gatedStaticPath(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0] || '/'
  if (/\.(html|pdf)$/i.test(path) && path.startsWith('/recursos/')) return path
  const hit = GATED_STATIC_PREFIXES.find(
    (p) => path === p || path.startsWith(`${p}/`),
  )
  return hit ? path : null
}

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

export function isBleedViewerPath(pathname: string) {
  if (isMapViewerPath(pathname)) return true
  if (!pathname.startsWith('/recursos/')) return false
  const rest = pathname.slice('/recursos/'.length)
  if (!rest || rest.includes('/')) return false
  return !rest.includes('.')
}

export function normalizeLoginCallbackUrl(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

