import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { cargarTerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET de sólo lectura: capas territoriales estáticas (aislamiento OSM +
// susceptibilidad physrisk) de todo el padrón. NUNCA devuelve datos nominales.
export async function GET(request: Request) {
  // ACL PRIMERO: nada de tocar la DB de datos sin autorización.
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()

  const resultado = await cargarTerritorioMapa()

  return jsonComprimido(request, resultado, {
    headers: { 'Cache-Control': 'private, no-cache' },
  })
}
