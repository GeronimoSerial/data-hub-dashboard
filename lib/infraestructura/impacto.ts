import type { Client } from '@libsql/client'
import { getDb } from '../db'
import { infraProblematica, infraProblematicaSeccion } from '../db/schema'
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

// Resuelve el corte_id y las secciones ya persistidas de una problemática.
// Único punto de lectura de esta relación: tanto el motor de impacto como el
// alcance nominal (identidad.ts) parten de acá para no duplicar el join.
export async function obtenerCorteYSeccionesDeProblematica(
  problematicaId: string,
): Promise<{ corteId: number; geSectionIds: number[] } | null> {
  const db = getDb()
  const [problematica] = await db
    .select({ corteId: infraProblematica.corteId })
    .from(infraProblematica)
    .where(eq(infraProblematica.id, problematicaId))
    .limit(1)
  if (!problematica) return null

  const secciones = await db
    .select({ geSectionId: infraProblematicaSeccion.geSectionId })
    .from(infraProblematicaSeccion)
    .where(eq(infraProblematicaSeccion.problematicaId, problematicaId))

  return {
    corteId: problematica.corteId,
    geSectionIds: secciones.map((s) => s.geSectionId),
  }
}

// Resuelve el corte_id y las secciones ya persistidas de una problemática y
// delega en calcularImpactoSecciones: es el mismo camino de cálculo que el
// preliminar, nunca una consulta paralela.
export async function calcularImpactoProblematica(
  client: Client,
  problematicaId: string,
): Promise<ImpactoResultado | null> {
  const referencia = await obtenerCorteYSeccionesDeProblematica(problematicaId)
  if (!referencia) return null

  return calcularImpactoSecciones(client, referencia)
}

// Impacto consolidado por CUE a través de TODAS sus alertas. El JOIN vive acá
// literal porque es la consulta oficial del §4.1: DISTINCT ge_person_id sobre
// la unión de secciones de todas las problemáticas de ese CUE. Dos alertas
// sobre la misma sección no duplican alumnos porque DISTINCT opera sobre la
// clave estable ge_person_id, no sobre la cantidad de alertas. Filtra por
// cue_anexo exacto: un CUI compartido entre CUEs nunca contamina este total.
export async function calcularImpactoConsolidadoCue(
  client: Client,
  cueAnexo: string,
): Promise<{ alumnos: number }> {
  await asegurarGeAdjuntada(client)

  const res = await client.execute({
    sql: `SELECT COUNT(DISTINCT s.ge_person_id) AS n
          FROM infra_problematica p
          JOIN infra_problematica_seccion ps ON ps.problematica_id = p.id
          JOIN ge.ge_alumno_seccion s ON s.ge_section_id = ps.ge_section_id
                                     AND s.corte_id      = p.corte_id
          WHERE p.cue_anexo = ?`,
    args: [cueAnexo],
  })
  return { alumnos: Number(res.rows[0]?.n ?? 0) }
}
