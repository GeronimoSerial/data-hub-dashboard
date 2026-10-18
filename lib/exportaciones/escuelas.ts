import { ETIQUETA_ESTADO_CLASES, ETIQUETA_GRAVEDAD, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { valorApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import {
  escuelasEnRadar,
  ETIQUETA_NIVEL_RIESGO,
  type HorizonteMotor,
  type NivelRiesgo,
} from '@/lib/infraestructura/mapa/radar'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { ColumnaLibro } from './libro-institucional'

export const TIPOS_EXPORTACION_ESCUELAS = ['afectadas', 'sin-clases', 'con-clases', 'asistidas', 'en-riesgo'] as const

export type TipoExportacionEscuelas = (typeof TIPOS_EXPORTACION_ESCUELAS)[number]

export function esTipoExportacion(valor: string): valor is TipoExportacionEscuelas {
  return (TIPOS_EXPORTACION_ESCUELAS as readonly string[]).includes(valor)
}

/**
 * Datos que no viven en la escuela. `riesgoPorCue` lo arma el llamador con
 * `riesgoPorCueDesdeRadar` (mismo radar que el panel y el mapa).
 */
export interface ContextoExportacionEscuelas {
  riesgoPorCue?: ReadonlyMap<string, NivelRiesgo>
}

export interface DefinicionExportacionEscuelas {
  titulo: string
  nombreArchivo: string
  incluye: (escuela: EscuelaMapaEnriquecida, contexto: ContextoExportacionEscuelas) => boolean
  columnas: ColumnaLibro[]
  valores: (escuela: EscuelaMapaEnriquecida, contexto: ContextoExportacionEscuelas) => Record<string, unknown>
}

const COLUMNAS_BASE: ColumnaLibro[] = [
  { clave: 'cue', encabezado: 'CUE anexo', ancho: 16 },
  { clave: 'escuela', encabezado: 'Escuela', ancho: 36 },
  { clave: 'departamento', encabezado: 'Departamento', ancho: 20 },
  { clave: 'localidad', encabezado: 'Localidad', ancho: 20 },
  { clave: 'direccion', encabezado: 'Dirección', ancho: 22 },
  { clave: 'niveles', encabezado: 'Niveles', ancho: 26 },
  { clave: 'matricula', encabezado: 'Matrícula', ancho: 12, formato: 'entero' },
]

const COLUMNA_ESTADO_CLASES: ColumnaLibro = { clave: 'estadoClases', encabezado: 'Estado de clases', ancho: 22 }
const COLUMNA_ALUMNOS_SIN_CLASES: ColumnaLibro = { clave: 'alumnosSinClases', encabezado: 'Alumnos sin clases', ancho: 16, formato: 'entero' }
const COLUMNA_ASISTENCIA: ColumnaLibro = { clave: 'asistencia', encabezado: 'Asistencia pedagógica', ancho: 24 }
const COLUMNA_ULTIMA_NOVEDAD: ColumnaLibro = { clave: 'ultimaNovedad', encabezado: 'Última novedad', ancho: 16, formato: 'fecha' }

const APOYO_BRINDADO = new Set<EscuelaMapaEnriquecida['apoyo']>(['virtual', 'cuadernillo', 'ambos', 'brinda'])

function valoresBase(escuela: EscuelaMapaEnriquecida): Record<string, unknown> {
  return {
    cue: escuela.cueAnexo,
    escuela: escuela.nombre,
    departamento: etiquetaDepartamento(escuela.departamento),
    localidad: escuela.localidad,
    direccion: escuela.nivelJurisdiccionalNombre ?? null,
    niveles: escuela.niveles.join(', '),
    matricula: escuela.alumnos,
  }
}

function valoresClases(escuela: EscuelaMapaEnriquecida): Record<string, unknown> {
  return {
    estadoClases: ETIQUETA_ESTADO_CLASES[escuela.clases],
    alumnosSinClases: escuela.alumnosSinClases,
    asistencia: valorApoyoMapa(escuela.clases, escuela.apoyo) ?? null,
  }
}

function fechaDeNovedad(iso: string | null): Date | null {
  if (iso === null) return null
  const fecha = new Date(iso)
  return Number.isFinite(fecha.getTime()) ? fecha : null
}

const sinClases = (escuela: EscuelaMapaEnriquecida) => escuela.clases !== 'normal'

export const EXPORTACIONES_ESCUELAS: Record<TipoExportacionEscuelas, DefinicionExportacionEscuelas> = {
  afectadas: {
    titulo: 'Escuelas afectadas',
    nombreArchivo: 'escuelas-afectadas',
    incluye: (escuela) => escuela.parte !== undefined,
    columnas: [
      ...COLUMNAS_BASE,
      { clave: 'gravedad', encabezado: 'Gravedad', ancho: 16 },
      { clave: 'categoria', encabezado: 'Categoría principal', ancho: 22 },
      COLUMNA_ULTIMA_NOVEDAD,
    ],
    valores: (escuela) => ({
      gravedad: ETIQUETA_GRAVEDAD[escuela.gravedad],
      categoria: escuela.categoriaPrincipal ?? null,
      ultimaNovedad: fechaDeNovedad(escuela.ultimaNovedad),
    }),
  },
  'sin-clases': {
    titulo: 'Escuelas sin clases',
    nombreArchivo: 'escuelas-sin-clases',
    incluye: sinClases,
    columnas: [...COLUMNAS_BASE, COLUMNA_ESTADO_CLASES, COLUMNA_ALUMNOS_SIN_CLASES, COLUMNA_ASISTENCIA],
    valores: (escuela) => valoresClases(escuela),
  },
  'con-clases': {
    titulo: 'Escuelas con clases',
    nombreArchivo: 'escuelas-con-clases',
    incluye: (escuela) => !sinClases(escuela),
    columnas: [...COLUMNAS_BASE, COLUMNA_ULTIMA_NOVEDAD],
    valores: (escuela) => ({ ultimaNovedad: fechaDeNovedad(escuela.ultimaNovedad) }),
  },
  asistidas: {
    titulo: 'Escuelas con asistencia pedagógica',
    nombreArchivo: 'escuelas-asistidas',
    incluye: (escuela) => APOYO_BRINDADO.has(escuela.apoyo),
    columnas: [...COLUMNAS_BASE, COLUMNA_ESTADO_CLASES, COLUMNA_ALUMNOS_SIN_CLASES, COLUMNA_ASISTENCIA],
    valores: (escuela) => valoresClases(escuela),
  },
  'en-riesgo': {
    titulo: 'Escuelas en riesgo',
    nombreArchivo: 'escuelas-en-riesgo',
    incluye: (escuela, contexto) => contexto.riesgoPorCue?.has(escuela.cueAnexo) ?? false,
    columnas: [...COLUMNAS_BASE, { clave: 'nivelRiesgo', encabezado: 'Nivel de riesgo', ancho: 16 }],
    valores: (escuela, contexto) => {
      const nivel = contexto.riesgoPorCue?.get(escuela.cueAnexo)
      return { nivelRiesgo: nivel ? ETIQUETA_NIVEL_RIESGO[nivel] : null }
    },
  },
}

/** Cruza el radar con las escuelas: cue → nivel de riesgo de las escuelas que el radar muestra. */
export function riesgoPorCueDesdeRadar(
  puntos: Parameters<typeof escuelasEnRadar>[0],
  escuelas: EscuelaMapaEnriquecida[],
  horizonte: HorizonteMotor,
): Map<string, NivelRiesgo> {
  return new Map(escuelasEnRadar(puntos, escuelas, horizonte).map(({ escuela, nivel }) => [escuela.cueAnexo, nivel]))
}

/** Filas del tipo indicado, ordenadas por departamento y nombre; no modifica `escuelas`. */
export function filasExportacion(
  tipo: TipoExportacionEscuelas,
  escuelas: EscuelaMapaEnriquecida[],
  contexto: ContextoExportacionEscuelas = {},
): Record<string, unknown>[] {
  const definicion = EXPORTACIONES_ESCUELAS[tipo]
  return escuelas
    .filter((escuela) => definicion.incluye(escuela, contexto))
    .sort((a, b) => a.departamento.localeCompare(b.departamento, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
    .map((escuela) => ({ ...valoresBase(escuela), ...definicion.valores(escuela, contexto) }))
}
