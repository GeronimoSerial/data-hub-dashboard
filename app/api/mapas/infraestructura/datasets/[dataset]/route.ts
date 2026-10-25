import { filasACsv, type Datos } from '@/lib/infraestructura/datasets/codec'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { alcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { esDatasetReferencia } from '@/lib/infraestructura/datasets/catalogo'
import { leerVersion, listarVersiones } from '@/lib/infraestructura/datasets/repositorio'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
async function handleGET(request: Request, contexto: { params: Promise<{ dataset: string }> }) {
  const acceso = await verificarAccesoLectura({ section: 'infrastructure' })
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  if (alcanceMapa(acceso.user).tipo === 'ninguno') return Response.json({ error: 'Sin acceso al mapa' }, { status: 403 })
  const { dataset } = await contexto.params
  if (!esDatasetReferencia(dataset)) return Response.json({ error: 'Dataset desconocido' }, { status: 404 })
  const query = new URL(request.url).searchParams
  if (query.get('historial') === '1') return Response.json(await listarVersiones(dataset), { headers: { 'Cache-Control': 'private, no-store' } })
  const id = query.get('version') ?? undefined
  if (id && !/^[a-f0-9]{64}$/.test(id)) return Response.json({ error: 'Versión inválida' }, { status: 400 })
  const seleccion = await leerVersion(dataset, id)
  if (!seleccion) return Response.json({ error: id ? 'Versión inexistente' : 'Dataset sin publicar' }, { status: id ? 404 : 503 })
  const headers = { 'Cache-Control': 'private, no-cache', ETag: `W/"${seleccion.version.id}"`, 'X-Dataset-Version': seleccion.version.id }
  const etiquetas = request.headers.get('If-None-Match')?.split(',').map((etiqueta) => etiqueta.trim().replace(/^W\//, '')) ?? []
  if (etiquetas.includes(`"${seleccion.version.id}"`) || etiquetas.includes('*')) return new Response(null, { status: 304, headers })
  if (query.get('formato') === 'csv') {
    if (!Array.isArray(seleccion.documento)) return Response.json({ error: 'El dataset no es tabular' }, { status: 400 })
    return new Response(filasACsv(seleccion.documento as Datos[]), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } })
  }
  return jsonComprimido(request, seleccion.documento, { headers })
}

export const GET = ruta('mapas.infraestructura.datasets.dataset.get', handleGET)
