#!/usr/bin/env node
/**
 * Punto de entrada único de los jobs batch de OPS1 (ENOS 2026/2027):
 * despacha por nombre (`node scripts/jobs.mjs <nombre>`) aplicando gating de
 * flags, lease e idempotencia según el job. Empaquetado en la imagen Docker
 * junto con scripts/ y lib/ (ver Dockerfile), igual que job-diagnostico.mjs;
 * se invoca con `docker exec <contenedor> node scripts/jobs.mjs <nombre>`.
 * Ver docs/ejecucion-enos/OPS1/runbook-scheduler.md.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Mismo hook que scripts/job-diagnostico.mjs: lib/infraestructura/riesgo/job-run.ts
// importa vía alias '@/' y rutas relativas sin extensión, que el resolver
// ESM nativo no completa.
function resolveTsCandidate(base) {
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const candidate = resolveTsCandidate(join(root, specifier.slice(2)))
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    } else if (
      specifier.startsWith('./') ||
      specifier.startsWith('../') ||
      specifier.startsWith('/')
    ) {
      const base = specifier.startsWith('/')
        ? specifier
        : join(dirname(fileURLToPath(context.parentURL)), specifier)
      const candidate = resolveTsCandidate(base)
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const TIPO_GEO_PERFILES = 'geo-perfiles'
const DURACION_LEASE_GEO_PERFILES_MS = 10 * 60 * 1000
const TIPO_SITUACION_CORTE = 'situacion-corte-v1'
const DURACION_LEASE_SITUACION_CORTE_MS = 10 * 60 * 1000
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const NOMBRES_VALIDOS = [
  'geo-perfiles',
  'sync-pronostico-caudal',
  'sync-ensemble',
  'sync-imerg',
  'climatologia-precipitacion',
  'climatologia-caudal',
  'calcular-riesgo',
  'episodios-derivados',
  'sync-seasonal',
  'situacion-corte',
  'briefing-ia',
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
    case 'sync-pronostico-caudal':
      return correrSyncPronosticoCaudal()
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
    default:
      throw new JobDesconocidoError(nombre)
  }
}

export function codigoSalida(nombreJob, resultado) {
  const motivo = resultado?.motivo

  // Falla real de negocio: el job corrió pero no había cobertura suficiente.
  if (motivo === 'cobertura_insuficiente') return 1

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
  try {
    const resultado = await correrJob(nombre)
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
