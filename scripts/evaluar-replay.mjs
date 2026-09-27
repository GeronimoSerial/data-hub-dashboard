#!/usr/bin/env node
/**
 * Script reproducible de evaluación de anticipación (batch E7b, decisión de
 * N1 #4 del brief): por episodio derivado (agrupados por departamento), mide
 * cuánto antecedió una alerta de riesgo/peligro alto a la primera afectación
 * confirmada. Usa las funciones puras de
 * lib/infraestructura/evaluacion/anticipacion.ts; este script sólo consulta
 * la DB y arma las señales que esas funciones necesitan.
 *
 * NUNCA golpea la red: lee sólo lo que ya está en la base local (SQLite bajo
 * DATA_DIR). Sin argumentos evalúa todos los episodios de la versión de regla
 * vigente (EPISODIOS_REGLA_VERSION); no hay flag de fecha porque la ventana de
 * cada episodio ya viene de infra_episodio_derivado.
 *
 * Simplificación documentada (registro E7b): las "señales de peligro" de este
 * script usan sólo el ensemble (hazard_ensemble_prob, horizonte 24 h) y NO el
 * fallback determinístico contra climatología — reconstruir esa combinación
 * para una serie histórica completa (no un instante puntual) queda fuera de
 * alcance de E7b. Las "señales de riesgo" sí cubren el histórico completo de
 * infra_risk_snapshot.
 *
 * Sesgo declarado: con datos de desarrollo, casi no hay historia real de
 * riesgo/peligro — la salida esperada es MAYORMENTE "no evaluable". Este
 * script no lo oculta: lo reporta en `episodiosNoEvaluables`.
 *
 * Usage: node scripts/evaluar-replay.mjs [--departamento=NOMBRE]
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Mismo hook de resolución TS que scripts/job-episodios-derivados.mjs.
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

const NIVELES_RIESGO_ALTO = new Set(['alto', 'muy_alto'])

function parsearArgs(argv) {
  const departamento = argv
    .find((a) => a.startsWith('--departamento='))
    ?.slice('--departamento='.length)
  return { departamento: departamento || undefined }
}

export async function correrEvaluacionReplay(opts = {}) {
  // Imports diferidos: getDb() memoiza la conexión en el primer uso, y los
  // tests necesitan fijar DATA_DIR antes de que eso ocurra.
  const { ensureSeeded } = await import('../lib/db/seed.ts')
  const { getDb } = await import('../lib/db/index.ts')
  const schema = await import('../lib/db/schema.ts')
  const { and, eq, inArray, isNotNull } = await import('drizzle-orm')
  const { EPISODIOS_REGLA_VERSION } = await import(
    '../lib/infraestructura/episodios-derivados/regla.ts'
  )
  const { nivelDesdeEnsemble, VARIABLE_ENSEMBLE } = await import(
    '../lib/infraestructura/riesgo/peligro/nivel.ts'
  )
  const {
    calcularAnticipacionEpisodio,
    calcularTasaAnticipacion,
    calcularEscuelasSinAlerta,
  } = await import('../lib/infraestructura/evaluacion/anticipacion.ts')

  await ensureSeeded()
  const db = getDb()

  const condicionesEpisodios = [eq(schema.infraEpisodioDerivado.reglaVersion, EPISODIOS_REGLA_VERSION)]
  if (opts.departamento) {
    condicionesEpisodios.push(eq(schema.infraEpisodioDerivado.unidadId, opts.departamento))
  }
  const episodios = await db
    .select()
    .from(schema.infraEpisodioDerivado)
    .where(and(...condicionesEpisodios))

  const resultadosPorEpisodio = []
  const geometryRefsPorDepartamento = new Map()
  const cueAnexosPorDepartamento = new Map()

  for (const episodio of episodios) {
    const departamento = episodio.unidadId

    if (!geometryRefsPorDepartamento.has(departamento)) {
      const filasGeo = await db
        .select({ cueAnexo: schema.infraGeoProfile.cueAnexo, geometryRef: schema.infraGeoProfile.geometryRef })
        .from(schema.infraGeoProfile)
        .where(eq(schema.infraGeoProfile.departamento, departamento))
      cueAnexosPorDepartamento.set(departamento, filasGeo.map((f) => f.cueAnexo))
      geometryRefsPorDepartamento.set(
        departamento,
        [...new Set(filasGeo.map((f) => f.geometryRef).filter((r) => r !== null))],
      )
    }
    const cueAnexos = cueAnexosPorDepartamento.get(departamento)
    const geometryRefs = geometryRefsPorDepartamento.get(departamento)

    const filasRiesgo =
      cueAnexos.length === 0
        ? []
        : await db
            .select({
              nivelRiesgo: schema.infraRiskSnapshot.nivelRiesgo,
              calculadoEn: schema.infraRiskSnapshot.calculadoEn,
            })
            .from(schema.infraRiskSnapshot)
            .where(
              and(
                inArray(schema.infraRiskSnapshot.cueAnexo, cueAnexos),
                isNotNull(schema.infraRiskSnapshot.nivelRiesgo),
              ),
            )
    const senalesRiesgo = filasRiesgo.map((f) => ({ nivel: f.nivelRiesgo, emitidoEn: f.calculadoEn }))

    const filasEnsemble =
      geometryRefs.length === 0
        ? []
        : await db
            .select({
              corridaEn: schema.hazardEnsembleProb.corridaEn,
              probabilidadP95: schema.hazardEnsembleProb.probabilidadP95,
              probabilidadP99: schema.hazardEnsembleProb.probabilidadP99,
              miembrosValidos: schema.hazardEnsembleProb.miembrosValidos,
            })
            .from(schema.hazardEnsembleProb)
            .where(
              and(
                inArray(schema.hazardEnsembleProb.geometryRef, geometryRefs),
                eq(schema.hazardEnsembleProb.variable, VARIABLE_ENSEMBLE),
              ),
            )
    const senalesPeligro = filasEnsemble
      .filter((f) => f.miembrosValidos > 0)
      .map((f) => ({
        nivel: nivelDesdeEnsemble(f.probabilidadP95, f.probabilidadP99),
        emitidoEn: f.corridaEn,
      }))

    const fechas = [...senalesRiesgo, ...senalesPeligro].map((s) => s.emitidoEn).sort()
    const historiaDisponibleDesde = fechas.length === 0 ? null : fechas[0]

    resultadosPorEpisodio.push(
      calcularAnticipacionEpisodio({
        episodioId: episodio.id,
        departamento,
        primeraAfectacionEn: episodio.inicioEn,
        historiaDisponibleDesde,
        senalesRiesgo,
        senalesPeligro,
      }),
    )
  }

  const tasa = calcularTasaAnticipacion(resultadosPorEpisodio)

  // Escuelas afectadas: cueAnexo distintos de infra_episodio_miembro, con su
  // nivel máximo de riesgo alcanzado alguna vez (null = nunca se calculó).
  const miembros = await db
    .select({ cueAnexo: schema.infraEpisodioMiembro.cueAnexo })
    .from(schema.infraEpisodioMiembro)
  const cueAnexosAfectados = [...new Set(miembros.map((m) => m.cueAnexo))]

  const escuelasConMax = []
  for (const cueAnexo of cueAnexosAfectados) {
    const filas = await db
      .select({ nivelRiesgo: schema.infraRiskSnapshot.nivelRiesgo })
      .from(schema.infraRiskSnapshot)
      .where(
        and(eq(schema.infraRiskSnapshot.cueAnexo, cueAnexo), isNotNull(schema.infraRiskSnapshot.nivelRiesgo)),
      )
    if (filas.length === 0) {
      escuelasConMax.push({ cueAnexo, maxNivelRiesgoAlcanzado: null })
      continue
    }
    const alcanzoAlto = filas.some((f) => NIVELES_RIESGO_ALTO.has(f.nivelRiesgo))
    escuelasConMax.push({
      cueAnexo,
      maxNivelRiesgoAlcanzado: alcanzoAlto ? 'alto' : filas[0].nivelRiesgo,
    })
  }
  const escuelasSinAlerta = calcularEscuelasSinAlerta(escuelasConMax)

  return {
    generadoEn: new Date().toISOString(),
    episodiosEvaluados: resultadosPorEpisodio.length,
    resultadosPorEpisodio,
    tasa,
    escuelasSinAlerta,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const opts = parsearArgs(process.argv.slice(2))
    const resultado = await correrEvaluacionReplay(opts)
    console.log(JSON.stringify(resultado, null, 2))
    process.exit(0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
