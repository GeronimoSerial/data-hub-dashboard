import { isAllowedRuta } from '@/lib/recurso-write'

const RESOURCE_FALLBACK_RETURN_TO = '/explorar'

function isSafeInternalHref(raw: string): boolean {
  // A leading slash is not enough: `//host` and backslash variants can be
  // interpreted as a different origin by browsers. Keep the original string
  // so valid query strings and hashes round-trip byte-for-byte.
  if (!raw.startsWith('/') || raw.startsWith('//')) return false
  if (raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw)) return false
  try {
    const parsed = new URL(raw, 'https://hub.internal')
    return parsed.origin === 'https://hub.internal' && parsed.pathname.startsWith('/')
  } catch {
    return false
  }
}

function validLegacyRuta(ruta?: string | null): string | null {
  const trimmed = ruta?.trim()
  return trimmed && isAllowedRuta(trimmed) ? trimmed : null
}

export function resourceCardTarget(recurso: {
  id: string
  storageKey?: string | null
  ruta?: string | null
}): string | null {
  if (recurso.storageKey?.trim()) return `/recursos/${encodeURIComponent(recurso.id)}`
  if (!validLegacyRuta(recurso.ruta)) return null
  return `/recursos/${encodeURIComponent(recurso.id)}`
}

export function normalizeResourceReturnTo(raw?: string | null): string {
  return raw && isSafeInternalHref(raw) ? raw : RESOURCE_FALLBACK_RETURN_TO
}

/** Return a validated legacy/document target for the CTA, never raw DB data. */
export function resourceLegacyTarget(recurso: {
  ruta?: string | null
}): string | null {
  return validLegacyRuta(recurso.ruta)
}

export function withResourceReturnTo(
  target: string,
  returnTo?: string | null,
): string {
  if (!returnTo) return target
  if (!isSafeInternalHref(returnTo)) return target
  const separator = target.includes('?') ? '&' : '?'
  return `${target}${separator}returnTo=${encodeURIComponent(returnTo)}`
}

export function resourceCardHref(
  target: string | null,
  session: { isPending: boolean; hasUser: boolean },
  returnTo?: string | null,
): string | null {
  if (!target || !isSafeInternalHref(target)) return null
  const contextualTarget = withResourceReturnTo(target, returnTo)
  if (session.isPending || session.hasUser) return contextualTarget
  return `/login?callbackUrl=${encodeURIComponent(contextualTarget)}`
}
