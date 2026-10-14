// Sincronización diaria del histórico de 365 días de Prefectura Naval Argentina para
// las estaciones de corrientes del catálogo. Calcula mediana, p10 y p90 por estación
// y los guarda en hidro_referencia.
import { getDb } from '@/lib/db'
import { adquirirLease, publicarResultado } from '../riesgo/job-run'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import { CATALOGO_ESTACIONES_PREFECTURA } from './estaciones-prefectura'
import { type FilaReferencia, guardarReferencia } from './referencia-repo'
import { USER_AGENT_PREFECTURA } from './prefectura-cliente'
import { estadisticasNivel, parsearHistoricoPrefectura } from './historico-parser'

const TIPO_JOB = 'sync-prefectura-historico'
// Peor caso: ~15 estaciones x (timeout 30 s + espera 2 s) supera 10 min.
const DURACION_LEASE_MS = 30 * 60 * 1000
const VENTANA_DIAS = 365
export const MIN_LECTURAS = 100
const PAUSA_ENTRE_ESTACIONES_MS = 2000
const TIMEOUT_MS = 30_000
const URL_HISTORICO = 'https://contenidosweb.prefecturanaval.gob.ar/alturas/'
const FUENTE = 'prefectura-historico'
const PROVIDER_SALUD = 'prefectura-historico'
const TTL_SALUD_MINUTOS = 36 * 60
const LICENCIA_SALUD = 'Prefectura Naval Argentina — sin términos publicados; atribución a PNA'
const ERROR_TODAS = 'Fallo al sincronizar el histórico de Prefectura en todas las estaciones'
const ERROR_PARCIAL = 'Fallo parcial al sincronizar el histórico de Prefectura'
const ERROR_SALUD_GENERICO = 'fallo al sincronizar el histórico de Prefectura'
const LARGO_ERROR_MAX = 250

export type ResultadoSyncPrefectura =
  | { ejecutado: false; estado: 'omitido' }
  | { ejecutado: false; estado: 'fallido'; mensaje: string }
  | { ejecutado: true; estado: 'completo'; contadores: Record<string, number> }

export type OpcionesSyncHistorico = {
  ahora?: Date
  fetchImpl?: typeof fetch
  esperar?: (ms: number) => Promise<void>
  minLecturas?: number
}

/** Clave idempotente por día UTC: las invocaciones del mismo día comparten una corrida. */
export function claveIdempotenteDeDia(ahora: Date): string {
  return ahora.toISOString().slice(0, 10)
}

const esperarReal = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms))

async function descargarHistorico(
  idHistorico: number,
  fetchImpl: typeof fetch,
): Promise<string> {
  const url = `${URL_HISTORICO}?page=historico&tiempo=${VENTANA_DIAS}&id=${idHistorico}`
  const respuesta = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT_PREFECTURA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
  return respuesta.text()
}

export async function syncPrefecturaHistorico(
  opts: OpcionesSyncHistorico = {},
): Promise<ResultadoSyncPrefectura> {
  const ahora = opts.ahora ?? new Date()
  const fetchImpl = opts.fetchImpl ?? fetch
  const esperar = opts.esperar ?? esperarReal
  const minLecturas = opts.minLecturas ?? MIN_LECTURAS

  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: claveIdempotenteDeDia(ahora),
    version: VENTANA_DIAS.toString(),
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, estado: 'omitido' }

  const estaciones = CATALOGO_ESTACIONES_PREFECTURA.filter(
    (estacion) => estacion.rol === 'corrientes' && estacion.idHistorico != null,
  )
  const contadores = {
    estaciones: estaciones.length,
    estacionesConError: 0,
    estacionesInsuficientes: 0,
    guardadas: 0,
  }

  try {
    const db = getDb()
    for (const [indice, estacion] of estaciones.entries()) {
      if (indice > 0) await esperar(PAUSA_ENTRE_ESTACIONES_MS)
      try {
        const html = await descargarHistorico(estacion.idHistorico, fetchImpl)
        const estadisticas = estadisticasNivel(parsearHistoricoPrefectura(html))
        if (!estadisticas || estadisticas.n < minLecturas) {
          // Se conserva la fila previa de la estación: no se escribe nada.
          contadores.estacionesInsuficientes += 1
          continue
        }
        const fila: FilaReferencia = {
          estacionId: estacion.estacionId,
          ventanaDias: VENTANA_DIAS,
          n: estadisticas.n,
          medianaM: estadisticas.mediana,
          p10M: estadisticas.p10,
          p90M: estadisticas.p90,
          desde: estadisticas.desde,
          hasta: estadisticas.hasta,
          fuente: FUENTE,
          calculadoEn: ahora.toISOString(),
        }
        await guardarReferencia(db, fila)
        contadores.guardadas += 1
      } catch {
        // Fallo por estación: se cuenta y no detiene el resto del lote.
        contadores.estacionesConError += 1
      }
    }

    if (estaciones.length > 0 && contadores.estacionesConError === estaciones.length) {
      throw new Error(ERROR_TODAS)
    }

    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores,
      ahora,
    })
    const parcial = contadores.estacionesConError > 0
    await registrarSalud(parcial ? 'degradado' : 'ok', parcial ? ERROR_PARCIAL : null, ahora)
    return { ejecutado: true, estado: 'completo', contadores }
  } catch {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: ERROR_TODAS.slice(0, LARGO_ERROR_MAX),
      ahora,
    })
    await registrarSalud('no_disponible', ERROR_SALUD_GENERICO, ahora)
    return { ejecutado: false, estado: 'fallido', mensaje: ERROR_TODAS }
  }
}

// Best-effort: un fallo al registrar la salud nunca cambia el resultado del job.
async function registrarSalud(
  estado: 'ok' | 'degradado' | 'no_disponible',
  ultimoErrorSaneado: string | null,
  ahora: Date,
) {
  try {
    await actualizarSaludFuente(getDb(), {
      provider: PROVIDER_SALUD,
      ttlMinutos: TTL_SALUD_MINUTOS,
      licencia: LICENCIA_SALUD,
      estado,
      ultimoErrorSaneado,
      ahoraIso: ahora.toISOString(),
    })
  } catch {
    console.warn('[sync-prefectura-historico] no se pudo registrar la salud de la fuente')
  }
}
