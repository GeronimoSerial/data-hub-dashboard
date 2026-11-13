import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
// Sincronización horaria de niveles de ANA (Manaos). Descarga las últimas 48 h de
// cada estación telemétrica y las guarda idempotentemente con fuente 'ana'.
import { getDb } from '@/lib/db'
import { adquirirLease, publicarResultado } from '../riesgo/job-run'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import { type LecturaAna, descargarDadosAna, HttpAnaError } from './ana/cliente-ana'
import {
  type EstacionAna,
  estacionesAnaTelemetricas,
  obtenerVersionCatalogoAna,
} from './estaciones-ana'
import { guardarLecturasPrefectura, type LecturaResuelta } from './lecturas-repo'

const TIPO_JOB = 'sync-ana-niveis'
const FUENTE = 'ana'
const DURACION_LEASE_MS = 10 * 60 * 1000
const VENTANA_MS = 48 * 60 * 60 * 1000
const MARGEN_FUTURO_MS = 15 * 60 * 1000
const PROVIDER_SALUD = 'ana-niveis'
const TTL_SALUD_MINUTOS = 120
const LICENCIA_SALUD = 'ANA — dados públicos (telemetria); atribuição à ANA; licença por confirmar'
const ERROR_GENERICO = 'Fallo al sincronizar niveles de ANA'
const ERROR_LIMITE = 'ANA limitó las consultas (HTTP 429)'
const ERROR_SALUD_PARCIAL = 'fallo parcial al consultar estaciones de ANA'
const LARGO_ERROR_MAX = 250

class FallaTotalAnaError extends Error {
  readonly limite: boolean

  constructor(limite: boolean) {
    super(limite ? ERROR_LIMITE : ERROR_GENERICO)
    this.name = 'FallaTotalAnaError'
    this.limite = limite
  }
}

type EstadoPublicadoAna = 'evacuacion' | 'alerta' | 'normal' | 'sin_umbral'

export type ResultadoSyncAna =
  | { ejecutado: false; estado: 'omitido' }
  | { ejecutado: false; estado: 'fallido'; mensaje: string }
  | { ejecutado: true; estado: 'completo'; contadores: Record<string, number> }

/** Stable key per UTC hour: invocations inside the same hour share one job run. */
export function claveIdempotenteDeHora(ahora: Date): string {
  // ISO UTC is "YYYY-MM-DDTHH:mm:ss.sssZ"; the first 13 characters are the hour block.
  return ahora.toISOString().slice(0, 13)
}

function estadoDe(lecturaM: number, estacion: EstacionAna): EstadoPublicadoAna {
  if (estacion.evacuacionM !== null && lecturaM >= estacion.evacuacionM) return 'evacuacion'
  if (estacion.alertaM !== null && lecturaM >= estacion.alertaM) return 'alerta'
  if (estacion.alertaM === null && estacion.evacuacionM === null) return 'sin_umbral'
  return 'normal'
}

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100
}

// Lecturas de una estación ya ordenadas por el parser. Las filas sin nivel no
// entran en la serie: no tienen variación ni estado.
function filasDeEstacion(
  estacion: EstacionAna,
  lecturas: LecturaAna[],
  ahora: Date,
): { filas: LecturaResuelta[]; sinNivel: number } {
  const filas: LecturaResuelta[] = []
  let sinNivel = 0
  let anterior: { lecturaM: number; medidaEn: string } | null = null
  for (const lectura of lecturas) {
    if (lectura.lecturaM === null) {
      sinNivel += 1
      continue
    }
    const lecturaM = lectura.lecturaM
    const futura = Date.parse(lectura.medidaEn) > ahora.getTime() + MARGEN_FUTURO_MS
    filas.push({
      estacionId: estacion.estacionId,
      lecturaM,
      variacionM: anterior ? redondear2(lecturaM - anterior.lecturaM) : null,
      // periodo_horas es entero y la serie de ANA es cada 15 min: no se guarda.
      periodoHoras: null,
      medidaEn: lectura.medidaEn,
      estadoPublicado: estadoDe(lecturaM, estacion),
      lecturaAnteriorM: anterior?.lecturaM ?? null,
      medidaAnteriorEn: anterior?.medidaEn ?? null,
      alertaM: estacion.alertaM,
      evacuacionM: estacion.evacuacionM,
      inconsistente: futura,
      motivosInconsistencia: futura ? ['marca_futura'] : [],
    })
    anterior = { lecturaM, medidaEn: lectura.medidaEn }
  }
  return { filas, sinNivel }
}

// Best-effort: a failed health write must never change the sync outcome.
async function registrarSaludAna(
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
    console.warn('[sync-ana-niveis] no se pudo registrar la salud de la fuente')
  }
}

export async function syncAnaNiveis(
  opts: { ahora?: Date; fetchImpl?: typeof fetch } = {},
): Promise<ResultadoSyncAna> {
  await cargarReferencias()
  const ahora = opts.ahora ?? new Date()
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: claveIdempotenteDeHora(ahora),
    version: obtenerVersionCatalogoAna(),
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, estado: 'omitido' }

  try {
    const estaciones = estacionesAnaTelemetricas()
    const desde = new Date(ahora.getTime() - VENTANA_MS)
    const errores: unknown[] = []
    const filas: LecturaResuelta[] = []
    let filasRecibidas = 0
    let sinNivel = 0

    // Secuencial: una estación por vez, para no saturar la API de ANA.
    for (const estacion of estaciones) {
      try {
        const lecturas = await descargarDadosAna({
          codigoEstacao: estacion.estacionId,
          desde,
          hasta: ahora,
          fetchImpl: opts.fetchImpl,
        })
        filasRecibidas += lecturas.length
        const resultado = filasDeEstacion(estacion, lecturas, ahora)
        filas.push(...resultado.filas)
        sinNivel += resultado.sinNivel
      } catch (error) {
        errores.push(error)
      }
    }

    const estacionesConError = errores.length
    if (estacionesConError === estaciones.length) {
      throw new FallaTotalAnaError(
        errores.some((error) => error instanceof HttpAnaError && error.status === 429),
      )
    }

    const guardado = await guardarLecturasPrefectura(getDb(), filas, {
      capturadaEn: ahora.toISOString(),
      catalogoVersion: obtenerVersionCatalogoAna(),
      fuente: FUENTE,
    })
    const contadores = {
      filasRecibidas,
      estaciones: estaciones.length,
      estacionesConError,
      insertadas: guardado.insertadas,
      duplicadas: guardado.duplicadas,
      inconsistentes: filas.filter((fila) => fila.inconsistente).length,
      sinNivel,
    }
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores,
      ahora,
    })
    if (estacionesConError > 0) {
      await registrarSaludAna('degradado', ERROR_SALUD_PARCIAL, ahora, filasRecibidas)
    } else {
      await registrarSaludAna('ok', null, ahora, filasRecibidas)
    }
    return { ejecutado: true, estado: 'completo', contadores }
  } catch (error) {
    // Mensajes fijos: nunca se persiste el cuerpo ni el texto de la excepción de red.
    const limite = error instanceof FallaTotalAnaError && error.limite
    const mensaje = error instanceof FallaTotalAnaError ? error.message : ERROR_GENERICO
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: mensaje.slice(0, LARGO_ERROR_MAX),
      ahora,
    })
    await registrarSaludAna(
      limite ? 'degradado' : 'no_disponible',
      limite ? ERROR_LIMITE : ERROR_GENERICO,
      ahora,
    )
    return { ejecutado: false, estado: 'fallido', mensaje }
  }
}
