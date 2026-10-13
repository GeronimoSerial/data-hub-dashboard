#!/usr/bin/env node
/**
 * Exporta un CSV de dataset desidentificado en DATA_DIR o en --out.
 *
 * Contrato de filas (una por snapshot publicado de riesgo, escuela-instante-horizonte):
 * - instante = `infra_risk_snapshot.calculado_en`; sólo runs con `publicado_en` no nulo.
 * - features en vista "conocido" (as-of t, nunca reconstruida): `nivelRiesgo` y
 *   `horizonteHoras` del snapshot; `afectacionConfirmadaEnT` = existe un reporte
 *   (`infra_afectacion` no retirada en t) registrado en `creada_en <= t`.
 * - `nivelPeligroDepartamento` y `lluviaObservadaMm` quedan en null: todavía no hay una
 *   fuente as-of conectada a esta consulta (supuesto declarado, no un valor inventado).
 * - targets: `targetAfectacion24h` / `targetAfectacion72h` = existe un reporte con
 *   `creada_en` en (t, t+24h] / (t, t+72h]; null si la ventana aún no llega a `ahora`.
 * - PII: nunca se exporta el CUE en claro, sólo `idEscuela` = HMAC(sal, CUE).
 *   Sin nombres, correos, ids de usuario ni texto libre.
 * Sin reportes en la base la consulta sigue válida: targets en false (ventana cubierta)
 * o null (ventana no cubierta), nunca filas inventadas.
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, isNotNull } from 'drizzle-orm'

import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
registerTsResolver(join(__dirname, '..'))
const ADVERTENCIA_SIN_FILAS =
  'sin filas: no hay snapshots de riesgo publicados en la base para exportar'
const MS_HORA = 60 * 60 * 1000

/**
 * Construye las filas desidentificadas desde la base. `db` se inyecta para que el
 * test pueda usar la misma base temporal; el script pasa `getDb()`.
 */
export async function construirFilasDataset({ db, sal, ahora = new Date() }) {
  const schema = await import('../lib/db/schema.ts')
  const { construirFilaDataset } = await import(
    '../lib/infraestructura/dataset/export-desidentificado.ts'
  )
  const ahoraMs = ahora.getTime()

  const snapshots = await db
    .select({
      cueAnexo: schema.infraRiskSnapshot.cueAnexo,
      horizonteHoras: schema.infraRiskSnapshot.horizonteHoras,
      nivelRiesgo: schema.infraRiskSnapshot.nivelRiesgo,
      calculadoEn: schema.infraRiskSnapshot.calculadoEn,
    })
    .from(schema.infraRiskSnapshot)
    .innerJoin(schema.infraRiskRun, eq(schema.infraRiskSnapshot.runId, schema.infraRiskRun.id))
    .where(isNotNull(schema.infraRiskRun.publicadoEn))

  const reportes = await db
    .select({
      cueAnexo: schema.infraParte.cueAnexo,
      creadaEn: schema.infraAfectacion.creadaEn,
      retiradaEn: schema.infraAfectacion.retiradaEn,
    })
    .from(schema.infraAfectacion)
    .innerJoin(schema.infraParte, eq(schema.infraAfectacion.parteId, schema.infraParte.id))

  const reportesPorCue = new Map()
  for (const reporte of reportes) {
    const lista = reportesPorCue.get(reporte.cueAnexo) ?? []
    lista.push({
      creadaMs: Date.parse(reporte.creadaEn),
      retiradaMs: reporte.retiradaEn === null ? null : Date.parse(reporte.retiradaEn),
    })
    reportesPorCue.set(reporte.cueAnexo, lista)
  }

  const vistos = new Set()
  const filas = []
  for (const snapshot of snapshots) {
    const instanteMs = Date.parse(snapshot.calculadoEn)
    if (!(instanteMs <= ahoraMs)) continue
    const clave = `${snapshot.cueAnexo}|${snapshot.calculadoEn}|${snapshot.horizonteHoras}`
    if (vistos.has(clave)) continue
    vistos.add(clave)

    const reportesEscuela = reportesPorCue.get(snapshot.cueAnexo) ?? []
    const confirmadaEnT = reportesEscuela.some(
      (r) => r.creadaMs <= instanteMs && (r.retiradaMs === null || r.retiradaMs > instanteMs),
    )
    const targetEn = (horas) => {
      const finMs = instanteMs + horas * MS_HORA
      if (finMs > ahoraMs) return null
      return reportesEscuela.some((r) => r.creadaMs > instanteMs && r.creadaMs <= finMs)
    }

    filas.push(
      construirFilaDataset(
        {
          cueAnexo: snapshot.cueAnexo,
          instante: snapshot.calculadoEn,
          nivelRiesgo: snapshot.nivelRiesgo,
          horizonteHoras: snapshot.horizonteHoras,
          nivelPeligroDepartamento: null,
          lluviaObservadaMm: null,
          afectacionConfirmadaEnT: confirmadaEnT,
        },
        {
          cueAnexo: snapshot.cueAnexo,
          instante: snapshot.calculadoEn,
          afectacionConfirmadaEn24h: targetEn(24),
          afectacionConfirmadaEn72h: targetEn(72),
        },
        sal,
      ),
    )
  }
  return filas
}

function obtenerRutaSalida(args) {
  const indiceOut = args.indexOf('--out')
  if (indiceOut === -1) return undefined
  const ruta = args[indiceOut + 1]
  if (!ruta || ruta.startsWith('--')) {
    throw new Error('La opción --out requiere una ruta de archivo')
  }
  return resolve(ruta)
}

export async function exportarDatasetDesidentificado({ args = process.argv.slice(2) } = {}) {
  const { resolverSalDataset, escribirDatasetCsv } = await import(
    '../lib/infraestructura/dataset/export-desidentificado.ts'
  )
  const sal = resolverSalDataset()
  const rutaSalida = obtenerRutaSalida(args)

  const { ensureSeeded } = await import('../lib/db/seed.ts')
  const { getDb } = await import('../lib/db/index.ts')
  await ensureSeeded()
  const filas = await construirFilasDataset({ db: getDb(), sal })
  if (filas.length === 0) console.warn(ADVERTENCIA_SIN_FILAS)
  const archivo = escribirDatasetCsv(filas, new Date(), undefined, rutaSalida)
  return {
    ok: true,
    archivo,
    filas: filas.length,
    ...(filas.length === 0 ? { advertencia: ADVERTENCIA_SIN_FILAS } : {}),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const resultado = await exportarDatasetDesidentificado()
    console.log(JSON.stringify(resultado))
    process.exit(0)
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido al exportar el dataset'
    console.error(mensaje)
    process.exit(1)
  }
}
