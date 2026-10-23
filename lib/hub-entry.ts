import type { SessionUser } from '@/lib/acl'
import {
  HUB_DESTINATIONS,
  canUseLanding,
  effectiveSections,
  safeDestination,
  safePathname,
  sectionForPath,
} from '@/lib/hub-sections'

export type HubEntryPolicy = {
  user: SessionUser
  /** This must compose the existing role/resource/territorial ACL for a path. */
  allowedByExistingAcl: (path: string) => boolean | Promise<boolean>
  /** Resource viewers need trusted resource metadata to classify their section. */
  allowedByHubPolicy?: (path: string) => boolean | Promise<boolean>
}

/** Parse an internal return target without allowing URL parser path normalization to hide traversal. */
export function safeInternalReturnTo(value: unknown): { pathname: string; search: string; href: string } | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  if (/[\\\u0000-\u001f\u007f]/.test(value) || /%2f|%5c/i.test(value)) return null
  const [pathAndQuery, hash] = value.split('#', 2)
  if (hash !== undefined) return null
  const queryAt = pathAndQuery.indexOf('?')
  const rawPath = queryAt < 0 ? pathAndQuery : pathAndQuery.slice(0, queryAt)
  const search = queryAt < 0 ? '' : pathAndQuery.slice(queryAt)
  let decoded = rawPath
  try {
    for (let i = 0; i < 2; i++) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
  } catch {
    return null
  }
  if (/[\\\u0000-\u001f\u007f]/.test(decoded) || /%2f|%5c/i.test(decoded) || decoded.startsWith('//') || decoded.split('/').some((part) => part === '.' || part === '..')) return null
  if (/[\u0000-\u001f\u007f]/.test(search)) return null
  const pathname = safePathname(rawPath)
  if (!pathname) return null
  return { pathname, search, href: `${rawPath}${search}` }
}

export function pathAllowedByHubPolicy(path: string, user: SessionUser): boolean {
  if (user.banned) return false
  const section = sectionForPath(path)
  if (section === 'landing') return canUseLanding(user.hubPolicy ?? {})
  if (section) return effectiveSections(user.hubPolicy ?? {}).has(section)
  return path === '/problematicas/parte/nuevo' && user.role === 'operador_establecimiento'
}

/** Resolve callback, GE entry, configured destination, then a safe permitted fallback. */
export async function resolveHubEntry({
  user,
  allowedByExistingAcl,
  allowedByHubPolicy = (path) => pathAllowedByHubPolicy(path, user),
  callbackUrl,
  currentPath,
}: HubEntryPolicy & { callbackUrl?: unknown; currentPath?: string }): Promise<string | null> {
  if (user.banned) return null
  const isAllowed = async (path: string) => path !== currentPath && await allowedByHubPolicy(path) && await allowedByExistingAcl(path)

  const callback = safeInternalReturnTo(callbackUrl)
  if (callback && await isAllowed(callback.pathname)) return callback.href

  // GE's existing operator workflow remains the first default after SSO.
  const geDestination = user.role === 'operador_establecimiento' && user.cueAnexo
    ? '/problematicas/parte/nuevo'
    : null
  const preferred = geDestination ?? user.hubDestination
  if (preferred) {
    const destination = safeDestination({
      policy: user.hubPolicy ?? {},
      destination: preferred,
      allowedByExistingAcl: (path) => path !== currentPath && pathAllowedByHubPolicy(path, user),
    })
    if (destination && await allowedByExistingAcl(destination.path)) return destination.path
  }

  if (canUseLanding(user.hubPolicy ?? {}) && await isAllowed('/')) return '/'
  for (const entry of HUB_DESTINATIONS) {
    if (entry.kind === 'landing' || entry.kind === 'special') continue
    if (await isAllowed(entry.path)) return entry.path
  }
  return null
}
