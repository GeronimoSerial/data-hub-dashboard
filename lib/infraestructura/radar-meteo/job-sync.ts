import { randomUUID } from 'node:crypto'
import { and, desc, eq, lt, ne, or } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { radarMeteoRun } from '@/lib/db/schema'
import { apiKeyDesdeEntorno, crearControladorCupo } from '../riesgo/providers/cupo-om'
import { adquirirLease, publicarResultado } from '../riesgo/job-run'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import { generarGrilla, GRID_VERSION } from './grilla'
import { obtenerPronosticoRadar, type LoteRadar } from './provider'

const TIPO_JOB = 'sync-radar-meteo'
const DURACION_LEASE_MS = 20 * 60 * 1000
// Cron cada 3 h (ver slotTresHoras): el TTL acompaña esa cadencia.
const PROVIDER_SALUD = 'open-meteo-radar'
const TTL_SALUD_MINUTOS = 240
const LICENCIA_SALUD = 'CC-BY 4.0 no comercial — Open-Meteo + ECMWF, nivel gratuito'
const ERROR_SANEADO = 'fallo al sincronizar radar meteorológico'
type Db = ReturnType<typeof getDb>

export async function obtenerUltimoRunRadarMeteo(db: Db = getDb()) {
  const [fila] = await db.select().from(radarMeteoRun).where(eq(radarMeteoRun.status, 'completo')).orderBy(desc(radarMeteoRun.fetchedAt)).limit(1)
  return fila ?? null
}

function slotTresHoras(ahora: Date): { inicio: Date; clave: string } {
  const inicio = new Date(ahora)
  inicio.setUTCMinutes(0, 0, 0)
  inicio.setUTCHours(Math.floor(inicio.getUTCHours() / 3) * 3)
  return { inicio, clave: inicio.toISOString().slice(0, 13) }
}

function combinar(lotes: LoteRadar[]): LoteRadar {
  const base = lotes[0]
  if (!base || lotes.some((l) => l.times.join() !== base.times.join())) throw new Error('Los lotes no comparten los mismos tiempos')
  const values = Object.fromEntries(Object.keys(base.values).map((v) => [v, lotes.flatMap((l) => l.values[v as keyof typeof l.values])])) as LoteRadar['values']
  return { times: base.times, cells: lotes.flatMap((l) => l.cells), values, units: base.units }
}

export async function ejecutarSyncRadarMeteo(params: { ahora?: Date; celdas?: ReturnType<typeof generarGrilla>; obtener?: typeof obtenerPronosticoRadar } = {}) {
  const db = getDb(), ahora = params.ahora ?? new Date(), { inicio, clave } = slotTresHoras(ahora)
  const idempotencyKey = `open-meteo:best_match:${GRID_VERSION}:${clave}`
  const [existente] = await db.select().from(radarMeteoRun).where(eq(radarMeteoRun.idempotencyKey, idempotencyKey)).limit(1)
  if (existente?.status === 'completo') return { ejecutado: false, celdas: 0, lotes: 0, pesoTotal: 0, runId: existente.id, estado: 'completo' as const }
  const lease = await adquirirLease({ tipo: TIPO_JOB, claveIdempotente: clave, version: GRID_VERSION, duracionLeaseMs: DURACION_LEASE_MS, ahora })
  if (!lease.adquirido) return { ejecutado: false, celdas: 0, lotes: 0, pesoTotal: 0, runId: existente?.id ?? null, estado: 'omitido' as const }
  const celdas = params.celdas ?? generarGrilla()
  const id = existente?.id ?? randomUUID()
  try {
    const apiKey = apiKeyDesdeEntorno()
    const resultado = await (params.obtener ?? obtenerPronosticoRadar)({ celdas, apiKey, cupo: (peso) => crearControladorCupo({ host: 'api', peso, apiKeyPresente: Boolean(apiKey), db }) })
    const payload = combinar(resultado.lotes)
    const fecha = ahora.toISOString()
    const datos = { provider: 'open-meteo', model: 'best_match', gridVersion: GRID_VERSION, runAt: inicio.toISOString(), fetchedAt: fecha, forecastStart: payload.times[0], forecastEnd: payload.times.at(-1)!, stepMinutes: 60, units: payload.units, status: 'completo', idempotencyKey, payload }
    if (existente) await db.update(radarMeteoRun).set(datos).where(eq(radarMeteoRun.id, id))
    else await db.insert(radarMeteoRun).values({ id, ...datos })
    const [ultimoCompleto] = await db
      .select({ id: radarMeteoRun.id })
      .from(radarMeteoRun)
      .where(eq(radarMeteoRun.status, 'completo'))
      .orderBy(desc(radarMeteoRun.fetchedAt))
      .limit(1)
    await db.delete(radarMeteoRun).where(
      and(
        lt(radarMeteoRun.fetchedAt, new Date(ahora.getTime() - 14 * 86400000).toISOString()),
        or(ne(radarMeteoRun.status, 'completo'), ne(radarMeteoRun.id, ultimoCompleto.id)),
      ),
    )
    await publicarResultado({ jobRunId: lease.jobRunId, leaseOwner: lease.leaseOwner, estado: 'completado', contadores: { celdas: celdas.length, lotes: resultado.lotes.length, pesoTotal: resultado.pesoTotal }, ahora })
    await actualizarSaludFuente(db, { provider: PROVIDER_SALUD, ttlMinutos: TTL_SALUD_MINUTOS, licencia: LICENCIA_SALUD, estado: 'ok', ultimoErrorSaneado: null, ahoraIso: ahora.toISOString() })
    return { ejecutado: true, celdas: celdas.length, lotes: resultado.lotes.length, pesoTotal: resultado.pesoTotal, runId: id, estado: 'completo' as const }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    const datos = { provider: 'open-meteo', model: 'best_match', gridVersion: GRID_VERSION, runAt: inicio.toISOString(), fetchedAt: ahora.toISOString(), forecastStart: '', forecastEnd: '', stepMinutes: 60, units: {}, status: 'fallido', idempotencyKey, payload: { error: mensaje.slice(0, 300) } }
    if (existente) await db.update(radarMeteoRun).set(datos).where(eq(radarMeteoRun.id, id))
    else await db.insert(radarMeteoRun).values({ id, ...datos })
    await publicarResultado({ jobRunId: lease.jobRunId, leaseOwner: lease.leaseOwner, estado: 'fallido', errorSaneado: ERROR_SANEADO, ahora })
    // Sin respuesta del proveedor ni su cuerpo: el mensaje persistido es fijo.
    await actualizarSaludFuente(db, { provider: PROVIDER_SALUD, ttlMinutos: TTL_SALUD_MINUTOS, licencia: LICENCIA_SALUD, estado: 'no_disponible', ultimoErrorSaneado: ERROR_SANEADO, ahoraIso: ahora.toISOString() })
    throw error
  }
}
