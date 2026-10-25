import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { alcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import { cargarTerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET de sólo lectura: capas territoriales estáticas (aislamiento OSM +
// susceptibilidad physrisk) de todo el padrón. NUNCA devuelve datos nominales.
async function handleGET(request: Request) {
  // ACL PRIMERO: nada de tocar la DB de datos sin autorización.
  const acceso = await verificarAccesoLectura({ section: 'infrastructure' })
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  // Sin alcance (operador_establecimiento, baneado): no ve ni capas del mapa.
  if (alcanceMapa(acceso.user).tipo === 'ninguno') {
    return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403 })
  }

  await ensureSeeded()

  const resultado = await cargarTerritorioMapa()

  return jsonComprimido(request, resultado, {
    headers: { 'Cache-Control': 'private, no-cache' },
  })
}

export const GET = ruta('mapas.infraestructura.territorio.get', handleGET)
