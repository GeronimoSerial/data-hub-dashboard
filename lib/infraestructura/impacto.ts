import type { Client } from '@libsql/client'
import { getDb } from '../db'
import {
  infraAfectacion,
  infraAfectacionSeccion,
  infraParte,
} from '../db/schema'
import { eq } from 'drizzle-orm'
import { attachGe, type EjecutorSql } from './ge-db'

export type { EjecutorSql }

export interface ImpactoResultado {
  alumnos: number
  secciones: number
  seccionesIrresolubles: number
  calculoIncompleto: boolean
  cues: number
  cuis: number | null
  cuiDisponible: boolean
}

const seccionesVacias: ImpactoResultado = {
  alumnos: 0,
  secciones: 0,
  seccionesIrresolubles: 0,
  calculoIncompleto: false,
  cues: 0,
  cuis: null,
  cuiDisponible: false,
}

// ge.sqlite se adjunta una sola vez por conexión: un segundo ATTACH sobre el
// mismo Client falla. Esta función es el único punto de entrada seguro para
// garantizarlo antes de correr las consultas de impacto.
export async function asegurarGeAdjuntada(client: EjecutorSql): Promise<void> {
  try {
    await attachGe(client)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/already|attached|in use/i.test(msg)) throw err
  }
}

// Devuelve, para cada sección del corte indicado, el conjunto de
// ge_person_id matriculados. Único punto de lectura de esta membresía:
// calcularImpactoSecciones lo usa para contar alumnos y
// POST /api/problematicas lo reusa para validar que un alumno seleccionado
// pertenezca realmente a alguna de las secciones elegidas (mismo criterio
// que ya se aplica para validar secciones contra el CUE).
export async function obtenerMembresiaSecciones(
  client: Client,
  params: { corteId: number; geSectionIds: number[] },
): Promise<Map<number, Set<number>>> {
  const { corteId, geSectionIds } = params
  const membresiaPorSeccion = new Map<number, Set<number>>()
  if (geSectionIds.length === 0) return membresiaPorSeccion

  await asegurarGeAdjuntada(client)
  const placeholders = geSectionIds.map(() => '?').join(',')
  const membresiaRes = await client.execute({
    sql: `SELECT ge_section_id, ge_person_id FROM ge.ge_alumno_seccion
          WHERE corte_id = ? AND ge_section_id IN (${placeholders})`,
    args: [corteId, ...geSectionIds],
  })
  for (const row of membresiaRes.rows) {
    const seccionId = Number(row.ge_section_id)
    const personId = Number(row.ge_person_id)
    const set = membresiaPorSeccion.get(seccionId) ?? new Set<number>()
    set.add(personId)
    membresiaPorSeccion.set(seccionId, set)
  }
  return membresiaPorSeccion
}

// Único camino de cálculo: preliminar y confirmado llaman esta función con
// los mismos (corteId, geSectionIds, alumnoIds). No pueden discrepar porque
// ejecutan el mismo SQL sobre los mismos parámetros.
//
// alumnoIds es opcional y global (no viene agrupado por sección): para cada
// sección, si alguno de sus alumnos matriculados aparece en alumnoIds, esa
// sección pasa a contar SOLO la intersección; si ninguno aparece, cuenta
// completa. Esa es la semántica de "sección sin alumnos explícitos = sección
// completa" documentada en validacion.ts.
export async function calcularImpactoSecciones(
  client: Client,
  params: { corteId: number; geSectionIds: number[]; alumnoIds?: number[] },
): Promise<ImpactoResultado> {
  const { corteId, geSectionIds, alumnoIds } = params
  if (geSectionIds.length === 0) return { ...seccionesVacias }

  await asegurarGeAdjuntada(client)

  const placeholders = geSectionIds.map(() => '?').join(',')

  const resueltasRes = await client.execute({
    sql: `SELECT DISTINCT ge_section_id FROM ge.ge_seccion WHERE corte_id = ? AND ge_section_id IN (${placeholders})`,
    args: [corteId, ...geSectionIds],
  })
  const resueltasSet = new Set(resueltasRes.rows.map((r) => Number(r.ge_section_id)))
  const seccionesIrresolubles = geSectionIds.filter((id) => !resueltasSet.has(id)).length

  const membresiaPorSeccion = await obtenerMembresiaSecciones(client, { corteId, geSectionIds })
  const alumnoIdsSet = new Set(alumnoIds ?? [])
  const alumnosContados = new Set<number>()
  for (const [, personIds] of membresiaPorSeccion) {
    const interseccion = alumnoIdsSet.size > 0 ? [...personIds].filter((id) => alumnoIdsSet.has(id)) : []
    const seleccion = interseccion.length > 0 ? interseccion : [...personIds]
    for (const id of seleccion) alumnosContados.add(id)
  }

  const cuesRes = await client.execute({
    sql: `SELECT COUNT(DISTINCT cue_anexo) AS n FROM ge.ge_seccion WHERE corte_id = ? AND ge_section_id IN (${placeholders})`,
    args: [corteId, ...geSectionIds],
  })

  const cuisRes = await client.execute({
    sql: `SELECT DISTINCT l.cui AS cui
          FROM ge.ge_seccion s
          JOIN ge.ge_localizacion l ON l.cue_anexo = s.cue_anexo
          WHERE s.corte_id = ? AND s.ge_section_id IN (${placeholders})`,
    args: [corteId, ...geSectionIds],
  })
  const cuiValores = cuisRes.rows.map((r) => r.cui)
  const cuiDisponible = cuiValores.some((v) => v !== null && v !== undefined)
  const cuis = cuiDisponible
    ? new Set(cuiValores.filter((v) => v !== null && v !== undefined)).size
    : null

  return {
    alumnos: alumnosContados.size,
    secciones: resueltasSet.size,
    seccionesIrresolubles,
    calculoIncompleto: seccionesIrresolubles > 0,
    cues: Number(cuesRes.rows[0]?.n ?? 0),
    cuis,
    cuiDisponible,
  }
}

// Resuelve el corte_id y las secciones ya persistidas de una afectación. El
// corteId vive en infra_parte, no en infra_afectacion — por eso el join.
// Es la fuente de corte/secciones para el alcance nominal (F3.3): la
// afectación se identifica por infra_afectacion.id. (Su equivalente sobre el
// modelo deprecado se retiró en la Fase 4, junto con el único llamador que
// le quedaba.)
export async function obtenerCorteYSeccionesDeAfectacion(
  afectacionId: string,
): Promise<{ corteId: number; geSectionIds: number[] } | null> {
  const db = getDb()
  const [fila] = await db
    .select({ corteId: infraParte.corteId })
    .from(infraAfectacion)
    .innerJoin(infraParte, eq(infraAfectacion.parteId, infraParte.id))
    .where(eq(infraAfectacion.id, afectacionId))
    .limit(1)
  if (!fila) return null

  const secciones = await db
    .select({ geSectionId: infraAfectacionSeccion.geSectionId })
    .from(infraAfectacionSeccion)
    .where(eq(infraAfectacionSeccion.afectacionId, afectacionId))

  return {
    corteId: fila.corteId,
    geSectionIds: secciones.map((s) => s.geSectionId),
  }
}
