// Filtros, resaltado e indicadores del mapa de reorganización. Replica las
// reglas de render() del mockup V29 sin React ni DOM. Los filtros reducen el
// listado y los indicadores; el mapa conserva el universo completo y atenúa
// lo que no está en idsCoincidentes. La clasificación salarial solo cambia el
// resaltado: nunca entra en el conjunto filtrado.
import type { EscuelaV29 } from './tipos'

export const ZONA_AISLADOS = 'Aislado'
export const ZONA_SIN_UBICACION = 'SIN_COORD'
export const SIN_DATO_CLASIFICACION = 'SIN_DATO'

const ETIQUETAS_ESPECIALES: Record<string, string> = {
  [ZONA_AISLADOS]: 'Aislados',
  [ZONA_SIN_UBICACION]: 'Sin ubicación',
  [SIN_DATO_CLASIFICACION]: 'Sin dato de clasificación',
}

export type TendenciaZona = 'baja' | 'sube' | 'igual' | 'sin'

export const ETIQUETAS_TENDENCIA: Record<TendenciaZona, string> = {
  baja: 'Disminuyó',
  sube: 'Aumentó',
  igual: 'Sin cambio',
  sin: 'Sin comparación',
}

export interface FiltrosReorganizacion {
  busqueda: string
  /** "" para todos. */
  departamento: string
  /** "" para todas; "Zona N", ZONA_AISLADOS o ZONA_SIN_UBICACION. */
  zona: string
  /** "" para todas. */
  tendencia: '' | TendenciaZona
  /** "" para todos; "si" con agentes o "no" sin agentes. */
  pof: '' | 'si' | 'no'
  /** Solo resalta. "" para todos; SIN_DATO_CLASIFICACION o una clasificación. */
  clasificacion: string
}

export const FILTROS_INICIALES: FiltrosReorganizacion = {
  busqueda: '',
  departamento: '',
  zona: '',
  tendencia: '',
  pof: '',
  clasificacion: '',
}

export interface ContextoFiltros {
  /** Tendencia por zona ("Zona N" -> TendenciaZona). Ausente equivale a 'sin'. */
  tendenciaPorZona: Record<string, string>
}

export interface ResultadoFiltros {
  escuelas: EscuelaV29[]
  /** CUE de las escuelas filtradas: el mapa atenúa el resto del universo. */
  idsCoincidentes: Set<string>
  seleccionActiva: boolean
}

export interface ResaltadoClasificacion {
  cues: Set<string>
  cantidad: number
}

export interface IndicadoresReorganizacion {
  establecimientos: number
  alumnos: number
  ubicados: number
  conPof: number
}

export interface OpcionesFiltro {
  departamentos: string[]
  /** "Zona N" ordenadas por número, luego aislados y sin ubicación. */
  zonas: string[]
  /** Clasificaciones presentes ordenadas, con SIN_DATO_CLASIFICACION al final. */
  clasificaciones: string[]
}

/** Etiqueta visible de una opción de zona o clasificación. */
export function etiquetaOpcion(valor: string): string {
  return ETIQUETAS_ESPECIALES[valor] ?? valor
}

// El mockup minusculiza con locale 'es' y recorta, sin normalizar acentos.
function normalizarTexto(texto: string): string {
  return texto.toLocaleLowerCase('es').trim()
}

export function hayFiltroActivo(filtros: FiltrosReorganizacion): boolean {
  return Boolean(
    filtros.departamento ||
      filtros.zona ||
      normalizarTexto(filtros.busqueda) ||
      filtros.pof ||
      filtros.tendencia ||
      filtros.clasificacion,
  )
}

function coincideBusqueda(escuela: EscuelaV29, busqueda: string): boolean {
  const consulta = normalizarTexto(busqueda)
  if (!consulta) return true
  return `${escuela.cue} ${escuela.nombre} ${escuela.localidad}`.toLocaleLowerCase('es').includes(consulta)
}

function coincideZona(zona: string, filtro: string): boolean {
  if (!filtro) return true
  if (filtro === ZONA_SIN_UBICACION) return !zona
  return zona === filtro
}

function coincidePof(escuela: EscuelaV29, pof: FiltrosReorganizacion['pof']): boolean {
  if (!pof) return true
  return pof === 'si' ? escuela.agentes > 0 : escuela.agentes === 0
}

function coincideTendencia(zona: string, tendencia: string, contexto: ContextoFiltros): boolean {
  if (!tendencia) return true
  return (contexto.tendenciaPorZona[zona] ?? 'sin') === tendencia
}

/** Clasificación salarial: sin valor cuenta como SIN_DATO_CLASIFICACION. */
export function coincideClasificacion(escuela: EscuelaV29, clasificacion: string): boolean {
  if (!clasificacion) return true
  if (clasificacion === SIN_DATO_CLASIFICACION) return !escuela.clasificacionZonaSueldos
  return escuela.clasificacionZonaSueldos === clasificacion
}

/** Aplica búsqueda, departamento, zona, POF y tendencia. Ignora la clasificación. */
export function filtrarEscuelas(
  escuelas: EscuelaV29[],
  filtros: FiltrosReorganizacion,
  contexto: ContextoFiltros,
): ResultadoFiltros {
  const filtradas = escuelas.filter(
    (e) =>
      (!filtros.departamento || e.departamento === filtros.departamento) &&
      coincideZona(e.zona, filtros.zona) &&
      coincideBusqueda(e, filtros.busqueda) &&
      coincidePof(e, filtros.pof) &&
      coincideTendencia(e.zona, filtros.tendencia, contexto),
  )
  return {
    escuelas: filtradas,
    idsCoincidentes: new Set(filtradas.map((e) => e.cue)),
    seleccionActiva: hayFiltroActivo(filtros),
  }
}

/** Resalta las escuelas filtradas que cumplen la clasificación. Sin clasificación resalta todas. */
export function resaltarPorClasificacion(
  escuelasFiltradas: EscuelaV29[],
  clasificacion: string,
): ResaltadoClasificacion {
  const cues = new Set(
    escuelasFiltradas.filter((e) => coincideClasificacion(e, clasificacion)).map((e) => e.cue),
  )
  return { cues, cantidad: cues.size }
}

/** Indicadores del listado filtrado. "Ubicado" exige coordenadas finitas. */
export function calcularIndicadores(escuelasFiltradas: EscuelaV29[]): IndicadoresReorganizacion {
  return {
    establecimientos: escuelasFiltradas.length,
    alumnos: escuelasFiltradas.reduce((total, e) => total + e.matricula, 0),
    ubicados: escuelasFiltradas.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon)).length,
    conPof: escuelasFiltradas.filter((e) => e.agentes > 0).length,
  }
}

/** Opciones de los selectores, tomadas del universo completo (no del filtrado). */
export function opcionesFiltro(escuelas: EscuelaV29[]): OpcionesFiltro {
  const departamentos = [...new Set(escuelas.map((e) => e.departamento).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  )
  const zonas = [...new Set(escuelas.map((e) => e.zona).filter((z) => z && z !== ZONA_AISLADOS))].sort(
    (a, b) => Number(a.split(' ')[1]) - Number(b.split(' ')[1]),
  )
  const clasificaciones = [
    ...new Set(escuelas.map((e) => e.clasificacionZonaSueldos).filter((c): c is string => Boolean(c))),
  ].sort((a, b) => a.localeCompare(b, 'es'))
  return {
    departamentos,
    zonas: [...zonas, ZONA_AISLADOS, ZONA_SIN_UBICACION],
    clasificaciones: [...clasificaciones, SIN_DATO_CLASIFICACION],
  }
}
