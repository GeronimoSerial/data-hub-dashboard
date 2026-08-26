import path from 'node:path'
import { GATED_STATIC_PREFIXES } from '@/lib/nav'

export function gateLookupRuta(requestPath: string) {
  const trimmed = requestPath.replace(/\/+$/, '') || '/'
  for (const prefix of GATED_STATIC_PREFIXES) {
    if (trimmed === `${prefix}/index.html`) return prefix
  }
  return trimmed
}

export function publicAbsPath(requestPath: string): string | null {
  const relative = requestPath.replace(/^\/+/, '')
  if (!relative || relative.includes('\0')) return null
  if (relative.split(/[/\\]/).some((part) => part === '..')) return null
  const root = path.resolve(process.cwd(), 'public')
  const abs = path.resolve(root, relative)
  if (abs !== root && !abs.startsWith(root + path.sep)) return null
  return abs
}

export function gateContentType(filePath: string) {
  if (/\.html?$/i.test(filePath)) return 'text/html; charset=utf-8'
  if (/\.pdf$/i.test(filePath)) return 'application/pdf'
  return 'application/octet-stream'
}

export function gateLoginCallbackUrl(ruta: string, search: string) {
  const query = search.startsWith('?') ? search.slice(1) : search
  if (!query) return ruta
  return `${ruta}?${query}`
}

function firstForwarded(value: string | null) {
  return value?.split(',')[0]?.trim() || ''
}

/** Public origin for redirects behind Coolify (request.url is often 0.0.0.0:3000). */
export function publicOrigin(request: Request) {
  const fromEnv = process.env.BETTER_AUTH_URL?.trim()
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin
    } catch {
      /* fall through */
    }
  }
  const forwardedHost = firstForwarded(request.headers.get('x-forwarded-host'))
  const forwardedProto = firstForwarded(request.headers.get('x-forwarded-proto'))
  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`
  }
  const url = new URL(request.url)
  const host = firstForwarded(request.headers.get('host'))
  if (host && host !== '0.0.0.0' && !host.startsWith('0.0.0.0:')) {
    const proto = forwardedProto || (url.protocol === 'https:' ? 'https' : 'http')
    return `${proto}://${host}`
  }
  return url.origin
}
