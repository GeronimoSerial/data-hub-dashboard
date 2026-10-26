import { normalizeCue } from '@/lib/infraestructura/cue'
import { listarEscuelasMapa } from '@/lib/infraestructura/parte-mapa'
import { obtenerUltimoRunRadarMeteo } from '@/lib/infraestructura/radar-meteo/job-sync'
import { pronosticoEscuela } from '@/lib/infraestructura/radar-meteo/escuela'
import { riskRadarEnabled } from '@/lib/infraestructura/riesgo/flags'
import { alertasAndEnsemble } from '@/lib/infraestructura/radar-meteo/ensemble'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
async function handleGET(request: Request, context: { params: Promise<{ cueAnexo: string }> }) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  if (!riskRadarEnabled()) return Response.json({ error: 'Radar no habilitado' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  const { cueAnexo } = await context.params
  if (!normalizeCue(cueAnexo)) return Response.json({ error: 'CUE inválido' }, { status: 400 })
  const { escuelas } = await listarEscuelasMapa({ cueAnexo })
  const escuela = escuelas.find((e) => e.cueAnexo === cueAnexo)
  if (!escuela) return Response.json({ error: 'Escuela no encontrada' }, { status: 404 })
  if (escuela.lat === null || escuela.lon === null) {
    return Response.json(
      { error: 'La escuela no tiene coordenadas válidas', cueAnexo, departamento: escuela.departamento },
      { status: 422 },
    )
  }
  const run = await obtenerUltimoRunRadarMeteo()
  if (!run) return Response.json({ cueAnexo, runId: null, runAt: null, sinDatos: true, razon: 'Todavía no se cargó ningún pronóstico.' })
  const payload = run.payload as Parameters<typeof pronosticoEscuela>[0]
  const ensemble = await alertasAndEnsemble()
  const etag = `W/"${Buffer.from(`${run.id}:${ensemble?.runId ?? 'sin-ensemble'}:${cueAnexo}`).toString('base64url')}"`
  const headers = { 'Cache-Control': 'private, max-age=300', ETag: etag }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  const pronostico = pronosticoEscuela(payload, { cueAnexo, nombre: escuela.nombre, lat: escuela.lat, lon: escuela.lon, departamento: escuela.departamento })
  const fechaLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const probabilidad25 = pronostico.departamento.id ? ensemble?.diarios?.[pronostico.departamento.id]?.[fechaLocal]?.pMayor25 ?? null : null
  return Response.json({
    ...pronostico,
    contextoEnsamble: { nivel: 'departamental', probabilidad25, fecha: fechaLocal, modelo: ensemble?.modelo ?? null },
    runId: run.id,
    runAt: run.runAt,
    frescura: { edadMinutos: Math.max(0, Math.floor((Date.now() - Date.parse(run.runAt)) / 60000)) },
    sinDatos: false,
  }, { headers })
}

export const GET = ruta('infraestructura.radar-meteo.escuela.cueAnexo.get', handleGET)
