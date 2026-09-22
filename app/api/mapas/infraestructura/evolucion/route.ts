import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerEvolucionMapa } from '@/lib/infraestructura/evolucion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    const error = acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
    return Response.json({ error }, { status: acceso.status })
  }

  const resultado = await obtenerEvolucionMapa()

  return Response.json(resultado, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
