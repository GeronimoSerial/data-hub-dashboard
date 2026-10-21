import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { materialesPublicados } from '@/lib/materiales'
import { getDataDir } from '@/lib/data-dir'
import { opcionesClienteObs, readObsConfig } from '@/lib/infraestructura/adjuntos/obs'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const material = materialesPublicados.find(item => item.id === id)
  if (!material) return Response.json({ error: 'Material no encontrado.' }, { status: 404 })
  const disposition = `attachment; filename="${material.id}.pdf"`
  try {
    if (process.env.MATERIALES_STORAGE === 's3') {
      const config = readObsConfig()
      const client = new S3Client(opcionesClienteObs(config))
      try {
        const url = await getSignedUrl(client, new GetObjectCommand({
          Bucket: config.bucket,
          Key: material.storageKey,
          ResponseContentType: 'application/pdf',
          ResponseContentDisposition: disposition,
        }), { expiresIn: 300 })
        return new Response(null, { status: 307, headers: { Location: url, 'Cache-Control': 'no-store' } })
      } finally {
        client.destroy()
      }
    }
    const buffer = await readFile(path.join(getDataDir(), 'materiales', material.archivo))
    return new Response(buffer, { headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(buffer.length),
      'Content-Disposition': disposition,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch {
    return Response.json({ error: 'No se pudo descargar el material. Volvé a intentarlo en unos minutos.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } })
  }
}
