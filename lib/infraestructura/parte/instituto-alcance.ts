// Alcance de afectaciones para institutos superiores: carreras y alumnos de la
// matrícula (infra_afectacion_carrera / infra_afectacion_matricula_alumno).
// Un alumno sin carrera seleccionada no existe: la carrera es la unidad y los
// alumnos sólo restringen dentro de ella. Carrera sin alumnos elegidos = carrera
// completa, igual que una sección GE sin alumnos.
//
// Cada fila guarda el matricula_corte_id con el que se eligió. Las lecturas
// (miembros, equivalencia, diff) usan el corte guardado en cada fila, no el
// vigente: un corte reemplazado sigue resolviendo sus alumnos y totales.
import { eq, inArray } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { infraAfectacionCarrera, infraAfectacionMatriculaAlumno, matriculaCarrera } from '@/lib/db/schema'
import type { AlcanceProvider } from '@/lib/infraestructura/alcance'
import { membresiaMatricula } from '@/lib/infraestructura/alcance/matricula'
import type { EjecutorSql } from '@/lib/infraestructura/ge-db'

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]
type Lector = Pick<ReturnType<typeof getDb>, 'select'>

// Selección tal como se escribe: ids de carrera y de matricula_alumno.
export interface ScopeInstituto {
  carreras: number[]
  alumnos: number[]
}

// Selección tal como se lee: además, el corte con el que se guardó.
export interface ScopeLeido extends ScopeInstituto {
  corteId: number | null
}

export const SCOPE_VACIO: ScopeLeido = { carreras: [], alumnos: [], corteId: null }

// Alumnos efectivamente alcanzados por carrera (mismo criterio que GE: una
// carrera con alumnos elegidos cuenta sólo esos; sin ellos, cuenta completa).
export type EfectivoInstituto = Map<number, Set<number>>

export async function leerScopeInstituto(
  lector: Lector,
  afectacionIds: string[],
): Promise<Map<string, ScopeLeido>> {
  const resultado = new Map<string, ScopeLeido>()
  if (afectacionIds.length === 0) return resultado
  const carreras = await lector
    .select()
    .from(infraAfectacionCarrera)
    .where(inArray(infraAfectacionCarrera.afectacionId, afectacionIds))
  const alumnos = await lector
    .select()
    .from(infraAfectacionMatriculaAlumno)
    .where(inArray(infraAfectacionMatriculaAlumno.afectacionId, afectacionIds))
  for (const id of afectacionIds) resultado.set(id, { carreras: [], alumnos: [], corteId: null })
  for (const fila of carreras) {
    const scope = resultado.get(fila.afectacionId)
    if (!scope) continue
    scope.carreras.push(fila.carreraId)
    scope.corteId = fila.matriculaCorteId
  }
  for (const fila of alumnos) resultado.get(fila.afectacionId)?.alumnos.push(fila.alumnoId)
  return resultado
}

// Reemplaza por completo el alcance de una afectación con el corte dado. Crear
// y modificar usan la misma escritura: nunca quedan filas de dos cortes.
export async function reemplazarScopeInstituto(
  tx: Tx,
  afectacionId: string,
  matriculaCorteId: number,
  scope: ScopeInstituto,
): Promise<void> {
  await tx.delete(infraAfectacionCarrera).where(eq(infraAfectacionCarrera.afectacionId, afectacionId))
  await tx
    .delete(infraAfectacionMatriculaAlumno)
    .where(eq(infraAfectacionMatriculaAlumno.afectacionId, afectacionId))
  if (scope.carreras.length > 0) {
    await tx.insert(infraAfectacionCarrera).values(
      scope.carreras.map((carreraId) => ({ afectacionId, matriculaCorteId, carreraId })),
    )
  }
  if (scope.alumnos.length > 0) {
    await tx.insert(infraAfectacionMatriculaAlumno).values(
      scope.alumnos.map((alumnoId) => ({ afectacionId, matriculaCorteId, alumnoId })),
    )
  }
}

function aplicarMembresia(scope: ScopeInstituto, membresia: Map<number, Set<number>>): EfectivoInstituto {
  const resultado: EfectivoInstituto = new Map()
  const seleccionados = new Set(scope.alumnos)
  for (const carreraId of scope.carreras) {
    const matriculados = membresia.get(carreraId) ?? new Set<number>()
    const interseccion = [...matriculados].filter((id) => seleccionados.has(id))
    resultado.set(carreraId, new Set(interseccion.length > 0 ? interseccion : matriculados))
  }
  return resultado
}

// Efectivo de una selección contra el corte VIGENTE (elección nueva o
// modificación que se escribe con el vigente).
export async function efectivoInstituto(
  alcance: Pick<AlcanceProvider, 'listMembers'>,
  scope: ScopeInstituto,
): Promise<EfectivoInstituto> {
  if (scope.carreras.length === 0) return new Map()
  return aplicarMembresia(scope, await alcance.listMembers(scope.carreras))
}

// Efectivo de muchas afectaciones, cada una contra el corte con que se guardó.
// Una sola consulta de miembros por corte (unión de carreras), nunca una por
// afectación. Sirve a varios CUEs a la vez: cada fila lleva su propio corte.
export async function efectivosPorAfectacion(
  client: EjecutorSql,
  scopes: Map<string, ScopeLeido>,
  corteVigente: number,
): Promise<Map<string, EfectivoInstituto>> {
  const porCorte = new Map<number, string[]>()
  for (const [afectacionId, scope] of scopes) {
    if (scope.carreras.length === 0) continue
    const corte = scope.corteId ?? corteVigente
    porCorte.set(corte, [...(porCorte.get(corte) ?? []), afectacionId])
  }
  const resultado = new Map<string, EfectivoInstituto>()
  for (const [corte, afectacionIds] of porCorte) {
    const carreras = [...new Set(afectacionIds.flatMap((id) => scopes.get(id)?.carreras ?? []))]
    const membresia = await membresiaMatricula(client, corte, carreras)
    for (const afectacionId of afectacionIds) {
      resultado.set(afectacionId, aplicarMembresia(scopes.get(afectacionId)!, membresia))
    }
  }
  return resultado
}

export function mismoEfectivoInstituto(a: EfectivoInstituto, b: EfectivoInstituto | undefined): boolean {
  if (!b || a.size !== b.size) return false
  for (const [carreraId, alumnosA] of a) {
    const alumnosB = b.get(carreraId)
    if (!alumnosB || alumnosB.size !== alumnosA.size) return false
    for (const id of alumnosA) if (!alumnosB.has(id)) return false
  }
  return true
}

export function resumenEfectivoInstituto(efectivo: EfectivoInstituto): { carreras: number; alumnos: number } {
  const alumnos = new Set<number>()
  for (const set of efectivo.values()) for (const id of set) alumnos.add(id)
  return { carreras: efectivo.size, alumnos: alumnos.size }
}

// Cambios de alcance entre dos lecturas de la misma afectación vigente. Cada
// lectura usa el corte con que quedó guardada.
export interface CambioAlcanceInstituto {
  afectacionId: string
  carrerasAgregadas: number
  carrerasRetiradas: number
  alumnosAgregados: number
  alumnosRetirados: number
}

export async function cambiosAlcanceInstituto(
  client: EjecutorSql,
  corteVigente: number,
  antes: Map<string, ScopeLeido>,
  despues: Map<string, ScopeLeido>,
): Promise<CambioAlcanceInstituto[]> {
  const efAntes = await efectivosPorAfectacion(client, antes, corteVigente)
  const efDespues = await efectivosPorAfectacion(client, despues, corteVigente)
  const cambios: CambioAlcanceInstituto[] = []
  for (const afectacionId of antes.keys()) {
    const a = efAntes.get(afectacionId) ?? new Map<number, Set<number>>()
    const d = efDespues.get(afectacionId) ?? new Map<number, Set<number>>()
    const carrerasAgregadas = [...d.keys()].filter((c) => !a.has(c)).length
    const carrerasRetiradas = [...a.keys()].filter((c) => !d.has(c)).length
    const alumnosAntes = new Set([...a.values()].flatMap((s) => [...s]))
    const alumnosDespues = new Set([...d.values()].flatMap((s) => [...s]))
    const alumnosAgregados = [...alumnosDespues].filter((id) => !alumnosAntes.has(id)).length
    const alumnosRetirados = [...alumnosAntes].filter((id) => !alumnosDespues.has(id)).length
    if (carrerasAgregadas + carrerasRetiradas + alumnosAgregados + alumnosRetirados > 0) {
      cambios.push({ afectacionId, carrerasAgregadas, carrerasRetiradas, alumnosAgregados, alumnosRetirados })
    }
  }
  return cambios
}

// Carreras del corte VIGENTE por CUE (para el estado general de las series).
export async function carrerasVigentesPorCue(
  client: EjecutorSql,
  cueAnexos: string[],
): Promise<Map<string, number[]>> {
  const resultado = new Map<string, number[]>()
  if (cueAnexos.length === 0) return resultado
  const marcadores = cueAnexos.map(() => '?').join(', ')
  const res = await client.execute({
    sql: `SELECT c.id, c.cue_anexo FROM matricula_carrera c
          JOIN matricula_corte k ON k.id = c.corte_id
          WHERE k.estado = 'vigente' AND c.cue_anexo IN (${marcadores})`,
    args: cueAnexos,
  })
  for (const fila of res.rows) {
    const cue = String(fila.cue_anexo)
    resultado.set(cue, [...(resultado.get(cue) ?? []), Number(fila.id)])
  }
  return resultado
}

// Nombres de carrera por id (los ids de matricula_carrera son únicos entre cortes).
export async function nombresDeCarreras(lector: Lector, carreraIds: number[]): Promise<Map<number, string>> {
  const resultado = new Map<number, string>()
  if (carreraIds.length === 0) return resultado
  const filas = await lector
    .select({ id: matriculaCarrera.id, nombre: matriculaCarrera.nombre })
    .from(matriculaCarrera)
    .where(inArray(matriculaCarrera.id, carreraIds))
  for (const fila of filas) resultado.set(fila.id, fila.nombre)
  return resultado
}
