import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { alcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { referencia, estadoReferencias } from '@/lib/infraestructura/datasets/memoria'
import { filasACsv, type Datos } from '@/lib/infraestructura/datasets/codec'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const acceso = await verificarAccesoLectura({ section: 'infrastructure' })
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  if (alcanceMapa(acceso.user).tipo === 'ninguno') return Response.json({ error: 'Sin acceso al mapa' }, { status: 403 })
  await cargarReferencias()
  try {
    return jsonComprimido(request, {
      eventos: referencia('eventos-inundaciones'), evidenciasCsv: filasACsv(referencia<Datos[]>('evidencias-inundaciones')),
      localidades: referencia('localidades'), localizaciones: referencia('localizaciones'),
      departamentos: referencia('departamentos'), gazetteer: referencia('gazetteer-osm'), estaciones: referencia('estaciones-prefectura'),
      versiones: Object.fromEntries([...estadoReferencias().referencias].map(([id, r]) => [id, r.versionId])),
    }, { headers: { 'Cache-Control': 'private, no-cache' } })
  } catch {
    return Response.json({ error: 'Referencias del mapa sin publicar' }, { status: 503 })
  }
}
