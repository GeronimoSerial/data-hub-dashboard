import path from 'node:path'
import { unlink } from 'node:fs/promises'
import { puedeAbrir, type RecursoAccess, type SessionUser } from '@/lib/acl'
import { getUploadsDir } from '@/lib/data-dir'
import { DOWNLOAD_MIMES } from '@/lib/upload'

export function archivoStorageKey(recursoId: string, fileId: string) {
  return `${recursoId}/${fileId}`
}

export function archivoAbsPath(storageKey: string): string | null {
  if (!storageKey || storageKey.includes('..') || path.isAbsolute(storageKey)) {
    return null
  }
  const root = path.resolve(getUploadsDir())
  const abs = path.resolve(root, storageKey)
  if (abs !== root && !abs.startsWith(root + path.sep)) return null
  return abs
}

export function archivoGate(
  user: SessionUser | null,
  recurso: RecursoAccess | null,
  hasBlob: boolean,
): 401 | 403 | 404 | 200 {
  if (!user) return 401
  if (!recurso) return 404
  if (!puedeAbrir(user, recurso)) return 403
  if (!hasBlob) return 404
  return 200
}

function safeFilename(name: string) {
  const trimmed = name.trim() || 'archivo'
  return trimmed.replace(/[\r\n"]/g, '_')
}

export function archivoResponseHeaders(opts: {
  mime: string
  nombreOriginal: string
  download: boolean
}): Record<string, string> {
  const attachment =
    opts.download || (DOWNLOAD_MIMES as readonly string[]).includes(opts.mime)
  const disposition = attachment ? 'attachment' : 'inline'
  const filename = safeFilename(opts.nombreOriginal)
  return {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "frame-ancestors 'self'",
    'Content-Type': opts.mime,
    'Content-Disposition': `${disposition}; filename="${filename}"`,
  }
}

export async function unlinkStoredFile(storageKey: string | null | undefined) {
  const abs = storageKey ? archivoAbsPath(storageKey) : null
  if (!abs) return
  try {
    await unlink(abs)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw err
  }
}

export function storedKeyToUnlink(
  incomingStorageKey?: string | null,
  existingStorageKey?: string | null,
): string | null {
  if (incomingStorageKey?.trim()) return null
  return existingStorageKey?.trim() || null
}
