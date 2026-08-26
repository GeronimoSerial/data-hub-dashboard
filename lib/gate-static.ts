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
