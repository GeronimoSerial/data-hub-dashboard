// Wrappers de lease sobre la generación y el cierre de veredictos diarios.
// El lease en infra_job_run evita corridas superpuestas y da idempotencia,
// igual que briefing-ia/job.ts. El gating por AI_VEREDICTO_ENABLED vive en
// scripts/jobs.mjs, no acá.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getDb } from '@/lib/db'
import { adquirirLease, publicarResultado } from '@/lib/infraestructura/riesgo/job-run'
import { actualizarSaludFuente, type EstadoSaludFuente } from '@/lib/infraestructura/riesgo/jobs/salud-fuente'
import { fechaArt, sumarDias } from './dia'
import { cerrarDiaAnterior, generarVeredictos, type ResultadoGenerar } from './generar'

const TIPO_JOB_DIARIO = 'veredicto-diario-v0'
const TIPO_JOB_CIERRE = 'veredicto-cierre-v0'
const VERSION_JOB = 'v1'
const DURACION_LEASE_MS = 10 * 60 * 1000
const SLOT_MS = 6 * 60 * 60 * 1000

const PROVEEDOR_SALUD_VEREDICTO = 'veredicto-diario'
const TTL_SALUD_VEREDICTO_MINUTOS = 360
const PROVEEDOR_SALUD_REGISTRO = 'registro-eventos-inundaciones'
const TTL_SALUD_REGISTRO_MINUTOS = 7 * 24 * 60
const RUTA_REGISTRO_EVENTOS = path.join('public', 'data', 'eventos-inundaciones', 'eventos.csv')
// Motivos de la IA que dejan el veredicto en plantilla y lo marcan degradado.
const MOTIVOS_IA_DEGRADADOS = ['timeout', 'http_error', 'json_invalido', 'sin_api_key', 'presupuesto_agotado']

type SaludRegistrada = { estado: EstadoSaludFuente; ultimoErrorSaneado: string | null }

// La salud es telemetría: nunca debe hacer fallar el job.
async function registrarSalud(params: {
  provider: string
  ttlMinutos: number
  licencia: string
  salud: SaludRegistrada
  ahora: Date
}): Promise<void> {
  try {
    await actualizarSaludFuente(getDb(), {
      provider: params.provider,
      ttlMinutos: params.ttlMinutos,
      licencia: params.licencia,
      estado: params.salud.estado,
      ultimoErrorSaneado: params.salud.ultimoErrorSaneado,
      ahoraIso: params.ahora.toISOString(),
    })
  } catch {
    console.warn(`[veredicto] no se pudo registrar la salud de ${params.provider}`)
  }
}

function saludDeResultado(resultado: ResultadoGenerar): SaludRegistrada {
  const partes: string[] = []
  if (resultado.fuentesNoDisponibles.length > 0) {
    partes.push(`fuentes no disponibles: ${resultado.fuentesNoDisponibles.join(', ')}`)
  }
  if (resultado.motivoFallback !== null && MOTIVOS_IA_DEGRADADOS.includes(resultado.motivoFallback)) {
    partes.push(`IA: ${resultado.motivoFallback}`)
  }
  if (partes.length === 0) return { estado: 'ok', ultimoErrorSaneado: null }
  return { estado: 'degradado', ultimoErrorSaneado: partes.join('; ') }
}

function fechaDmaDe(instante: Date): string {
  const [anio, mes, dia] = fechaArt(instante).split('-')
  return `${dia}/${mes}/${anio}`
}

/** Salud del registro manual de eventos: falta, o no se actualiza hace más de 7 días. */
export async function evaluarRegistroEventos(
  ahora: Date,
  ruta: string = RUTA_REGISTRO_EVENTOS,
): Promise<SaludRegistrada> {
  let mtime: Date
  try {
    mtime = (await fs.stat(ruta)).mtime
  } catch {
    return { estado: 'no_disponible', ultimoErrorSaneado: 'registro de eventos no publicado' }
  }
  if (ahora.getTime() - mtime.getTime() > TTL_SALUD_REGISTRO_MINUTOS * 60_000) {
    return {
      estado: 'degradado',
      ultimoErrorSaneado: `registro de eventos sin actualizar desde ${fechaDmaDe(mtime)}`,
    }
  }
  return { estado: 'ok', ultimoErrorSaneado: null }
}

export type ResultadoJobVeredicto =
  | { ejecutado: true; resultado: ResultadoGenerar }
  | { ejecutado: false; motivo: string }

export type ResultadoJobCierreVeredicto =
  | { ejecutado: true; fecha: string }
  | { ejecutado: false; motivo: string }

// Slot de 6h en UTC: todas las corridas dentro del mismo slot comparten clave.
function slotUtc(ahora: Date): string {
  return new Date(Math.floor(ahora.getTime() / SLOT_MS) * SLOT_MS).toISOString()
}

export async function correrJobVeredicto(params?: {
  ahora?: Date
  generar?: typeof generarVeredictos
  rutaRegistroEventos?: string
}): Promise<ResultadoJobVeredicto> {
  const ahora = params?.ahora
  const generar = params?.generar ?? generarVeredictos
  const instanteSalud = ahora ?? new Date()

  const lease = await adquirirLease({
    tipo: TIPO_JOB_DIARIO,
    claveIdempotente: slotUtc(ahora ?? new Date()),
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, motivo: lease.motivo }

  try {
    const resultado = await generar(getDb(), { ahora, jobRunId: lease.jobRunId })
    await registrarSalud({
      provider: PROVEEDOR_SALUD_VEREDICTO,
      ttlMinutos: TTL_SALUD_VEREDICTO_MINUTOS,
      licencia: 'interna',
      salud: saludDeResultado(resultado),
      ahora: instanteSalud,
    })
    await registrarSalud({
      provider: PROVEEDOR_SALUD_REGISTRO,
      ttlMinutos: TTL_SALUD_REGISTRO_MINUTOS,
      licencia: 'registro manual',
      salud: await evaluarRegistroEventos(instanteSalud, params?.rutaRegistroEventos),
      ahora: instanteSalud,
    })

    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: {
        evaluados: resultado.evaluados,
        insertados: resultado.insertados,
        fuenteIa: resultado.fuenteIa,
        fuentePlantilla: resultado.fuentePlantilla,
      },
      ahora,
    })

    return { ejecutado: true, resultado }
  } catch (error) {
    await registrarSalud({
      provider: PROVEEDOR_SALUD_VEREDICTO,
      ttlMinutos: TTL_SALUD_VEREDICTO_MINUTOS,
      licencia: 'interna',
      salud: { estado: 'no_disponible', ultimoErrorSaneado: 'fallo al generar los veredictos' },
      ahora: instanteSalud,
    })
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      // Nunca se persiste el mensaje crudo del error para no filtrar detalles.
      errorSaneado: 'fallo al generar los veredictos',
      ahora,
    })
    throw error
  }
}

export async function correrJobCierreVeredicto(params?: {
  ahora?: Date
}): Promise<ResultadoJobCierreVeredicto> {
  const ahora = params?.ahora ?? new Date()
  const fecha = sumarDias(fechaArt(ahora), -1)

  const lease = await adquirirLease({
    tipo: TIPO_JOB_CIERRE,
    claveIdempotente: fecha,
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora: params?.ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, motivo: lease.motivo }

  try {
    await cerrarDiaAnterior(getDb(), ahora)

    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      ahora: params?.ahora,
    })

    return { ejecutado: true, fecha }
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al cerrar el día de veredictos',
      ahora: params?.ahora,
    })
    throw error
  }
}
