// Current educational impact per department for the daily verdict: affected
// schools (open situations, schools and students without classes, pedagogical
// assistance), access risk and the risk radar. Only aggregated counts leave
// this module; never school names or free text.
import { and, eq } from 'drizzle-orm'
import { infraGeoProfile, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import type { ApoyoPedagogico, EstadoClases } from '@/lib/infraestructura/mapa/tipos'
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'
import type { MetricaVeredicto } from './metricas'
import { ID_IMPACTO, type Impacto } from './orden'
import type { Db } from './repositorio'

export type EscuelaImpacto = {
  cueAnexo: string
  departamento: string
  clases: EstadoClases
  apoyo: ApoyoPedagogico
  alumnosSinClases: number
  /** Open situations of the school in the active cut. */
  afectaciones: number
}

export type SnapshotImpacto = {
  cueAnexo: string
  departamento: string | null
  horizonteHoras: number
  nivelRiesgo: string | null
  nivelRiesgoAcceso: string | null
}

export type EntradaImpacto = {
  escuelas: EscuelaImpacto[]
  snapshots: SnapshotImpacto[]
  /** OSM isolation level per CUE (3 = most isolated). */
  aislamiento: Record<string, number | string>
}

/** Radar horizon used by the verdict, same one the modal showed before. */
const HORIZONTE_RADAR_HORAS = 72
const APOYOS: ApoyoPedagogico[] = ['virtual', 'cuadernillo', 'ambos', 'brinda']
const FUENTE_PARTES = 'parte-diario-escuelas'
const FUENTE_RADAR = 'radar-riesgo-escuelas'

export function impactoVacio(): Impacto {
  return {
    situacionesAbiertas: 0,
    escuelasSinClases: 0,
    alumnosSinClases: 0,
    asistenciaPedagogica: 0,
    escuelasAisladas: 0,
    escuelasAccesoRiesgo: 0,
    radarAlto: 0,
  }
}

function tieneAlgo(impacto: Impacto): boolean {
  return Object.values(impacto).some((v) => v > 0)
}

/** Aggregates per normalized department key; departments with no impact are omitted. */
export function agregarImpacto(entrada: EntradaImpacto): Map<string, Impacto> {
  const porDepto = new Map<string, Impacto>()
  const de = (departamento: string): Impacto => {
    const clave = normalizarNombreDepartamento(departamento)
    let impacto = porDepto.get(clave)
    if (!impacto) {
      impacto = impactoVacio()
      porDepto.set(clave, impacto)
    }
    return impacto
  }

  // Same rules as the map summary (mapa/agregar.ts `resumir`).
  for (const escuela of entrada.escuelas) {
    if (!escuela.departamento) continue
    const impacto = de(escuela.departamento)
    impacto.situacionesAbiertas += escuela.afectaciones
    if (escuela.clases !== 'normal') {
      impacto.escuelasSinClases += 1
      impacto.alumnosSinClases += escuela.alumnosSinClases
      if (APOYOS.includes(escuela.apoyo)) impacto.asistenciaPedagogica += 1
    }
  }

  const vistos = new Set<string>()
  for (const s of entrada.snapshots) {
    if (s.horizonteHoras !== HORIZONTE_RADAR_HORAS || !s.departamento || vistos.has(s.cueAnexo)) continue
    vistos.add(s.cueAnexo)
    const impacto = de(s.departamento)
    if (s.nivelRiesgo === 'alto' || s.nivelRiesgo === 'muy_alto') impacto.radarAlto += 1
    if (s.nivelRiesgoAcceso === 'alto') {
      impacto.escuelasAccesoRiesgo += 1
      if (entrada.aislamiento[s.cueAnexo] === 3) impacto.escuelasAisladas += 1
    }
  }

  for (const [clave, impacto] of porDepto) if (!tieneAlgo(impacto)) porDepto.delete(clave)
  return porDepto
}

export function sumarImpacto(impactos: Iterable<Impacto>): Impacto {
  const total = impactoVacio()
  for (const impacto of impactos) {
    for (const clave of Object.keys(total) as (keyof Impacto)[]) total[clave] += impacto[clave]
  }
  return total
}

const ETIQUETAS: Record<keyof Impacto, { etiqueta: string; unidad: string; fuente: string }> = {
  situacionesAbiertas: { etiqueta: 'Situaciones abiertas en escuelas', unidad: 'situaciones', fuente: FUENTE_PARTES },
  escuelasSinClases: { etiqueta: 'Escuelas sin clases normales', unidad: 'escuelas', fuente: FUENTE_PARTES },
  alumnosSinClases: { etiqueta: 'Alumnos sin clases', unidad: 'alumnos', fuente: FUENTE_PARTES },
  asistenciaPedagogica: { etiqueta: 'Escuelas sin clases con asistencia pedagógica', unidad: 'escuelas', fuente: FUENTE_PARTES },
  escuelasAisladas: { etiqueta: 'Escuelas aisladas con acceso en riesgo alto', unidad: 'escuelas', fuente: FUENTE_RADAR },
  escuelasAccesoRiesgo: { etiqueta: 'Escuelas con riesgo alto de quedar sin acceso', unidad: 'escuelas', fuente: FUENTE_RADAR },
  radarAlto: { etiqueta: 'Escuelas con riesgo alto o muy alto en 72 h', unidad: 'escuelas', fuente: FUENTE_RADAR },
}

/** Citable metrics, in ID_IMPACTO order, only for non zero figures. */
export function metricasImpacto(impacto: Impacto): MetricaVeredicto[] {
  return (Object.keys(ID_IMPACTO) as (keyof Impacto)[])
    .filter((clave) => impacto[clave] > 0)
    .map((clave) => ({
      id: ID_IMPACTO[clave],
      valor: impacto[clave],
      unidad: ETIQUETAS[clave].unidad,
      etiqueta: ETIQUETAS[clave].etiqueta,
      fuenteUrl: ETIQUETAS[clave].fuente,
    }))
}

/**
 * Reads the current impact. Each source degrades to empty on failure: the
 * verdict must still be produced from hydro data alone.
 */
export async function leerImpactoActual(db: Db): Promise<Map<string, Impacto>> {
  const [escuelas, snapshots, aislamiento] = await Promise.all([
    leerEscuelas().catch((error) => {
      console.warn('[veredicto] impacto: escuelas no disponibles', error instanceof Error ? error.message : error)
      return [] as EscuelaImpacto[]
    }),
    leerSnapshots(db).catch((error) => {
      console.warn('[veredicto] impacto: radar no disponible', error instanceof Error ? error.message : error)
      return [] as SnapshotImpacto[]
    }),
    leerAislamiento(),
  ])
  return agregarImpacto({ escuelas, snapshots, aislamiento })
}

async function leerEscuelas(): Promise<EscuelaImpacto[]> {
  const { listarEscuelasMapaEnriquecidas } = await import('@/lib/infraestructura/parte-mapa')
  const { escuelas } = await listarEscuelasMapaEnriquecidas()
  return escuelas.map((e) => ({
    cueAnexo: e.cueAnexo,
    departamento: e.departamento,
    clases: e.clases,
    apoyo: e.apoyo,
    alumnosSinClases: e.alumnosSinClases,
    afectaciones: e.parte?.afectaciones.length ?? 0,
  }))
}

async function leerSnapshots(db: Db): Promise<SnapshotImpacto[]> {
  const [run] = await db.select({ id: infraRiskRun.id }).from(infraRiskRun).where(eq(infraRiskRun.estado, 'vigente')).limit(1)
  if (!run) return []
  return db
    .select({
      cueAnexo: infraRiskSnapshot.cueAnexo,
      departamento: infraGeoProfile.departamento,
      horizonteHoras: infraRiskSnapshot.horizonteHoras,
      nivelRiesgo: infraRiskSnapshot.nivelRiesgo,
      nivelRiesgoAcceso: infraRiskSnapshot.nivelRiesgoAcceso,
    })
    .from(infraRiskSnapshot)
    .innerJoin(infraGeoProfile, eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo))
    .where(and(eq(infraRiskSnapshot.runId, run.id), eq(infraRiskSnapshot.horizonteHoras, HORIZONTE_RADAR_HORAS)))
}

async function leerAislamiento(): Promise<Record<string, number | string>> {
  const { cargarTerritorioMapa } = await import('@/lib/infraestructura/territorio-mapa')
  const territorio = await cargarTerritorioMapa()
  const resultado: Record<string, number | string> = {}
  for (const [cue, a] of Object.entries(territorio.aislamiento?.escuelas ?? {})) resultado[cue] = a.nivel
  return resultado
}
