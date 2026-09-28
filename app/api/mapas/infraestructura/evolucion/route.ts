import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerEvolucionMapa } from '@/lib/infraestructura/evolucion'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    const error = acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
    return Response.json({ error }, { status: acceso.status })
  }

  const resultado = await obtenerEvolucionMapa()

  return jsonComprimido(request, resultado, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
