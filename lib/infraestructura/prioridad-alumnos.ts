import type { Severidad } from './validacion'
import type { TurnoContexto } from './contexto'

export interface ImpactoAlumnos {
  afectados: number
  matricula: number | null
  porcentaje: number | null
  prioridad: Severidad | null
  corteId: number | null
  version: 1
}

const MATRIZ: readonly (readonly Severidad[])[] = [
  ['Baja', 'Baja', 'Media', 'Alta'],
  ['Baja', 'Media', 'Alta', 'Alta'],
  ['Media', 'Media', 'Alta', 'Crítica'],
  ['Media', 'Alta', 'Crítica', 'Crítica'],
]

export function calcularPrioridadAlumnos(afectados: number, matricula: number | null, corteId: number | null = null): ImpactoAlumnos {
  const valido = Number.isInteger(afectados) && afectados > 0 && matricula !== null &&
    Number.isInteger(matricula) && matricula > 0 && afectados <= matricula
  if (!valido) return { afectados, matricula, porcentaje: null, prioridad: null, corteId, version: 1 }
  const porcentaje = afectados / matricula! * 100
  const fila = porcentaje < 10 ? 0 : porcentaje < 30 ? 1 : porcentaje < 60 ? 2 : 3
  const columna = afectados < 10 ? 0 : afectados < 50 ? 1 : afectados < 200 ? 2 : 3
  return { afectados, matricula, porcentaje, prioridad: MATRIZ[fila][columna], corteId, version: 1 }
}

export function impactoDeAlumnos(afectados: Iterable<number>, matriculados: Iterable<number>, corteId: number | null): ImpactoAlumnos {
  const padron = new Set(matriculados)
  const seleccion = new Set([...afectados].filter((id) => padron.has(id)))
  return calcularPrioridadAlumnos(seleccion.size, padron.size, corteId)
}

export function textoImpactoAlumnos(impacto: ImpactoAlumnos): string {
  if (impacto.prioridad === null) return 'Sin datos para calcular la prioridad'
  const porcentaje = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(impacto.porcentaje!)
  return `${impacto.afectados} de ${impacto.matricula} alumnos · ${porcentaje}% · Prioridad ${impacto.prioridad}`
}

export function proyectarImpactoAlumnos<T extends {
  categoria: string
  severidad: Severidad
  secciones: Array<{ alumnos: number[] }>
}>(afectacion: T, matriculados: Iterable<number>, corteId: number | null): T & { impactoAlumnos?: ImpactoAlumnos } {
  if (afectacion.categoria !== 'alumnos') return afectacion
  const impactoAlumnos = impactoDeAlumnos(afectacion.secciones.flatMap((s) => s.alumnos), matriculados, corteId)
  return { ...afectacion, severidad: impactoAlumnos.prioridad ?? afectacion.severidad, impactoAlumnos }
}

export function prioridadEfectiva(situacion: { severidad: Severidad; impactoAlumnos?: ImpactoAlumnos }): Severidad | null {
  return situacion.impactoAlumnos ? situacion.impactoAlumnos.prioridad : situacion.severidad
}

export function impactoAlumnosEnContexto(alumnos: number[], turnos: TurnoContexto[]): ImpactoAlumnos {
  const secciones = turnos.flatMap((t) => t.niveles.flatMap((n) => n.secciones))
  if (secciones.every((s) => s.alumnosMatriculados !== undefined)) {
    return impactoDeAlumnos(alumnos, secciones.flatMap((s) => s.alumnosMatriculados!), null)
  }
  if (secciones.every((s) => s.alumnos.length === s.matricula)) {
    return impactoDeAlumnos(alumnos, secciones.flatMap((s) => s.alumnos.map((a) => a.gePersonId)), null)
  }
  return calcularPrioridadAlumnos(new Set(alumnos).size, null)
}
