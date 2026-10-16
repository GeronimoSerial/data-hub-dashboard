import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
// Hourly sync of the Prefectura Naval Argentina heights table. Keeps only the
// rows that resolve to the Corrientes catalogue and stores them idempotently.
import { getDb } from '@/lib/db'
import { adquirirLease, publicarResultado } from '../riesgo/job-run'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import { obtenerVersionCatalogoPrefectura, buscarEstacionPrefectura } from './estaciones-prefectura'
import {
  ErrorRedPrefectura,
  HttpPrefecturaError,
  OrigenPrefecturaBloqueadoError,
  clasificarErrorPrefectura,
  descargarAlturasPrefectura,
} from './prefectura-cliente'
import { EstructuraPrefecturaCambiadaError, type FilaAlturaPrefectura } from './prefectura-parser'
import { type LecturaResuelta, guardarLecturasPrefectura } from './lecturas-repo'

const TIPO_JOB = 'sync-prefectura-alturas'
const DURACION_LEASE_MS = 10 * 60 * 1000
const PROVIDER_SALUD = 'prefectura-alturas'
const TTL_SALUD_MINUTOS = 120
const LICENCIA_SALUD = 'Prefectura Naval Argentina — sin términos publicados; atribución a PNA'
const ERROR_SALUD_GENERICO = 'fallo al sincronizar alturas de Prefectura'
const ERROR_SALUD_LIMITE = 'Prefectura limitó las consultas (HTTP 429)'
const ERROR_SIN_CATALOGO = 'La tabla de Prefectura no contiene estaciones del catálogo'
const ERROR_ESTRUCTURA = 'La estructura de la tabla de alturas de Prefectura cambió'
const ERROR_GENERICO = 'Fallo al sincronizar alturas de Prefectura'
const LARGO_ERROR_MAX = 250

class SinEstacionesCatalogoError extends Error {
  constructor() {
    super(ERROR_SIN_CATALOGO)
    this.name = 'SinEstacionesCatalogoError'
  }
}

export type ResultadoSyncPrefectura =
  | { ejecutado: false; estado: 'omitido' }
  | { ejecutado: false; estado: 'fallido'; mensaje: string }
  | { ejecutado: true; estado: 'completo'; contadores: Record<string, number> }

/** Stable key per UTC hour: invocations inside the same hour share one job run. */
export function claveIdempotenteDeHora(ahora: Date): string {
  // ISO UTC is "YYYY-MM-DDTHH:mm:ss.sssZ"; the first 13 characters are the hour block.
  return ahora.toISOString().slice(0, 13)
}

// Fixed, sanitized messages only. Parser messages embed page text, so they are
// never persisted; the response body never reaches errorSaneado.
function mensajeSaneado(error: unknown): string {
  if (error instanceof HttpPrefecturaError) return `HTTP ${error.status}`
  if (error instanceof ErrorRedPrefectura) return error.message
  if (error instanceof OrigenPrefecturaBloqueadoError) return error.message
  if (error instanceof SinEstacionesCatalogoError) return ERROR_SIN_CATALOGO
  if (error instanceof EstructuraPrefecturaCambiadaError) return ERROR_ESTRUCTURA
  return ERROR_GENERICO
}

function mensajeSaludDe(error: unknown): string {
  if (error instanceof HttpPrefecturaError && error.status === 429) return ERROR_SALUD_LIMITE
  return ERROR_SALUD_GENERICO
}

function resolverCatalogo(filas: FilaAlturaPrefectura[]): {
  resueltas: LecturaResuelta[]
  desconocidas: number
} {
  const resueltas: LecturaResuelta[] = []
  for (const fila of filas) {
    const estacion = buscarEstacionPrefectura(fila)
    if (estacion) resueltas.push({ ...fila, estacionId: estacion.estacionId })
  }
  return { resueltas, desconocidas: filas.length - resueltas.length }
}

// Best-effort: a failed health write must never change the sync outcome.
async function registrarSaludPrefectura(
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
    console.warn('[sync-prefectura-alturas] no se pudo registrar la salud de la fuente')
  }
}

export async function syncPrefecturaAlturas(
  opts: {
    ahora?: Date
    fetchImpl?: typeof fetch
    esperar?: (ms: number) => Promise<void>
  } = {},
): Promise<ResultadoSyncPrefectura> {
  await cargarReferencias()
  const ahora = opts.ahora ?? new Date()
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: claveIdempotenteDeHora(ahora),
    version: obtenerVersionCatalogoPrefectura(),
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, estado: 'omitido' }

  try {
    const filas = await descargarAlturasPrefectura({
      fetchImpl: opts.fetchImpl,
      esperar: opts.esperar,
    })
    const { resueltas, desconocidas } = resolverCatalogo(filas)
    // A page with rows but no catalogue station means the table likely changed:
    // report a failure instead of a success over nothing processed.
    if (resueltas.length === 0) throw new SinEstacionesCatalogoError()

    const guardado = await guardarLecturasPrefectura(getDb(), resueltas, {
      capturadaEn: ahora.toISOString(),
      catalogoVersion: obtenerVersionCatalogoPrefectura(),
    })
    const contadores = {
      filasPublicadas: filas.length,
      estacionesCatalogo: resueltas.length,
      desconocidas,
      insertadas: guardado.insertadas,
      duplicadas: guardado.duplicadas,
      sinFecha: guardado.sinFecha,
      inconsistentes: resueltas.filter((lectura) => lectura.inconsistente).length,
    }
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores,
      ahora,
    })
    await registrarSaludPrefectura('ok', null, ahora)
    return { ejecutado: true, estado: 'completo', contadores }
  } catch (error) {
    const mensaje = mensajeSaneado(error)
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: mensaje.slice(0, LARGO_ERROR_MAX),
      ahora,
    })
    await registrarSaludPrefectura(clasificarErrorPrefectura(error), mensajeSaludDe(error), ahora)
    return { ejecutado: false, estado: 'fallido', mensaje }
  }
}
