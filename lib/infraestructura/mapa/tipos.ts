import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'

export type PestanaMapa = 'actual' | 'radar' | 'planificacion' | 'estadisticas' | 'capas'

export type EstadoClases = 'normal' | 'parcial' | 'sin' | 'evacuado' | 'centro'
export type ApoyoPedagogico = 'virtual' | 'cuadernillo' | 'ambos' | 'brinda' | 'no' | 'sin_dato' | null // null = no corresponde
export type GravedadMapa = 0 | 1 | 2 | 3 | 4 // 0 sin reporte, 1 Baja … 4 Crítica

export interface EscuelaMapaEnriquecida {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
  niveles: string[]
  alumnos: number
  gravedad: GravedadMapa
  categoriaPrincipal: string | null
  clases: EstadoClases
  apoyo: ApoyoPedagogico
  sinActualizar: boolean
  ultimaNovedad: string | null
  alumnosSinClases: number
  // Cantidad de filas de infra_afectacion de la escuela, en todos los períodos y estados; cada fila cuenta una vez.
  situacionesHistoricas: number
  // Cantidad de situaciones solucionadas en los últimos 15 días.
  solucionadasRecientes: number
  parte?: ParteMapa
}

export interface FiltrosMapa {
  q: string
  departamentos: string[]
  niveles: string[]
  gravedades: GravedadMapa[]
  clases: EstadoClases[]
  apoyo: Array<'brinda' | 'no' | 'sin_dato'>
  sinActualizar: boolean
  solucionadasRecientes: boolean
}

export const FILTROS_MAPA_VACIOS: FiltrosMapa = {
  q: '', departamentos: [], niveles: [], gravedades: [], clases: [], apoyo: [], sinActualizar: false, solucionadasRecientes: false,
}
