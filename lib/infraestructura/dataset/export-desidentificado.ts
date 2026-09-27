// Dataset desidentificado versionado para uso futuro de E10 (batch E7b,
// decisión de N1 #5 del brief + decisión local de N2: archivos CSV bajo
// `${DATA_DIR}/dataset-replay-e7b/`, sin feature store).
//
// Por escuela-instante: features disponibles en t usando la vista "conocido"
// del replay (NUNCA "reconstruido" — un dataset de entrenamiento tiene que
// reflejar lo que el sistema sabía en ese momento, no la verdad corregida a
// posteriori: usar "reconstruido" acá sería fuga de información hacia el
// futuro) + target (afectación confirmada dentro de las siguientes 24/72 h).
// Sin CUE en claro: se hashea con HMAC-SHA256 + sal local (DATASET_SALT_E7B),
// nunca sin sal (un hash sin sal sobre ~11 dígitos numéricos es reversible por
// fuerza bruta/diccionario).
//
// Este módulo separa a propósito la parte pura (construcción de filas,
// serialización CSV, hash) de la única función con I/O (escribirDatasetCsv),
// para poder testear la primera sin tocar el filesystem.

import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDataDir } from '@/lib/data-dir'

export const DATASET_VERSION_E7B = 'dataset-replay-e7b-v0.1'
const SUBDIR_DATASET = 'dataset-replay-e7b'

// Features disponibles en `instante`, vista "conocido" (as-of estricto).
export interface FilaFeatureEscuela {
  cueAnexo: string
  instante: string // ISO 8601 UTC
  // Nivel de riesgo de la escuela vigente a t según el motor (null = sin dato).
  nivelRiesgo: string | null
  horizonteHoras: number | null
  // Nivel de peligro agregado del departamento a t (ver
  // lib/infraestructura/riesgo/peligro/nivel.ts#agregarNivelPorDepartamento).
  nivelPeligroDepartamento: string | null
  lluviaObservadaMm: number | null
  afectacionConfirmadaEnT: boolean
}

// Target: si la escuela tuvo una afectación confirmada REGISTRADA (creadaEn,
// vista "conocido", nunca vigencia retroactiva) dentro de la ventana
// [t, t+24h] / [t, t+72h]. `null` = "no evaluable": la ventana cae fuera de la
// cobertura de datos disponible (por ejemplo el corte del dataset no llega
// hasta t+72h todavía) — se declara explícito, nunca se asume `false`.
export interface EntradaTarget {
  cueAnexo: string
  instante: string
  afectacionConfirmadaEn24h: boolean | null
  afectacionConfirmadaEn72h: boolean | null
}

export interface FilaDataset {
  idEscuela: string // hash, nunca el CUE en claro
  instante: string
  nivelRiesgo: string | null
  horizonteHoras: number | null
  nivelPeligroDepartamento: string | null
  lluviaObservadaMm: number | null
  afectacionConfirmadaEnT: boolean
  targetAfectacion24h: boolean | null
  targetAfectacion72h: boolean | null
}

/** HMAC-SHA256(cueAnexo) con sal local. La sal NUNCA viaja en el dataset ni en este módulo (la resuelve el caller). */
export function hashCueAnexo(cueAnexo: string, sal: string): string {
  return createHmac('sha256', sal).update(cueAnexo).digest('hex')
}

/** Une una fila de features con su target de la MISMA escuela-instante y desidentifica el CUE. */
export function construirFilaDataset(
  feature: FilaFeatureEscuela,
  target: EntradaTarget,
  sal: string,
): FilaDataset {
  if (feature.cueAnexo !== target.cueAnexo || feature.instante !== target.instante) {
    throw new Error(
      `feature y target no corresponden a la misma escuela-instante (${feature.cueAnexo}/${feature.instante} vs ${target.cueAnexo}/${target.instante})`,
    )
  }
  return {
    idEscuela: hashCueAnexo(feature.cueAnexo, sal),
    instante: feature.instante,
    nivelRiesgo: feature.nivelRiesgo,
    horizonteHoras: feature.horizonteHoras,
    nivelPeligroDepartamento: feature.nivelPeligroDepartamento,
    lluviaObservadaMm: feature.lluviaObservadaMm,
    afectacionConfirmadaEnT: feature.afectacionConfirmadaEnT,
    targetAfectacion24h: target.afectacionConfirmadaEn24h,
    targetAfectacion72h: target.afectacionConfirmadaEn72h,
  }
}

const CSV_HEADER_DATASET =
  'idEscuela,instante,nivelRiesgo,horizonteHoras,nivelPeligroDepartamento,lluviaObservadaMm,afectacionConfirmadaEnT,targetAfectacion24h,targetAfectacion72h'

// `null` se serializa como celda vacía (nunca como el string "null" ni como
// 0/false): CSV no distingue tipos, así que una celda vacía es la única forma
// honesta de decir "sin dato"/"no evaluable" sin que un consumidor la lea
// como un valor real.
function celda(v: string | number | boolean | null): string {
  return v === null ? '' : String(v)
}

export function filasACsv(filas: FilaDataset[]): string {
  const cuerpo = filas.map((f) =>
    [
      f.idEscuela,
      f.instante,
      celda(f.nivelRiesgo),
      celda(f.horizonteHoras),
      celda(f.nivelPeligroDepartamento),
      celda(f.lluviaObservadaMm),
      f.afectacionConfirmadaEnT,
      celda(f.targetAfectacion24h),
      celda(f.targetAfectacion72h),
    ].join(','),
  )
  return [CSV_HEADER_DATASET, ...cuerpo].join('\n') + '\n'
}

/**
 * Escribe el dataset a `${DATA_DIR}/dataset-replay-e7b/<version>_<fecha>.csv`.
 * Nombre determinista por fecha (no por timestamp completo): recorrer el
 * mismo día dos veces sobrescribe el archivo de ese día en vez de acumular
 * duplicados silenciosos. `version` versiona el ESQUEMA de columnas, no el
 * corte de datos — el corte lo da la fecha del nombre.
 */
export function escribirDatasetCsv(
  filas: FilaDataset[],
  generadoEn: Date,
  version: string = DATASET_VERSION_E7B,
): string {
  const dir = path.join(getDataDir(), SUBDIR_DATASET)
  fs.mkdirSync(dir, { recursive: true })
  const fecha = generadoEn.toISOString().slice(0, 10)
  const archivo = path.join(dir, `${version}_${fecha}.csv`)
  fs.writeFileSync(archivo, filasACsv(filas), 'utf8')
  return archivo
}

/**
 * Sal local del hash de desidentificación, resuelta del entorno. Se exige
 * explícita a propósito: un dataset "desidentificado" con una sal fija
 * hardcodeada en el repo no desidentifica nada frente a quien lee el código
 * fuente. Documentado en docs/ejecucion-enos/E7b/registro.md.
 */
export function resolverSalDataset(): string {
  const sal = process.env.DATASET_SALT_E7B
  if (sal === undefined || sal.length === 0) {
    throw new Error(
      'DATASET_SALT_E7B no está configurada: no se puede generar el dataset desidentificado sin sal local',
    )
  }
  return sal
}
