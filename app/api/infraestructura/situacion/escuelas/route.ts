import { staffGuard } from '@/lib/session'
import { nombresDeEscuelas } from '@/lib/infraestructura/riesgo/situacion/nombres-escuelas'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { ruta } from '@/lib/http/ruta'
import { verificarAccesoSeccion } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_CUES = 100

// Sólo lectura: nombres de escuela por CUE-anexo para las listas del Centro de
// Situación (cambios, prioridades). Mismo criterio de acceso que el resto (staff).
async function handleGET(request: Request) {
  const acceso = await verificarAccesoSeccion('situation')
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  const guard = staffGuard(acceso.user)
  if (guard) return respuestaGuard(guard)

  const cues = (new URL(request.url).searchParams.get('cues') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '')
    .slice(0, MAX_CUES)
  return Response.json(
    { nombres: await nombresDeEscuelas(cues) },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export const GET = ruta('infraestructura.situacion.escuelas.get', handleGET)
