import { brotliCompressSync, gzipSync } from 'node:zlib'

export function jsonComprimido(
  request: Request,
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  const body = JSON.stringify(data)
  const aceptaCodificacion = request.headers.get('accept-encoding') ?? ''
  const status = init?.status ?? 200
  const headersBase: Record<string, string> = {
    'Content-Type': 'application/json',
    Vary: 'Accept-Encoding',
    ...init?.headers,
  }

  if (aceptaCodificacion.includes('br')) {
    const comprimido = brotliCompressSync(Buffer.from(body))
    return new Response(comprimido, {
      status,
      headers: { ...headersBase, 'Content-Encoding': 'br' },
    })
  }

  if (aceptaCodificacion.includes('gzip')) {
    const comprimido = gzipSync(Buffer.from(body))
    return new Response(comprimido, {
      status,
      headers: { ...headersBase, 'Content-Encoding': 'gzip' },
    })
  }

  return new Response(body, { status, headers: headersBase })
}
