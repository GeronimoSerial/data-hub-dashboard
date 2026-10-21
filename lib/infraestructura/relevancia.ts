import { prioridadEfectiva, type ImpactoAlumnos } from './prioridad-alumnos'
import type { EstadoEstablecimiento } from './trayectoria-tipos'
import type { Severidad } from './validacion'

// Spec rediseño §3.3: única definición de "qué situación pesa más". La usan
// el orden de la pantalla Actualizar y la situación principal del mapa; no
// se redefine por componente.
const PESO_SEVERIDAD: Record<Severidad, number> = { Crítica: 4, Alta: 3, Media: 2, Baja: 1 }
const PESO_EDIFICIO: Record<EstadoEstablecimiento, number> = {
  evacuado: 4,
  centro_evacuados: 3,
  sin_clases: 3,
  parcial: 2,
  habitual: 1,
}

export interface SituacionRelevancia {
  impactoAlumnos?: ImpactoAlumnos
  severidad: Severidad
  estadoEstablecimiento: EstadoEstablecimiento
  rigeDesde: string
  creadaEn: string
}

export function compararRelevancia(a: SituacionRelevancia, b: SituacionRelevancia): number {
  return (
    (PESO_SEVERIDAD[prioridadEfectiva(b)!] ?? 0) - (PESO_SEVERIDAD[prioridadEfectiva(a)!] ?? 0) ||
    PESO_EDIFICIO[b.estadoEstablecimiento] - PESO_EDIFICIO[a.estadoEstablecimiento] ||
    (b.impactoAlumnos?.afectados ?? 0) - (a.impactoAlumnos?.afectados ?? 0) ||
    (b.impactoAlumnos?.porcentaje ?? 0) - (a.impactoAlumnos?.porcentaje ?? 0) ||
    Date.parse(b.rigeDesde) - Date.parse(a.rigeDesde) ||
    Date.parse(b.creadaEn) - Date.parse(a.creadaEn)
  )
}

export function situacionPrincipal<T extends SituacionRelevancia>(situaciones: T[]): T | null {
  return [...situaciones].sort(compararRelevancia)[0] ?? null
}
