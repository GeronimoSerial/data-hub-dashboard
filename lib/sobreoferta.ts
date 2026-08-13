export type Semaforo = 'rojo' | 'amarillo' | 'verde'

export type SemaforoStyle = {
  fill: string
  stroke: string
  label: string
}

export type SobreofertaMeta = {
  medianAlumnosPorEdificio: number
  medianAlumnosPorEdificioDept: number
  medianVariacionNatalidad: number
  zoneSemaforoCounts: Record<Semaforo, number>
  departmentSemaforoCounts: Record<Semaforo, number>
  multiDepartmentZones: string[]
  colors: Record<Semaforo, SemaforoStyle>
  warnings: string[]
}

export type ZoneDeptShare = {
  key: string
  name: string
  establishmentsInZone: number
  establishmentsInDept: number
  share: number
  variacionNatalidad: number | null
}

export type ZoneSobreoferta = {
  name: string
  establishments: number
  matricula2026: number
  alumnosPorEdificio: number | null
  variacionNatalidad: number | null
  departments: ZoneDeptShare[]
  multiDepartment: boolean
  bajoDemanda: boolean
  natalidadEnCaida: boolean
  semaforo: Semaforo
  fillColor: string
  strokeColor: string
}

export type DepartmentSobreoferta = {
  key: string
  name: string
  codDpto: string
  nacidos2014: number
  nacidos2023: number
  variacionNatalidad: number
  tasaAsistencia4: number
  icseQuintil: number
  establishments: number
  matricula2026: number
  alumnosPorEdificio: number | null
  bajoDemanda: boolean
  natalidadEnCaida: boolean
  semaforo: Semaforo
  fillColor: string
  strokeColor: string
}

export type SobreofertaData = {
  generatedAt: string
  meta: SobreofertaMeta
  zones: Record<string, ZoneSobreoferta>
  departments: Record<string, DepartmentSobreoferta>
}

export const SEMAFORO_ORDER: Semaforo[] = ['rojo', 'amarillo', 'verde']

/** Mayúsculas + sin diacríticos para cruce mapa ↔ PowerBI. */
export function normalizeDept(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}
