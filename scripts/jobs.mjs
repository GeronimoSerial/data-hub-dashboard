#!/usr/bin/env node
/**
 * Punto de entrada único de los jobs batch de OPS1 (ENOS 2026/2027):
 * despacha por nombre (`node scripts/jobs.mjs <nombre>`) aplicando gating de
 * flags, lease e idempotencia según el job. Empaquetado en la imagen Docker
 * junto con scripts/ y lib/ (ver Dockerfile), igual que job-diagnostico.mjs;
 * se invoca con `docker exec <contenedor> node scripts/jobs.mjs <nombre>`.
 * Ver docs/ejecucion-enos/OPS1/runbook-scheduler.md.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Mismo hook que scripts/job-diagnostico.mjs: lib/infraestructura/riesgo/job-run.ts
// importa vía alias '@/' y rutas relativas sin extensión, que el resolver
// ESM nativo no completa.
registerTsResolver(root)

const TIPO_GEO_PERFILES = 'geo-perfiles'
const DURACION_LEASE_GEO_PERFILES_MS = 10 * 60 * 1000
const TIPO_ASOCIACION_RIO = 'asociacion-rio-v1'
const DURACION_LEASE_ASOCIACION_RIO_MS = 10 * 60 * 1000
const TIPO_SITUACION_CORTE = 'situacion-corte-v1'
const DURACION_LEASE_SITUACION_CORTE_MS = 10 * 60 * 1000
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const NOMBRES_VALIDOS = [
  'geo-perfiles',
  'asociacion-rio',
  'sync-pronostico-caudal',
  'sync-radar-meteo',
  'verificar-radar-meteo',
  'sync-smn-alertas',
  'sync-radar-ensemble',
  'sync-ensemble',
  'sync-imerg',
  'climatologia-precipitacion',
  'climatologia-caudal',
  'calcular-riesgo',
  'episodios-derivados',
  'sync-seasonal',
  'situacion-corte',
  'briefing-ia',
  'sync-prefectura-alturas',
  'sync-synop-lluvia',
  'sync-prefectura-historico',
]

export class JobDesconocidoError extends Error {
  constructor(nombre) {
    super(`Job desconocido: "${nombre}". Jobs válidos: ${NOMBRES_VALIDOS.join(', ')}`)
    this.name = 'JobDesconocidoError'
  }
}

// El motivo de gating es siempre el mismo, gatee lo que gatee: se imprime un
// WARN a stderr (nunca a stdout, que sólo lleva el JSON del resultado) para
// que quede visible en `journalctl -u enos-ops1@<nombre>.service` por qué un
// job no corrió — sin esto, un timer instalado con ENOS_JOBS_ENABLED=false
// (pausa operativa) sale con éxito silencioso y nada en el log lo explica.
function flagDeshabilitado(nombreJob) {
  console.warn(`[jobs] "${nombreJob}" no ejecutado: ENOS_JOBS_ENABLED=false`)
  return { ejecutado: false, motivo: 'flag_deshabilitado' }
}

// Flag leído por import diferido (no al top-level del módulo): los tests
// necesitan poder mockearlo y fijar process.env antes de la llamada.
//
// Deliberadamente NO se gatea acá con riskEngineEnabled() ni
// episodiosDerivadosEnabled(): esos dos son flags de UI (ver
// lib/infraestructura/jobs/flags.ts), no de ejecución de datos. Gatear los
// jobs programados con ellos dejaba el batch entero sin correr con la
// configuración por defecto documentada — ver runbook-scheduler.md.
async function jobsActivos() {
  const { enosJobsEnabled } = await import('../lib/infraestructura/jobs/flags.ts')
  return enosJobsEnabled()
}

// geo-perfiles no gestiona lease internamente: jobs.mjs lo envuelve con
// adquirirLease/publicarResultado, igual patrón que job-diagnostico.mjs.
async function correrGeoPerfiles(opts) {
  if (!(await jobsActivos())) return flagDeshabilitado('geo-perfiles')

  const { adquirirLease, publicarResultado } = await import(
    '../lib/infraestructura/riesgo/job-run.ts'
  )
  const { calcularGeoPerfiles } = await import('../lib/infraestructura/riesgo/geo-perfil.ts')

  const ahora = opts?.ahora ?? new Date()
  const lease = await adquirirLease({
    tipo: TIPO_GEO_PERFILES,
    claveIdempotente: ahora.toISOString().slice(0, 10),
    version: pkg.version,
    duracionLeaseMs: DURACION_LEASE_GEO_PERFILES_MS,
    ahora,
  })

  if (!lease.adquirido) {
    return { ejecutado: false, motivo: lease.motivo }
  }

  try {
    const resultado = await calcularGeoPerfiles(opts)
    const publicado = await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: {
        procesados: resultado.procesados,
        conPerfilValido: resultado.conPerfilValido,
        excluidos: resultado.excluidos,
      },
    })

    return {
      ejecutado: true,
      procesados: resultado.procesados,
      conPerfilValido: resultado.conPerfilValido,
      excluidos: resultado.excluidos,
      perfilVersion: resultado.perfilVersion,
      leasePerdido: !publicado,
    }
  } catch (error) {
    const errorSaneado =
      error instanceof Error ? error.message : 'Error desconocido en job geo-perfiles'
    // Best-effort: si publicarResultado también tira (o el lease se perdió y
    // devuelve false sin pisar nada), no debe reemplazar el error original.
    try {
      await publicarResultado({
        jobRunId: lease.jobRunId,
        leaseOwner: lease.leaseOwner,
        estado: 'fallido',
        errorSaneado,
      })
    } catch {
      // Ignorado a propósito: se relanza el error original de calcularGeoPerfiles.
    }
    throw error
  }
}

// asociacion-rio calcula a partir de infra_geo_profile, por lo que su timer
// debe ejecutarse después de geo-perfiles. El lease diario evita cálculos
// simultáneos y reintentos duplicados, igual que en geo-perfiles.
async function correrAsociacionRio(opts) {
  if (!(await jobsActivos())) return flagDeshabilitado('asociacion-rio')

  const { adquirirLease, publicarResultado } = await import(
    '../lib/infraestructura/riesgo/job-run.ts'
  )
  const { calcularAsociacionesRio } = await import(
    '../lib/infraestructura/riesgo/rio-asociacion.ts'
  )
  const ahora = opts?.ahora ?? new Date()
  const lease = await adquirirLease({
    tipo: TIPO_ASOCIACION_RIO,
    claveIdempotente: ahora.toISOString().slice(0, 10),
    version: pkg.version,
    duracionLeaseMs: DURACION_LEASE_ASOCIACION_RIO_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, motivo: lease.motivo }

  try {
    const resultado = await calcularAsociacionesRio(opts)
    const publicado = await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: {
        procesados: resultado.procesados,
        conPunto: resultado.conPunto,
        sinPunto: resultado.sinPunto,
      },
    })
    return { ejecutado: true, ...resultado, leasePerdido: !publicado }
  } catch (error) {
    const errorSaneado =
      error instanceof Error ? error.message : 'Error desconocido en job asociacion-rio'
    try {
      await publicarResultado({
        jobRunId: lease.jobRunId,
        leaseOwner: lease.leaseOwner,
        estado: 'fallido',
        errorSaneado,
      })
    } catch {
      // Se conserva el error original del cálculo.
    }
    throw error
  }
}

// situacion-corte no gestiona lease internamente: jobs.mjs lo envuelve con
// adquirirLease/publicarResultado, igual patrón que correrGeoPerfiles.
async function correrSituacionCorte(opts) {
  if (!(await jobsActivos())) return flagDeshabilitado('situacion-corte')

  const { adquirirLease, publicarResultado } = await import(
    '../lib/infraestructura/riesgo/job-run.ts'
  )
  const { generarCorte } = await import('../lib/infraestructura/riesgo/situacion/corte.ts')

  const ahora = opts?.ahora ?? new Date()
  // Clave idempotente por HORA UTC (no por día, como geo-perfiles): el job
  // corre cada hora, dos invocaciones dentro de la misma hora comparten el
  // mismo job run y sólo una genera el corte.
  const claveIdempotente = ahora.toISOString().slice(0, 13) // 'YYYY-MM-DDTHH'
  const lease = await adquirirLease({
    tipo: TIPO_SITUACION_CORTE,
    claveIdempotente,
    version: pkg.version,
    duracionLeaseMs: DURACION_LEASE_SITUACION_CORTE_MS,
    ahora,
  })

  if (!lease.adquirido) {
    return { ejecutado: false, motivo: lease.motivo }
  }

  try {
    const resultado = await generarCorte({ ahora, jobRunId: lease.jobRunId })
    const publicado = await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: {
        episodiosAbiertos: resultado.episodiosAbiertos,
        episodiosCerradosDesdeAnterior: resultado.episodiosCerradosDesdeAnterior,
        escuelasRiesgoAlto24h: resultado.kpis.escuelasRiesgoAlto24h,
      },
    })

    return {
      ejecutado: true,
      corteId: resultado.corteId,
      generadoEn: resultado.generadoEn,
      leasePerdido: !publicado,
    }
  } catch (error) {
    const errorSaneado =
      error instanceof Error ? error.message : 'Error desconocido en job situacion-corte'
    try {
      await publicarResultado({
        jobRunId: lease.jobRunId,
        leaseOwner: lease.leaseOwner,
        estado: 'fallido',
        errorSaneado,
      })
    } catch {
      // Ignorado a propósito: se relanza el error original.
    }
    throw error
  }
}

async function correrSyncPronosticoCaudal() {
  if (!(await jobsActivos())) return flagDeshabilitado('sync-pronostico-caudal')
  const { ejecutarSyncPronosticoCaudal } = await import(
    '../lib/infraestructura/riesgo/jobs/sync-pronostico-caudal.ts'
  )
  return ejecutarSyncPronosticoCaudal()
}

async function correrSyncRadarMeteo(opts) {
  if (!(await jobsActivos())) return flagDeshabilitado('sync-radar-meteo')
  const { ejecutarSyncRadarMeteo } = await import('../lib/infraestructura/radar-meteo/job-sync.ts')
  return ejecutarSyncRadarMeteo(opts)
}

async function correrVerificarRadarMeteo(opts) {
  if (!(await jobsActivos())) return flagDeshabilitado('verificar-radar-meteo')
  const { ejecutarVerificacionRadarMeteo } = await import('../lib/infraestructura/radar-meteo/verificacion.ts')
  return ejecutarVerificacionRadarMeteo(opts)
}

async function correrSyncSmnAlertas() {
  if (!(await jobsActivos())) return flagDeshabilitado('sync-smn-alertas')
  const { syncSmnAlertas } = await import('../lib/infraestructura/radar-meteo/smn-alertas.ts')
  return syncSmnAlertas()
}

// El job gestiona su propio lease por hora UTC y devuelve un resultado en lugar
// de lanzar en fallas controladas: codigoSalida traduce `fallido` a exit 1.
async function correrSyncPrefecturaAlturas() {
  if (!(await jobsActivos())) return flagDeshabilitado('sync-prefectura-alturas')
  const { syncPrefecturaAlturas } = await import(
    '../lib/infraestructura/hidrometria/sync-prefectura-alturas.ts'
  )
  return syncPrefecturaAlturas()
}

// Lluvia SYNOP vía Ogimet: lease propio por hora UTC, una consulta por estación.
async function correrSyncSynopLluvia() {
  if (!(await jobsActivos())) return flagDeshabilitado('sync-synop-lluvia')
  const { syncSynopLluvia } = await import('../lib/infraestructura/lluvia-estaciones/sync-synop-lluvia.ts')
  return syncSynopLluvia()
}

// Histórico de Prefectura: lease propio por día UTC, una consulta por estación.
async function correrSyncPrefecturaHistorico() {
  if (!(await jobsActivos())) return flagDeshabilitado('sync-prefectura-historico')
  const { syncPrefecturaHistorico } = await import(
    '../lib/infraestructura/hidrometria/sync-prefectura-historico.ts'
  )
  return syncPrefecturaHistorico()
}

async function correrSyncRadarEnsemble(opts) {
  if (!(await jobsActivos())) return flagDeshabilitado('sync-radar-ensemble')
  const { ejecutarSyncRadarEnsemble } = await import('../lib/infraestructura/radar-meteo/ensemble.ts')
  return ejecutarSyncRadarEnsemble(opts)
}

async function correrSyncEnsemble() {
  if (!(await jobsActivos())) return flagDeshabilitado('sync-ensemble')
  const { ejecutarSyncEnsemble } = await import(
    '../lib/infraestructura/riesgo/jobs/sync-ensemble.ts'
  )
  return ejecutarSyncEnsemble()
}

async function correrSyncSeasonal() {
  if (!(await jobsActivos())) return flagDeshabilitado('sync-seasonal')
  const { ejecutarSyncSeasonal } = await import(
    '../lib/infraestructura/riesgo/jobs/sync-seasonal.ts'
  )
  return ejecutarSyncSeasonal()
}

async function correrSyncImerg() {
  if (!(await jobsActivos())) return flagDeshabilitado('sync-imerg')
  const { ejecutarSyncImerg } = await import('../lib/infraestructura/riesgo/jobs/sync-imerg.ts')
  // El job recibe el token por parámetro (nunca lee process.env por su cuenta,
  // ver comentario en sync-imerg.ts): el proceso que lo invoca lee EARTHDATA_TOKEN
  // del entorno del contenedor y se lo pasa explícitamente.
  return ejecutarSyncImerg({ earthdataToken: process.env.EARTHDATA_TOKEN })
}

async function correrCalculoClimatologia() {
  if (!(await jobsActivos())) return flagDeshabilitado('climatologia-precipitacion')
  const { ejecutarCalculoClimatologia } = await import(
    '../lib/infraestructura/riesgo/jobs/calcular-climatologia.ts'
  )
  return ejecutarCalculoClimatologia()
}

async function correrCalculoClimatologiaCaudal() {
  if (!(await jobsActivos())) return flagDeshabilitado('climatologia-caudal')
  const { ejecutarCalculoClimatologiaCaudal } = await import(
    '../lib/infraestructura/riesgo/jobs/calcular-climatologia-caudal.ts'
  )
  return ejecutarCalculoClimatologiaCaudal()
}

async function correrCalcularRiesgo() {
  if (!(await jobsActivos())) return flagDeshabilitado('calcular-riesgo')
  const { calcularYPublicarRiesgo } = await import(
    '../lib/infraestructura/riesgo/jobs/calcular-riesgo.ts'
  )
  return calcularYPublicarRiesgo()
}

async function correrEpisodiosDerivados() {
  if (!(await jobsActivos())) return flagDeshabilitado('episodios-derivados')
  const { correrJobEpisodiosDerivados } = await import(
    '../lib/infraestructura/episodios-derivados/job.ts'
  )
  return correrJobEpisodiosDerivados()
}

// briefing-ia gestiona su propio lease internamente (igual que
// episodios-derivados): jobs.mjs sólo lo invoca.
async function correrBriefingIA() {
  if (!(await jobsActivos())) return flagDeshabilitado('briefing-ia')
  const { correrJobBriefingIA } = await import('../lib/infraestructura/briefing-ia/job.ts')
  return correrJobBriefingIA()
}

export async function correrJob(nombre, opts) {
  if (!NOMBRES_VALIDOS.includes(nombre)) {
    throw new JobDesconocidoError(nombre)
  }

  if (!(await jobsActivos())) {
    return flagDeshabilitado(nombre)
  }

  // El job programado corre en su PROPIO proceso Node (systemd timer ->
  // scripts/jobs.mjs -> job.ts), así que NO comparte el `seedPromise`
  // memoizado del proceso web: la migración de esquema nunca corrió en este
  // proceso y hay que dispararla acá, una sola vez, antes de tocar la DB.
  // Sin esto, una base legacy sin la columna `auditoria_fallback` de
  // infra_briefing hace fallar al job al persistir (ver
  // docs/ejecucion-enos/E8/revision-3.md, Tarea 3c).
  const { ensureSeeded } = await import('../lib/db/seed.ts')
  await ensureSeeded()

  switch (nombre) {
    case 'geo-perfiles':
      return correrGeoPerfiles(opts)
    case 'asociacion-rio':
      return correrAsociacionRio(opts)
    case 'sync-pronostico-caudal':
      return correrSyncPronosticoCaudal()
    case 'sync-radar-meteo':
      return correrSyncRadarMeteo(opts)
    case 'verificar-radar-meteo':
      return correrVerificarRadarMeteo(opts)
    case 'sync-smn-alertas':
      return correrSyncSmnAlertas()
    case 'sync-radar-ensemble':
      return correrSyncRadarEnsemble(opts)
    case 'sync-ensemble':
      return correrSyncEnsemble()
    case 'sync-imerg':
      return correrSyncImerg()
    case 'climatologia-precipitacion':
      return correrCalculoClimatologia()
    case 'climatologia-caudal':
      return correrCalculoClimatologiaCaudal()
    case 'calcular-riesgo':
      return correrCalcularRiesgo()
    case 'episodios-derivados':
      return correrEpisodiosDerivados()
    case 'sync-seasonal':
      return correrSyncSeasonal()
    case 'situacion-corte':
      return correrSituacionCorte(opts)
    case 'briefing-ia':
      return correrBriefingIA()
    case 'sync-prefectura-alturas':
      return correrSyncPrefecturaAlturas()
    case 'sync-synop-lluvia':
      return correrSyncSynopLluvia()
    case 'sync-prefectura-historico':
      return correrSyncPrefecturaHistorico()
    default:
      throw new JobDesconocidoError(nombre)
  }
}

export function codigoSalida(nombreJob, resultado) {
  const motivo = resultado?.motivo

  // Falla real de negocio: el job corrió pero no había cobertura suficiente.
  if (motivo === 'cobertura_insuficiente') return 1

  // Falla controlada devuelta como resultado (no lanzada). Limitado a este job:
  // otros jobs que devuelven `estado: 'fallido'` (p. ej. sync-smn-alertas) hoy
  // salen con 0 y no se cambian en este cambio.
  if (nombreJob === 'sync-prefectura-alturas' && resultado?.estado === 'fallido') return 1
  if (nombreJob === 'sync-synop-lluvia' && resultado?.estado === 'fallido') return 1
  if (nombreJob === 'sync-prefectura-historico' && resultado?.estado === 'fallido') return 1

  // El job corrió pero perdió el lease antes de publicar.
  if (motivo === 'lease_perdido_durante_ejecucion') return 3
  if (resultado?.ejecutado && resultado?.leasePerdido) return 3

  // No-ops idempotentes / gating: éxito silencioso.
  if (
    motivo === 'flag_deshabilitado' ||
    motivo === 'ya_completado' ||
    motivo === 'en_progreso_vigente' ||
    motivo === 'lease_no_disponible'
  ) {
    return 0
  }

  if (resultado?.ejecutado === true) return 0
  if (resultado?.ok === true) return 0
  if (resultado?.ok === false) return 1

  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const nombre = process.argv[2]
  const desdeIndex = process.argv.indexOf('--desde')
  const opts = desdeIndex >= 0 ? { desde: process.argv[desdeIndex + 1] } : undefined
  try {
    const resultado = await correrJob(nombre, opts)
    console.log(JSON.stringify(resultado))
    process.exit(codigoSalida(nombre, resultado))
  } catch (error) {
    if (error instanceof JobDesconocidoError) {
      console.error(error.message)
      process.exit(2)
    }
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
