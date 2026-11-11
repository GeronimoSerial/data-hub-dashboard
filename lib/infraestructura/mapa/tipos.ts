import type { ImpactoAlumnos } from '../prioridad-alumnos'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import type { EstadoComedor } from '@/lib/infraestructura/comedores/estado'

export type PestanaMapa = 'actual' | 'radar' | 'planificacion' | 'estadisticas' | 'capas' | 'metodologia' | 'exportar'

export type EstadoClases = 'normal' | 'parcial' | 'sin' | 'evacuado' | 'centro'
export type ApoyoPedagogico = 'virtual' | 'cuadernillo' | 'ambos' | 'brinda' | 'no' | 'sin_dato' | null // null = no corresponde
export type GravedadMapa = 0 | 1 | 2 | 3 | 4 // 0 sin reporte, 1 Baja … 4 Crítica

export interface EscuelaMapaEnriquecida {
  impactoAlumnos?: ImpactoAlumnos
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
  niveles: string[]
  // Dirección (nivel jurisdiccional de GE); null si el CUE no tiene nivel cargado.
  nivelJurisdiccionalId?: number | null
  nivelJurisdiccionalNombre?: string | null
  alumnos: number
  // Sólo institutos superiores: carreras vigentes en la matrícula (sin niveles GE).
  carreras?: number
  gravedad: GravedadMapa
  categoriaPrincipal: string | null
  clases: EstadoClases
  clasesInformadas?: boolean
  apoyo: ApoyoPedagogico
  sinActualizar: boolean
  ultimaNovedad: string | null
  alumnosSinClases: number
  // Cantidad de filas de infra_afectacion de la escuela, en todos los períodos y estados; cada fila cuenta una vez.
  situacionesHistoricas: number
  // Cantidad de situaciones solucionadas en los últimos 15 días.
  solucionadasRecientes: number
  // Servicio de comedor (planilla MEC); ausente = sin dato de comedor cargado.
  comedor?: EstadoComedor
  // Sugerencia calculada a diario: sin evidencia positiva de riesgo (el dato ausente no descarta). No es el estado reportado `centro`.
  posibleCentroEvacuados?: boolean
  // Apta porque no hay ningún dato de riesgo, sitio ni ruta (no por evidencia de seguridad).
  posibleCentroSinAntecedentes?: boolean
  parte?: ParteMapa
}

export interface FiltrosMapa {
  q: string
  departamentos: string[]
  direcciones: number[]
  gravedades: GravedadMapa[]
  clases: EstadoClases[]
  apoyo: Array<'brinda' | 'no' | 'sin_dato'>
  sinActualizar: boolean
  solucionadasRecientes: boolean
  conComedor: boolean
}

export const FILTROS_MAPA_VACIOS: FiltrosMapa = {
  q: '', departamentos: [], direcciones: [], gravedades: [], clases: [], apoyo: [], sinActualizar: false, solucionadasRecientes: false, conComedor: false,
}
