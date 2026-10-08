import { listarRunsRadarMeteoRecientes } from '@/lib/infraestructura/radar-meteo/job-sync'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { riskRadarEnabled } from '@/lib/infraestructura/riesgo/flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  if (!riskRadarEnabled()) {
    return Response.json(
      { error: 'Radar no habilitado' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const corridas = await listarRunsRadarMeteoRecientes()
  return Response.json({ corridas }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
