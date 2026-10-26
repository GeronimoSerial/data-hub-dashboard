import { alertasSmnActivas, severidadCAPEnEspanol } from '@/lib/infraestructura/radar-meteo/smn-alertas'
import { riskRadarEnabled } from '@/lib/infraestructura/riesgo/flags'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleGET() {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  if (!riskRadarEnabled()) {
    return Response.json(
      { error: 'Radar no habilitado' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const alertas = await alertasSmnActivas()
  const respuesta = alertas.map((alerta) => ({
    id: alerta.id,
    sender: alerta.sender,
    sent: alerta.sent,
    onset: alerta.onset,
    expires: alerta.expires,
    event: alerta.event,
    severity: severidadCAPEnEspanol(alerta.severity),
    severityCap: alerta.severity,
    urgency: alerta.urgency,
    certainty: alerta.certainty,
    headline: alerta.headline,
    description: alerta.description,
    instruction: alerta.instruction,
    nivelSat: alerta.nivelSat,
    departamentos: alerta.departamentos,
    poligonos: alerta.poligonos,
  }))

  return Response.json(
    { alertas: respuesta },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}

export const GET = ruta('infraestructura.radar-meteo.alertas.get', handleGET)
