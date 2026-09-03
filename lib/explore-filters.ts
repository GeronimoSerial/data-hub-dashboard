import { z } from 'zod'
import type { Formato } from '@/lib/model'

export type ExploreFilters = {
  q?: string
  tema?: string
  nivel?: string
  formato?: Formato
}

export function normalizeExploreText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

/** Normalizes a query for URL serialization without removing search accents. */
export function normalizeExploreQuery(value: string) {
  return value.trim().toLocaleLowerCase('es').slice(0, 80)
}

const formatoSchema = z.enum(['reporte', 'tablero', 'mapa'])

function clean(value: string | null | undefined, allowed?: ReadonlySet<string>) {
  const normalized = value == null ? undefined : normalizeExploreQuery(value)
  if (!normalized || (allowed && !allowed.has(normalized))) return undefined
  return normalized
}

export function parseExploreFilters(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
  allowed: { temas?: ReadonlySet<string>; niveles?: ReadonlySet<string> } = {},
): ExploreFilters {
  const get = (key: string) => {
    if (input instanceof URLSearchParams) return input.get(key) ?? undefined
    const value = input[key]
    return Array.isArray(value) ? value[0] : value
  }
  const formato = formatoSchema.safeParse(clean(get('formato')))
  return {
    q: clean(get('q')),
    tema: clean(get('tema'), allowed.temas),
    nivel: clean(get('nivel'), allowed.niveles),
    formato: formato.success ? formato.data : undefined,
  }
}

export function serializeExploreFilters(filters: ExploreFilters) {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.tema) params.set('tema', filters.tema)
  if (filters.nivel) params.set('nivel', filters.nivel)
  if (filters.formato) params.set('formato', filters.formato)
  return params
}

export function exploreHref(filters: ExploreFilters) {
  const query = serializeExploreFilters(filters).toString()
  return `/explorar${query ? `?${query}` : ''}`
}

const KNOWN_KEYS = ['q', 'tema', 'nivel', 'formato'] as const

/**
 * Returns the canonical search string for the current URL and whether the URL
 * needs normalizing. Canonicalization drops unknown/duplicated/invalid params
 * and enforces stable key order, so shared and back/forward URLs always settle
 * on an equivalent state without breaking the page.
 */
export function canonicalizeExploreSearch(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
  allowed: { temas?: ReadonlySet<string>; niveles?: ReadonlySet<string> } = {},
): { canonical: string; changed: boolean } {
  const filters = parseExploreFilters(input, allowed)
  const canonical = serializeExploreFilters(filters).toString()

  const current = new URLSearchParams()
  const seen = new Set<string>()
  let changed = false
  if (input instanceof URLSearchParams) {
    for (const [key, value] of input.entries()) {
      if (!(KNOWN_KEYS as readonly string[]).includes(key)) {
        changed = true
        continue
      }
      if (seen.has(key)) {
        changed = true
        continue
      }
      seen.add(key)
      current.append(key, value)
    }
  } else {
    for (const [key, raw] of Object.entries(input)) {
      const value = Array.isArray(raw) ? raw[0] : raw
      if (value == null) continue
      if (!(KNOWN_KEYS as readonly string[]).includes(key)) {
        changed = true
        continue
      }
      current.append(key, value)
    }
  }

  return { canonical, changed: changed || current.toString() !== canonical }
}
