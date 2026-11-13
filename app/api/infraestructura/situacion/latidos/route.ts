import { staffGuard } from '@/lib/session'
import { obtenerCorridasPorItemSeguro } from '@/lib/infraestructura/riesgo/estado-datos/latidos'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { ruta } from '@/lib/http/ruta'
import { verificarAccesoSeccion } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Sólo lectura: corridas de las últimas 72 h por item del estado de los datos.
// Mismo criterio de acceso que /api/infraestructura/situacion (staff).
async function handleGET() {
  const acceso = await verificarAccesoSeccion('situation')
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  const guard = staffGuard(acceso.user)
  if (guard) return respuestaGuard(guard)

  return Response.json(
    { corridas: await obtenerCorridasPorItemSeguro() },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export const GET = ruta('infraestructura.situacion.latidos.get', handleGET)
