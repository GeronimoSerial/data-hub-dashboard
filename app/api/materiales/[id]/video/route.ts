import { open, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { materialesPublicados } from '@/lib/materiales'
import { getDataDir } from '@/lib/data-dir'
import { opcionesClienteObs, readObsConfig } from '@/lib/infraestructura/adjuntos/obs'

export const runtime = 'nodejs'

const error503 = () => Response.json({ error: 'No se pudo reproducir el video. Volvé a intentarlo en unos minutos.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const material = materialesPublicados.find(item => item.id === id)
  if (!material || material.tipo !== 'video') return Response.json({ error: 'Material no encontrado.' }, { status: 404 })
  try {
    if (process.env.MATERIALES_STORAGE === 's3') {
      const config = readObsConfig()
      const client = new S3Client(opcionesClienteObs(config))
      try {
        const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: material.storageKey, ResponseContentType: 'video/mp4' }), { expiresIn: 3600 })
        return new Response(null, { status: 307, headers: { Location: url, 'Cache-Control': 'no-store' } })
      } finally {
        client.destroy()
      }
    }
    const file = path.join(getDataDir(), 'materiales', material.archivo)
    const { size } = await stat(file)
    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
    let start = 0
    let end = size - 1
    let status = 200
    if (match && (match[1] || match[2])) {
      if (match[1]) { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), size - 1) }
      else { start = Math.max(size - Number(match[2]), 0) }
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      status = 206
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    }
    headers['Content-Length'] = String(end - start + 1)
    const handle = await open(file, 'r')
    const stream = handle.createReadStream({ start, end, autoClose: true })
    return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers })
  } catch {
    return error503()
  }
}
