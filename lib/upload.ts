export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export const VIEWER_MIMES = [
  'application/pdf',
  'text/html',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export const DOWNLOAD_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function isAllowedUpload(file: {
  type: string
  size: number
  name: string
}): { ok: true; mime: string } | { ok: false; error: string } {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'El archivo supera 50 MB' }
  }
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
    return { ok: false, error: 'SVG no permitido' }
  }
  const ext = lower.slice(lower.lastIndexOf('.'))
  const mime = file.type || EXT_MIME[ext] || ''
  const allowed = new Set<string>([...VIEWER_MIMES, ...DOWNLOAD_MIMES])
  if (!allowed.has(mime)) {
    return { ok: false, error: 'Tipo de archivo no permitido' }
  }
  return { ok: true, mime }
}

export function isViewerMime(mime: string) {
  return (VIEWER_MIMES as readonly string[]).includes(mime)
}
