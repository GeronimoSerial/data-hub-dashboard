#!/usr/bin/env node
/**
 * Prueba real fechada de RENDIMIENTO del replay (batch E7b, aceptación
 * "rendimiento del replay de un departamento por 30 días medido").
 *
 * NO forma parte de `pnpm test` (usa un tmpdir propio y datos sintéticos a
 * escala real, no fixtures mínimas): se corre a mano con
 * `node scripts/perf-replay-30d.mjs` y su salida (fecha, ms, cuadros) se pega
 * en docs/ejecucion-enos/E7b/registro.md como evidencia fechada.
 *
 * Por qué datos SINTÉTICOS y no `.data` real: al momento de este batch
 * `.data/hub.sqlite` no tiene todavía geo-perfiles, afectaciones ni corridas
 * de riesgo reales (ver registro.md, sección "pruebas reales fechadas") — no
 * hay volumen real contra el cual medir. Este script arma un departamento de
 * 300 escuelas (orden de magnitud real, ver docs E2) con 60 corridas de
 * riesgo (30 días a 12 h) para medir el costo de generarReplay a escala.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

registerTsResolver(root)

const dir = mkdtempSync(join(tmpdir(), 'perf-replay-30d-'))
process.env.DATA_DIR = dir

const { ensureSeeded } = await import(join(root, 'lib/db/seed.ts'))
await ensureSeeded()
const { getDb } = await import(join(root, 'lib/db/index.ts'))
const schema = await import(join(root, 'lib/db/schema.ts'))
const { generarReplay } = await import(join(root, 'lib/infraestructura/replay/consulta.ts'))
const db = getDb()

const DEPARTAMENTO = 'PERF-DEPTO'
const N_ESCUELAS = 300 // orden de magnitud de un departamento real (ver docs E2)
const T0 = new Date('2026-01-01T00:00:00.000Z')

const periodoId = (await db.select().from(schema.infraPeriodo).limit(1))[0].id

const geoRows = []
const parteRows = []
const afectacionRows = []
const runRows = []
const snapshotRows = []

for (let i = 0; i < N_ESCUELAS; i++) {
  const cueAnexo = `perf-${String(i).padStart(4, '0')}`
  geoRows.push({
    cueAnexo, lat: -30 - i * 0.001, lon: -60 - i * 0.001, geoCalidad: 'alta',
    departamento: DEPARTAMENTO, geometryRef: `${(-30 - Math.floor(i / 50) * 0.1).toFixed(2)}_${(-60).toFixed(2)}`,
    motivoExclusion: null, perfilVersion: 'geo-perfil-v1', calculadoEn: T0.toISOString(),
  })
  parteRows.push({
    id: `parte-perf-${i}`, periodoId, cueAnexo, estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: T0.toISOString(), corteId: 1,
    creadaEn: T0.toISOString(), actualizadaEn: T0.toISOString(),
  })
  // 1 de cada 10 escuelas con una afectación confirmada vigente todo el período.
  if (i % 10 === 0) {
    afectacionRows.push({
      id: `afect-perf-${i}`, parteId: `parte-perf-${i}`, motivo: 'Inundación',
      categoria: 'establecimiento', severidad: 'Alta', descripcion: null,
      rigeDesde: T0.toISOString(), creadaEn: T0.toISOString(), retiradaEn: null,
    })
  }
}

// 30 días de corridas de riesgo cada 12h (60 runs), cada una con un snapshot por escuela.
const runsCount = 60
for (let r = 0; r < runsCount; r++) {
  const publicadoEn = new Date(T0.getTime() + r * 12 * 3600_000).toISOString()
  const runId = `run-perf-${r}`
  runRows.push({
    id: runId, periodoId, modeloVersion: 'motor-v0.1', iniciadoEn: publicadoEn,
    publicadoEn, estado: r === runsCount - 1 ? 'vigente' : 'vencido',
    cobertura: { procesadas: N_ESCUELAS, conEvidencia: N_ESCUELAS, sinEvidencia: 0 },
    creadaEn: publicadoEn,
  })
  for (let i = 0; i < N_ESCUELAS; i++) {
    snapshotRows.push({
      id: `snap-perf-${r}-${i}`, runId, cueAnexo: `perf-${String(i).padStart(4, '0')}`,
      horizonteHoras: 72, evidenciaValida: true, scoreRiesgo: 0.3, nivelRiesgo: 'moderado',
      scoreAmenaza: 0.3, scoreVulnerabilidad: 0.3, confianza: 'media',
      exposicionMatricula: 100, exposicionSecciones: 3, calculadoEn: publicadoEn,
      validoHasta: new Date(T0.getTime() + (r + 1) * 12 * 3600_000).toISOString(),
    })
  }
}

console.log(`Insertando fixtures de performance: ${geoRows.length} geo, ${parteRows.length} partes, ${afectacionRows.length} afectaciones, ${runRows.length} runs, ${snapshotRows.length} snapshots...`)
const tInsertStart = Date.now()
for (const chunk of chunkArray(geoRows, 200)) await db.insert(schema.infraGeoProfile).values(chunk)
for (const chunk of chunkArray(parteRows, 200)) await db.insert(schema.infraParte).values(chunk)
for (const chunk of chunkArray(afectacionRows, 200)) await db.insert(schema.infraAfectacion).values(chunk)
for (const chunk of chunkArray(runRows, 200)) await db.insert(schema.infraRiskRun).values(chunk)
for (const chunk of chunkArray(snapshotRows, 500)) await db.insert(schema.infraRiskSnapshot).values(chunk)
console.log(`Insert listo en ${Date.now() - tInsertStart} ms`)

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const desde = T0.toISOString()
const hasta = new Date(T0.getTime() + 30 * 24 * 3600_000).toISOString()

const tStart = Date.now()
const resultado = await generarReplay({
  territorioTipo: 'departamento', territorioId: DEPARTAMENTO,
  desde, hasta, paso: 6, vista: 'reconstruido',
})
const elapsedMs = Date.now() - tStart

console.log(JSON.stringify({
  fecha: new Date().toISOString(),
  nEscuelas: N_ESCUELAS,
  ventanaDias: 30,
  pasoHoras: 6,
  cuadros: resultado.cuadros.length,
  siguienteDesde: resultado.siguienteDesde,
  elapsedMs,
  msPorCuadro: (elapsedMs / resultado.cuadros.length).toFixed(2),
  primerCuadroAfectaciones: resultado.cuadros[0]?.afectacionesConfirmadas.length,
}, null, 2))

rmSync(dir, { recursive: true, force: true })
