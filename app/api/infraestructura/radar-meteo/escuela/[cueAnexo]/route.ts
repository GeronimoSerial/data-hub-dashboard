import { normalizeCue } from '@/lib/infraestructura/cue'
import { listarEscuelasMapa } from '@/lib/infraestructura/parte-mapa'
import { obtenerUltimoRunRadarMeteo } from '@/lib/infraestructura/radar-meteo/job-sync'
import { pronosticoEscuela } from '@/lib/infraestructura/radar-meteo/escuela'
import { riskRadarEnabled } from '@/lib/infraestructura/riesgo/flags'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request, context: { params: Promise<{ cueAnexo: string }> }) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  if (!riskRadarEnabled()) return Response.json({ error: 'Radar no habilitado' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  const { cueAnexo } = await context.params
  if (!normalizeCue(cueAnexo)) return Response.json({ error: 'CUE inválido' }, { status: 400 })
  const { escuelas } = await listarEscuelasMapa({ cueAnexo })
  const escuela = escuelas.find((e) => e.cueAnexo === cueAnexo)
  if (!escuela) return Response.json({ error: 'Escuela no encontrada' }, { status: 404 })
  if (escuela.lat === null || escuela.lon === null) return Response.json({ error: 'La escuela no tiene coordenadas válidas', cueAnexo, departamento: escuela.departamento }, { status: 422 })
  const run = await obtenerUltimoRunRadarMeteo()
  if (!run) return Response.json({ cueAnexo, runId: null, runAt: null, sinDatos: true, razon: 'Todavía no se cargó ningún pronóstico.' })
  const payload = run.payload as Parameters<typeof pronosticoEscuela>[0]
  const etag = `W/"${Buffer.from(`${run.id}:${cueAnexo}`).toString('base64url')}"`
  const headers = { 'Cache-Control': 'private, max-age=300', ETag: etag }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  const pronostico = pronosticoEscuela(payload, { cueAnexo, nombre: escuela.nombre, lat: escuela.lat, lon: escuela.lon, departamento: escuela.departamento })
  return Response.json({ ...pronostico, runId: run.id, runAt: run.runAt, frescura: { edadMinutos: Math.max(0, Math.floor((Date.now() - Date.parse(run.runAt)) / 60000)) }, sinDatos: false }, { headers })
}
