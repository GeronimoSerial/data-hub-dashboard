#!/usr/bin/env node
/**
 * Job de recomputo de episodios derivados (E7a): recalcula desde cero los
 * episodios por departamento a partir de las afectaciones confirmadas y los
 * persiste de forma atómica por versión de regla. Usa lease e idempotencia
 * (infra_job_run) para que dos invocaciones concurrentes o repetidas del mismo
 * día no corran dos veces.
 *
 * Empaquetado en la imagen Docker junto con scripts/ y lib/ (ver Dockerfile);
 * se corre con `docker exec <contenedor> node scripts/job-episodios-derivados.mjs`,
 * igual que scripts/job-diagnostico.mjs. No es un servicio: termina y sale.
 *
 * Usage: node scripts/job-episodios-derivados.mjs
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Mismo hook que scripts/job-diagnostico.mjs y scripts/sync-ge.mjs:
// lib/infraestructura/riesgo/job-run.ts importa vía alias '@/' y rutas
// relativas sin extensión, que el resolver ESM nativo no completa.
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

export async function correrEpisodiosDerivados() {
  // Imports diferidos a la llamada (no al top-level del módulo): getDb() de
  // lib/db/index.ts memoiza la conexión en el primer uso, y los tests
  // necesitan poder fijar DATA_DIR antes de que eso ocurra.
  const { ensureSeeded } = await import('../lib/db/seed.ts')
  const { correrJobEpisodiosDerivados } = await import(
    '../lib/infraestructura/episodios-derivados/job.ts'
  )

  await ensureSeeded()

  return correrJobEpisodiosDerivados()
}

export function codigoSalida(resultado) {
  // Toda no-ejecución que este job conoce es idempotencia normal
  // ('en_progreso_vigente' | 'ya_completado'); los errores se manejan por
  // excepción (exit 1 en el bloque de abajo).
  if (resultado.ejecutado) return 0
  if (resultado.motivo === 'en_progreso_vigente' || resultado.motivo === 'ya_completado') {
    return 0
  }
  return 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const resultado = await correrEpisodiosDerivados()
    console.log(JSON.stringify(resultado))
    process.exit(codigoSalida(resultado))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
