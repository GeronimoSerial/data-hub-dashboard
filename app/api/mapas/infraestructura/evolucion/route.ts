import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerEvolucionMapa } from '@/lib/infraestructura/evolucion'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const resultado = await obtenerEvolucionMapa()

  return jsonComprimido(request, resultado, {
    headers: { 'Cache-Control': 'private, no-cache' },
  })
}
