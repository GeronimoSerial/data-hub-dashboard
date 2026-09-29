#!/usr/bin/env node
/**
 * Job de diagnóstico de ejecución finita (E0): verifica que la base sqlite
 * operativa responde y que DATA_DIR es escribible, usando lease e
 * idempotencia (infra_job_run) para que dos invocaciones concurrentes o
 * repetidas del mismo día no publiquen dos resultados.
 *
 * Empaquetado en la imagen Docker junto con scripts/ y lib/ (ver Dockerfile);
 * se corre con `docker exec <contenedor> node scripts/job-diagnostico.mjs`,
 * igual que scripts/sync-ge.mjs. No es un servicio: termina y sale.
 *
 * Usage: node scripts/job-diagnostico.mjs [claveIdempotente]
 */
import { accessSync, constants, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Mismo hook que scripts/sync-ge.mjs: lib/infraestructura/riesgo/job-run.ts
// importa vía alias '@/' y rutas relativas sin extensión, que el resolver
// ESM nativo no completa.
registerTsResolver(root)

const TIPO = 'diagnostico'
const DURACION_LEASE_MS = 5 * 60 * 1000
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Busy timeout nativo, sólo seguro acá (ver el comentario largo de
// lib/db/index.ts#getDb): este script es su PROPIO proceso de Node con una
// única conexión a hub.sqlite, así que el busy-wait sincrónico del binding
// nativo no puede congelar un segundo escritor DEL MISMO proceso — sólo
// espera a que el proceso web (u otro job) suelte el lock cruzado. 5s es
// modesto frente al lease de 5 minutos de este job.
const BUSY_TIMEOUT_MS_JOB = 5_000

export async function correrDiagnostico({ claveIdempotente } = {}) {
  // Imports diferidos a la llamada (no al top-level del módulo): getDb() de
  // lib/db/index.ts memoiza la conexión en el primer uso, y los tests
  // necesitan poder fijar DATA_DIR antes de que eso ocurra.
  const { adquirirLease, publicarResultado } = await import(
    '../lib/infraestructura/riesgo/job-run.ts'
  )
  const { ensureSeeded } = await import('../lib/db/seed.ts')
  const { getDb, getRawClient } = await import('../lib/db/index.ts')
  const { getSqlitePath, getDataDir } = await import('../lib/data-dir.ts')
  const { crearEjecutorSql } = await import('../lib/infraestructura/ge-db.ts')

  // Tiene que ser la PRIMERA llamada a getDb() de este proceso: getDb()
  // memoiza la conexión y sólo la llamada que la crea puede fijar el busy
  // timeout nativo (ver lib/db/index.ts).
  getDb({ busyTimeoutMs: BUSY_TIMEOUT_MS_JOB })

  await ensureSeeded()

  const clave = claveIdempotente ?? new Date().toISOString().slice(0, 10)
  const lease = await adquirirLease({
    tipo: TIPO,
    claveIdempotente: clave,
    version: pkg.version,
    duracionLeaseMs: DURACION_LEASE_MS,
  })

  if (!lease.adquirido) {
    return { ejecutado: false, motivo: lease.motivo }
  }

  try {
    const chequeos = { db: false, dataDir: false }

    await crearEjecutorSql(getRawClient()).execute('SELECT 1')
    chequeos.db = true

    accessSync(getDataDir(), constants.W_OK)
    chequeos.dataDir = true

    const publicado = await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: { db: 1, dataDir: 1 },
    })

    return {
      ejecutado: true,
      jobRunId: lease.jobRunId,
      chequeos,
      sqlitePath: getSqlitePath(),
      leasePerdido: !publicado,
    }
  } catch (error) {
    const errorSaneado =
      error instanceof Error ? error.message : 'Error desconocido en job de diagnóstico'
    // Best-effort: si el lease se perdió (otro proceso lo recuperó),
    // publicarResultado devuelve false y no pisa nada; el error original
    // se relanza igual.
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado,
    })
    throw error
  }
}

export function codigoSalida(resultado) {
  if (resultado.ejecutado && resultado.leasePerdido) return 3
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const resultado = await correrDiagnostico({ claveIdempotente: process.argv[2] })
    console.log(JSON.stringify(resultado))
    process.exit(codigoSalida(resultado))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
