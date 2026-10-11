import { calcularResumen } from '@/lib/infraestructura/radar-meteo/resumen'
import {
  obtenerRunRadarMeteoAsOf,
  obtenerUltimoRunRadarMeteo,
} from '@/lib/infraestructura/radar-meteo/job-sync'
import { riskRadarEnabled } from '@/lib/infraestructura/riesgo/flags'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { GRID_VERSION } from '@/lib/infraestructura/radar-meteo/grilla'
import { alertasSmnActivas, severidadCAPEnEspanol } from '@/lib/infraestructura/radar-meteo/smn-alertas'
import { alertasAndEnsemble } from '@/lib/infraestructura/radar-meteo/ensemble'
import { obtenerMetricasVerificacion } from '@/lib/infraestructura/radar-meteo/verificacion'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const cache = new Map<string, ReturnType<typeof calcularResumen>>()
const fechaSchema = z.string().datetime({ offset: true })
export async function GET(request: Request) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  if (!riskRadarEnabled()) return Response.json({ error: 'Radar no habilitado' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  const asOf = new URL(request.url).searchParams.get('asOf') ?? undefined
  if (asOf !== undefined && !fechaSchema.safeParse(asOf).success) {
    return jsonError('Parámetro inválido: asOf', 400)
  }
  const run = asOf
    ? await obtenerRunRadarMeteoAsOf(new Date(asOf))
    : await obtenerUltimoRunRadarMeteo()
  // SMN alerts, ensemble and verification are not historized: they always reflect the current state.
  const [alertas, ensemble, verificacion] = await Promise.all([alertasSmnActivas(), alertasAndEnsemble(), obtenerMetricasVerificacion()])
  const fechaLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const etag = `W/"${Buffer.from(`${run?.id ?? 'sin-run'}:${asOf ?? 'ultimo'}:${fechaLocal}:${ensemble?.runId ?? 'sin-ensemble'}:${alertas.map(a=>`${a.id}:${a.fetchedAt}`).join(',')}:${verificacion.estado}:${verificacion.nPares}:${verificacion.nEventos}:${verificacion.sesgoMm}:${verificacion.actualizadoEn ?? 'sin-verificacion'}:resumen-v4`).toString('base64url')}"`
  const headers = { 'Cache-Control': 'private, max-age=300', ETag: etag }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  const alertasSmn = alertas.map(a => ({ id:a.id, nivelSat:a.nivelSat, severidad:severidadCAPEnEspanol(a.severity), severidadCap:a.severity, evento:a.event, headline:a.headline, description:a.description, instruction:a.instruction, sent:a.sent, onset:a.onset, expires:a.expires, departamentos:a.departamentos }))
  if (!run) return Response.json({ runId: null, runAt: null, frescura: null, dias: [], departamentos: [], umbrales: {}, alertasSmn, verificacion, ensamble: ensemble ? {runId:ensemble.runId,runAt:ensemble.runAt,modelo:ensemble.modelo} : null, sinDatos: true, razon: asOf ? 'No hay pronóstico publicado hasta ese momento.' : 'Todavía no se cargó ningún pronóstico.' }, { headers })
  const cacheKey = `${run.id}:${fechaLocal}`
  let resumen = cache.get(cacheKey)
  if (!resumen) {
    resumen = calcularResumen(run.payload as Parameters<typeof calcularResumen>[0])
    cache.clear()
    cache.set(cacheKey, resumen)
  }
  const edadMinutos = Math.max(0, Math.floor((Date.now() - Date.parse(run.runAt)) / 60000))
  const departamentos = resumen.departamentos.map(d => ({...d, dias:d.dias.map(day=>({...day,ensamble:ensemble?.diarios?.[d.id]?.[day.fecha] ?? null}))}))
  return Response.json({ runId: run.id, runAt: run.runAt, frescura: asOf ? null : { edadMinutos, desactualizado: edadMinutos > 420 }, gridVersion: run.gridVersion ?? GRID_VERSION, ...resumen, departamentos, alertasSmn, verificacion, ensamble: ensemble ? {runId:ensemble.runId,runAt:ensemble.runAt,modelo:ensemble.modelo} : null, sinDatos: false }, { headers })
}
