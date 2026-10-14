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

/**
 * Legacy static dashboards whose seed rows were migrated to uploaded files
 * (see SEED_PUBLIC_FILES in lib/seed-files.ts): their `ruta` was cleared, so the
 * static gate can no longer resolve them and would answer 404. Their entry
 * URLs now redirect to the `/recursos/[id]` viewer, which enforces access.
 */
const LEGACY_RECURSO_IDS: Record<string, string> = {
  '/tablero': 'r2',
  '/mapa_interactivo': 'r3',
  '/mapa_sobreedad': 'r13',
  '/mapa_notas': 'r14',
}

export function legacyRecursoRedirect(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0] || '/'
  const root = path.replace(/\/(index\.html)?$/i, '')
  const id = LEGACY_RECURSO_IDS[root]
  return id ? `/recursos/${id}` : null
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

/**
 * sessionStorage key used to persist the app shell's inner scroller position
 * for one navigation entry, so browser back/forward can restore it. Keyed by
 * the full URL (pathname + search) — the hash is intentionally excluded,
 * since fragment navigation scrolls within the page rather than moving
 * between history entries, and Next's router hooks don't expose it anyway.
 */
export function scrollRestorationKey(pathname: string, search: string) {
  const query = search.startsWith('?') ? search.slice(1) : search
  return `app-scroll:${pathname}${query ? `?${query}` : ''}`
}

export type ScrollAction = { type: 'reset' } | { type: 'restore'; target: number }

/**
 * Pure decision for what a route change should do to the shell scroller.
 * A forward/replace navigation (not a popstate) always resets to the top,
 * regardless of whatever value happens to be sitting in sessionStorage for
 * the incoming key (e.g. a stale value left over from an earlier visit) —
 * only a genuine back/forward navigation restores a saved position, and
 * only when that saved value is a usable positive number.
 */
export function decideScrollAction(
  wasPopNavigation: boolean,
  savedValue: string | null,
): ScrollAction {
  if (!wasPopNavigation) return { type: 'reset' }
  const target = savedValue === null ? NaN : Number(savedValue)
  if (!Number.isFinite(target) || target <= 0) return { type: 'reset' }
  return { type: 'restore', target }
}

/**
 * Pure decision for whether a restore attempt loop should stop retrying:
 * either the scroller has reached (or nearly reached) its target, or the
 * time budget for retrying has run out.
 */
export function isRestoreSettled(
  currentTop: number,
  target: number,
  elapsedMs: number,
  budgetMs: number,
): boolean {
  return currentTop >= target - 1 || elapsedMs > budgetMs
}
