import type { BookletBalanceView, BookletRequestSummary } from '@/lib/cuadernillos/types'

export type CabeceraGroup = {
  cabeceraCueAnexo: string
  cabeceraName: string
  requests: BookletRequestSummary[]
}

export type ProductAvailability = { productId: string; available: number }

/** Pending requests grouped by cabecera, sorted by cabecera name. */
export function groupPendingByCabecera(requests: BookletRequestSummary[]): CabeceraGroup[] {
  const groups = new Map<string, CabeceraGroup>()
  for (const request of requests) {
    if (request.status !== 'pending') continue
    const group = groups.get(request.cabeceraCueAnexo) ?? {
      cabeceraCueAnexo: request.cabeceraCueAnexo,
      cabeceraName: request.cabeceraName,
      requests: [],
    }
    group.requests.push(request)
    groups.set(request.cabeceraCueAnexo, group)
  }
  return [...groups.values()].sort((a, b) => a.cabeceraName.localeCompare(b.cabeceraName, 'es'))
}

/** Relative age in Spanish, for example "hace 2 h". Empty when the date is unknown. */
export function formatAge(submittedAt: string | null, now: Date = new Date()): string {
  if (!submittedAt) return ''
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(submittedAt).getTime()) / 60_000))
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`
}

/** Dashed CUE form used on screen: 180123400 -> 1801234-00. Values that are not 9 digits pass through unchanged. */
export function formatCue(cueAnexo: string): string {
  if (!/^\d{9}$/.test(cueAnexo)) return cueAnexo
  return `${cueAnexo.slice(0, 7)}-${cueAnexo.slice(7)}`
}

/** ENOS ficha route takes the dashed CUE form (1801234-57) for a 9-digit CUE (180123457). */
export function fichaEscuelaHref(cueAnexo: string): string | null {
  if (!/^\d{9}$/.test(cueAnexo)) return null
  return `/mapas/infraestructura/escuelas/${cueAnexo.slice(0, 7)}-${cueAnexo.slice(7)}`
}

/**
 * Default approved quantity per product: min(requested, available), floored at 0.
 * Unknown availability falls back to the requested quantity.
 */
export function defaultApprovalQuantities(
  request: BookletRequestSummary,
  availability: ProductAvailability[],
): Record<string, number> {
  return Object.fromEntries(request.requested.map((line) => {
    const known = availability.find((row) => row.productId === line.productId)
    const cap = known ? Math.max(0, known.available) : line.quantity
    return [line.productId, Math.min(line.quantity, cap)]
  }))
}

/** Available quantity per requested product for this request's cabecera, falling back to the global balance. */
export function availabilityFor(request: BookletRequestSummary, balances: BookletBalanceView[]): ProductAvailability[] {
  return request.requested.flatMap((line) => {
    const cabecera = balances.find((row) => row.productId === line.productId && row.cabeceraCueAnexo === request.cabeceraCueAnexo)
    const global = balances.find((row) => row.productId === line.productId && row.cabeceraCueAnexo === null)
    const available = cabecera?.quotaAvailable ?? global?.globalAvailable ?? null
    return available === null ? [] : [{ productId: line.productId, available }]
  })
}
