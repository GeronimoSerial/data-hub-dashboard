// Sincronización horaria de niveles de SGB/SACE para el puerto de Manaus. Descarga
// la serie de 15 minutos y la guarda idempotentemente como fuente 'sgb'.
import { getDb } from '@/lib/db'
import { adquirirLease, publicarResultado } from '../riesgo/job-run'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import { guardarLecturasPrefectura, type LecturaResuelta } from './lecturas-repo'
import {
  ErrorRedSace,
  HttpSaceError,
  RespuestaSaceInvalidaError,
  descargarCotasSace,
  type LecturaSace,
} from './sgb/cliente-sace'
import { ESTACION_SGB_MANAUS } from './sgb/estacion-sgb'

const TIPO_JOB = 'sync-sgb-niveis'
const DURACION_LEASE_MS = 10 * 60 * 1000
const VERSION_CATALOGO = 'sace-amazonas_8-v1'
const PROVIDER_SALUD = 'sgb-niveis'
const TTL_SALUD_MINUTOS = 120
const LICENCIA_SALUD = 'SGB — SACE, dados públicos; atribuição ao SGB; licença por confirmar'
const TOLERANCIA_FUTURO_MS = 15 * 60 * 1000
const LARGO_ERROR_MAX = 250

const ERROR_SIN_LECTURAS = 'La serie de SACE no contiene lecturas'
const ERROR_RED = 'Error de red al consultar SACE'
const ERROR_RESPUESTA = 'La respuesta de SACE no es un CSV válido'
const ERROR_GENERICO = 'Fallo al sincronizar niveles de SGB'
const ERROR_SALUD_GENERICO = 'fallo al sincronizar niveles de SGB'
const ERROR_SALUD_LIMITE = 'SGB limitó las consultas (HTTP 429)'

class SinLecturasSaceError extends Error {
  constructor() {
    super(ERROR_SIN_LECTURAS)
    this.name = 'SinLecturasSaceError'
  }
}

export type ResultadoSyncSgb =
  | { ejecutado: false; estado: 'omitido' }
  | { ejecutado: false; estado: 'fallido'; mensaje: string }
  | { ejecutado: true; estado: 'completo'; contadores: Record<string, number> }

// Mensajes fijos y saneados: nunca se persiste el cuerpo de la respuesta ni el error crudo.
function mensajeSaneado(error: unknown): string {
  if (error instanceof HttpSaceError) return `HTTP ${error.status}`
  if (error instanceof ErrorRedSace) return ERROR_RED
  if (error instanceof RespuestaSaceInvalidaError) return ERROR_RESPUESTA
  if (error instanceof SinLecturasSaceError) return ERROR_SIN_LECTURAS
  return ERROR_GENERICO
}

function mensajeSaludDe(error: unknown): string {
  if (error instanceof HttpSaceError && error.status === 429) return ERROR_SALUD_LIMITE
  return ERROR_SALUD_GENERICO
}

function estadoSaludDe(error: unknown): 'degradado' | 'no_disponible' {
  if (error instanceof HttpSaceError && error.status === 429) return 'degradado'
  if (error instanceof ErrorRedSace) return 'degradado'
  return 'no_disponible'
}

function estadoDe(lecturaM: number): string {
  if (lecturaM >= ESTACION_SGB_MANAUS.evacuacionM) return 'evacuacion'
  if (lecturaM >= ESTACION_SGB_MANAUS.alertaM) return 'alerta'
  return 'normal'
}

// Las lecturas llegan ascendentes; cada fila se compara con la anterior de la serie.
function aLecturasResueltas(lecturas: LecturaSace[], ahora: Date): LecturaResuelta[] {
  const limiteFuturo = ahora.getTime() + TOLERANCIA_FUTURO_MS
  return lecturas.map((lectura, indice) => {
    const anterior = indice > 0 ? lecturas[indice - 1] : undefined
    const medidaMs = Date.parse(lectura.medidaEn)
    const futura = medidaMs > limiteFuturo
    return {
      estacionId: lectura.estacionId,
      lecturaM: lectura.lecturaM,
      variacionM: anterior ? Math.round((lectura.lecturaM - anterior.lecturaM) * 100) / 100 : null,
      // Columna entera: horas completas desde la lectura anterior (0 en pasos de 15 min).
      // periodo_horas es entera: el paso de 15 min no se representa, queda sin valor.
      periodoHoras: null,
      medidaEn: lectura.medidaEn,
      estadoPublicado: estadoDe(lectura.lecturaM),
      lecturaAnteriorM: anterior?.lecturaM ?? null,
      medidaAnteriorEn: anterior?.medidaEn ?? null,
      alertaM: ESTACION_SGB_MANAUS.alertaM,
      evacuacionM: ESTACION_SGB_MANAUS.evacuacionM,
      inconsistente: futura,
      motivosInconsistencia: futura ? ['marca_futura'] : [],
    }
  })
}

// Best-effort: un fallo al escribir la salud nunca altera el resultado del sync.
async function registrarSaludSgb(
  estado: 'ok' | 'degradado' | 'no_disponible',
  ultimoErrorSaneado: string | null,
  ahora: Date,
  filasRecibidas?: number,
) {
  try {
    await actualizarSaludFuente(getDb(), {
      provider: PROVIDER_SALUD,
      ttlMinutos: TTL_SALUD_MINUTOS,
      licencia: LICENCIA_SALUD,
      estado,
      ultimoErrorSaneado,
      ahoraIso: ahora.toISOString(),
      filasRecibidas,
    })
  } catch {
    console.warn('[sync-sgb-niveis] no se pudo registrar la salud de la fuente')
  }
}

export async function syncSgbNiveis(
  opts: { ahora?: Date; fetchImpl?: typeof fetch } = {},
): Promise<ResultadoSyncSgb> {
  const ahora = opts.ahora ?? new Date()
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    // Clave por hora UTC: las invocaciones dentro de la misma hora comparten corrida.
    claveIdempotente: ahora.toISOString().slice(0, 13),
    version: VERSION_CATALOGO,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, estado: 'omitido' }

  try {
    const { lecturas, descartadas } = await descargarCotasSace({ fetchImpl: opts.fetchImpl })
    if (lecturas.length === 0) throw new SinLecturasSaceError()

    const filas = aLecturasResueltas(lecturas, ahora)
    const guardado = await guardarLecturasPrefectura(getDb(), filas, {
      capturadaEn: ahora.toISOString(),
      catalogoVersion: VERSION_CATALOGO,
      fuente: 'sgb',
    })
    const contadores = {
      filasRecibidas: lecturas.length,
      descartadas,
      insertadas: guardado.insertadas,
      duplicadas: guardado.duplicadas,
      inconsistentes: filas.filter((fila) => fila.inconsistente).length,
    }
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores,
      ahora,
    })
    // Lecturas recibidas, no insertadas: un re-sync sin novedades sigue siendo ok.
    await registrarSaludSgb('ok', null, ahora, lecturas.length)
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
    await registrarSaludSgb(estadoSaludDe(error), mensajeSaludDe(error), ahora)
    return { ejecutado: false, estado: 'fallido', mensaje }
  }
}
