import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
// Hourly sync of SYNOP precipitation from Ogimet for the Corrientes stations.
// One request per station, sequential and spaced, decoded and stored idempotently.
import { getDb } from '@/lib/db'
import { adquirirLease, publicarResultado } from '../riesgo/job-run'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import { ErrorOgimet, descargarSynopOgimet } from './ogimet-cliente'
import { obtenerEstacionesSynop } from './estaciones-synop'
import { guardarLluviaSynop } from './lluvia-repo'
import { parsearRespuestaOgimet } from './synop-parser'

const TIPO_JOB = 'sync-synop-lluvia'
const VERSION_CATALOGO_SYNOP = 'estaciones-synop-v1'
const DURACION_LEASE_MS = 10 * 60 * 1000
const PAUSA_ENTRE_ESTACIONES_MS = 2000
// Un reintento por estación ante fallas transitorias (timeouts de conexión
// observados hacia Ogimet). Nunca ante 429: respetar el límite de la fuente.
const PAUSA_REINTENTO_MS = 5000
const INTENTOS_POR_ESTACION = 2
const VENTANA_HORAS = 30
const PROVIDER_SALUD = 'ogimet-synop'
const TTL_SALUD_MINUTOS = 120
const LICENCIA_SALUD =
  'Ogimet (ogimet.com) — datos SYNOP OMM/SMN; uso no comercial con atribución, baja tasa de consultas'
const ERROR_SALUD_GENERICO = 'fallo al sincronizar precipitación SYNOP de Ogimet'
const ERROR_SALUD_LIMITE = 'Ogimet limitó las consultas (HTTP 429)'
const ERROR_GENERICO = 'Fallo al sincronizar precipitación SYNOP de Ogimet'
const LARGO_ERROR_MAX = 250

export type ResultadoSyncSynop =
  | { ejecutado: false; estado: 'omitido' }
  | { ejecutado: false; estado: 'fallido'; mensaje: string }
  | { ejecutado: true; estado: 'completo'; contadores: Record<string, number> }

/** Stable key per UTC hour: invocations inside the same hour share one job run. */
function claveIdempotenteDeHora(ahora: Date): string {
  // ISO UTC is "YYYY-MM-DDTHH:mm:ss.sssZ"; the first 13 characters are the hour block.
  return ahora.toISOString().slice(0, 13)
}

// Fixed, sanitized messages only. Parser and network messages are never persisted.
function mensajeSaneado(error: unknown): string {
  if (error instanceof ErrorOgimet) return error.message
  return ERROR_GENERICO
}

function mensajeSaludDe(error: unknown): string {
  if (error instanceof ErrorOgimet && error.status === 429) return ERROR_SALUD_LIMITE
  return ERROR_SALUD_GENERICO
}

// Best-effort: a failed health write must never change the sync outcome.
async function registrarSaludSynop(
  estado: 'ok' | 'degradado',
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
    console.warn('[sync-synop-lluvia] no se pudo registrar la salud de la fuente')
  }
}

const esperarReal = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function syncSynopLluvia(
  opts: {
    ahora?: Date
    fetchImpl?: typeof fetch
    esperar?: (ms: number) => Promise<void>
  } = {},
): Promise<ResultadoSyncSynop> {
  await cargarReferencias()
  const ahora = opts.ahora ?? new Date()
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: claveIdempotenteDeHora(ahora),
    version: VERSION_CATALOGO_SYNOP,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, estado: 'omitido' }

  const esperar = opts.esperar ?? esperarReal
  // Window ends at the start of the current UTC hour, so each run covers whole hours.
  const hasta = new Date(Date.UTC(
    ahora.getUTCFullYear(),
    ahora.getUTCMonth(),
    ahora.getUTCDate(),
    ahora.getUTCHours(),
  ))
  const desde = new Date(hasta.getTime() - VENTANA_HORAS * 60 * 60 * 1000)

  let estacionesConError = 0
  let registros = 0
  let ultimoError: unknown = null

  try {
    for (const [indice, estacion] of obtenerEstacionesSynop().entries()) {
      if (indice > 0) await esperar(PAUSA_ENTRE_ESTACIONES_MS)
      try {
        let cuerpo: string | null = null
        for (let intento = 1; cuerpo === null; intento += 1) {
          try {
            cuerpo = await descargarSynopOgimet({
              wmo: estacion.wmo,
              desde,
              hasta,
              fetchImpl: opts.fetchImpl,
            })
          } catch (error) {
            const limitado = error instanceof ErrorOgimet && error.status === 429
            if (limitado || intento >= INTENTOS_POR_ESTACION) throw error
            await esperar(PAUSA_REINTENTO_MS)
          }
        }
        const decodificados = parsearRespuestaOgimet(cuerpo)
        registros += await guardarLluviaSynop(getDb(), decodificados, ahora.toISOString())
      } catch (error) {
        // One station failing must not abort the rest; it is only counted.
        estacionesConError += 1
        ultimoError = error
      }
    }

    if (estacionesConError === obtenerEstacionesSynop().length) {
      throw ultimoError
    }

    const contadores = {
      estaciones: obtenerEstacionesSynop().length,
      estacionesConError,
      registros,
    }
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores,
      ahora,
    })
    // Corrida parcial: la fuente queda degradada (visible en el panel), nunca "ok".
    if (estacionesConError > 0) {
      await registrarSaludSynop(
        'degradado',
        `${estacionesConError} de ${obtenerEstacionesSynop().length} estaciones sin datos de Ogimet`,
        ahora,
      )
    } else {
      await registrarSaludSynop('ok', null, ahora)
    }
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
    await registrarSaludSynop('degradado', mensajeSaludDe(error), ahora)
    return { ejecutado: false, estado: 'fallido', mensaje }
  }
}
