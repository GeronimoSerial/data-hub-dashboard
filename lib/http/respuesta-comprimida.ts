import { createHash } from 'node:crypto'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

export const BROTLI_QUALITY = 4

function coincideIfNoneMatch(ifNoneMatch: string | null, etag: string): boolean {
  if (ifNoneMatch === null) return false
  for (const candidato of ifNoneMatch.split(',')) {
    const valor = candidato.trim()
    if (valor === '*') return true
    const sinDebil = valor.startsWith('W/') ? valor.slice(2).trim() : valor
    if (sinDebil === etag) return true
  }
  return false
}

export function jsonComprimido(
  request: Request,
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  const body = JSON.stringify(data)
  const aceptaCodificacion = request.headers.get('accept-encoding') ?? ''
  const status = init?.status ?? 200
  const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 22)}"`

  if (status === 200 && coincideIfNoneMatch(request.headers.get('if-none-match'), etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        Vary: 'Accept-Encoding',
        ETag: etag,
        ...init?.headers,
      },
    })
  }

  const headersBase: Record<string, string> = {
    'Content-Type': 'application/json',
    Vary: 'Accept-Encoding',
    ETag: etag,
    ...init?.headers,
  }

  if (aceptaCodificacion.includes('br')) {
    const comprimido = brotliCompressSync(Buffer.from(body), {
      params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
    })
    return new Response(comprimido, {
      status,
      headers: { ...headersBase, 'Content-Encoding': 'br' },
    })
  }

  if (aceptaCodificacion.includes('gzip')) {
    const comprimido = gzipSync(Buffer.from(body), { level: 6 })
    return new Response(comprimido, {
      status,
      headers: { ...headersBase, 'Content-Encoding': 'gzip' },
    })
  }

  return new Response(body, { status, headers: headersBase })
}
