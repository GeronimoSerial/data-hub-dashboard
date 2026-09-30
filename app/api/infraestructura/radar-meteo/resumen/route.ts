import { calcularResumen } from '@/lib/infraestructura/radar-meteo/resumen'
import { obtenerUltimoRunRadarMeteo } from '@/lib/infraestructura/radar-meteo/job-sync'
import { riskRadarEnabled } from '@/lib/infraestructura/riesgo/flags'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { GRID_VERSION } from '@/lib/infraestructura/radar-meteo/grilla'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const cache = new Map<string, ReturnType<typeof calcularResumen>>()
export async function GET(request: Request) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  if (!riskRadarEnabled()) return Response.json({ error: 'Radar no habilitado' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  const run = await obtenerUltimoRunRadarMeteo()
  const etag = `W/"${Buffer.from(`${run?.id ?? 'sin-run'}:resumen-v1`).toString('base64url')}"`
  const headers = { 'Cache-Control': 'private, max-age=300', ETag: etag }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  if (!run) return Response.json({ runId: null, runAt: null, frescura: null, dias: [], departamentos: [], umbrales: {}, alertasSmn: [], sinDatos: true, razon: 'Todavía no se cargó ningún pronóstico.' }, { headers })
  let resumen = cache.get(run.id)
  if (!resumen) {
    resumen = calcularResumen(run.payload as Parameters<typeof calcularResumen>[0])
    cache.clear()
    cache.set(run.id, resumen)
  }
  const edadMinutos = Math.max(0, Math.floor((Date.now() - Date.parse(run.runAt)) / 60000))
  return Response.json({ runId: run.id, runAt: run.runAt, frescura: { edadMinutos, desactualizado: edadMinutos > 420 }, gridVersion: run.gridVersion ?? GRID_VERSION, ...resumen, alertasSmn: [], sinDatos: false }, { headers })
}
