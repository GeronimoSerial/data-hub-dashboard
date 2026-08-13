// ─────────────────────────────────────────────────────────────────────────
// Modelo de información del Hub de Datos
// Fuente única de verdad: el Hub, las vistas por formato y la Administración
// consumen exactamente las mismas entidades. No se duplican estructuras.
// ─────────────────────────────────────────────────────────────────────────

/**
 * FORMATO = distinción estructural de tipo de contenido.
 * Es el eje que diferencia visualmente el Hub. Es un enum fijo (no se
 * administra como taxonomía) porque define cómo se consume el recurso.
 */
export type Formato = 'reporte' | 'tablero' | 'mapa'

export const FORMATOS: Record<
  Formato,
  { label: string; plural: string; descripcion: string; color: BadgeColor }
> = {
  reporte: {
    label: 'Reporte',
    plural: 'Reportes',
    descripcion:
      'Documentos, informes e indicadores producidos por las áreas. Se consultan y descargan.',
    color: 'brand',
  },
  tablero: {
    label: 'Tablero',
    plural: 'Tableros',
    descripcion:
      'Paneles interactivos de seguimiento y monitoreo con datos actualizados.',
    color: 'success',
  },
  mapa: {
    label: 'Mapa',
    plural: 'Mapas',
    descripcion:
      'Visualizaciones territoriales y georreferenciadas del sistema educativo.',
    color: 'warning',
  },
}

export type BadgeColor =
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'informative'
  | 'severe'
  | 'important'
  | 'subtle'

// ── Taxonomías administrables (sin duplicación) ────────────────────────────

/** Nivel educativo — eje primario de clasificación de reportes. */
export interface Nivel {
  id: string
  nombre: string
  orden: number
}

/** Tipo — clasificación funcional del recurso (informe, indicador, etc.). */
export interface Tipo {
  id: string
  nombre: string
  /** formatos a los que aplica este tipo */
  aplicaA: Formato[]
}

/** Categoría — agrupación temática. Es el TAG principal visible del recurso. */
export interface Categoria {
  id: string
  nombre: string
  color: BadgeColor
}

/** Tag — etiqueta de clasificación secundaria, libre y escalable. */
export interface Tag {
  id: string
  nombre: string
}

/** Recurso — unidad base del Hub. Referencia a las taxonomías por id. */
export interface Recurso {
  id: string
  titulo: string
  descripcion: string
  formato: Formato
  nivelId: string
  tipoId: string
  categoriaId: string
  tagIds: string[]
  area: string
  actualizado: string
  estado: 'publicado' | 'borrador'
  /** In-app path. When set, catalog cards navigate here. */
  ruta?: string
}

// ── Datos de ejemplo (Análisis Educativo · Corrientes) ─────────────────────

export const niveles: Nivel[] = [
  { id: 'inicial', nombre: 'Inicial', orden: 1 },
  { id: 'primario', nombre: 'Primario', orden: 2 },
  { id: 'secundario', nombre: 'Secundario', orden: 3 },
  { id: 'superior', nombre: 'Superior', orden: 4 },
  { id: 'transversal', nombre: 'Transversal', orden: 5 },
]

export const tipos: Tipo[] = [
  { id: 'informe', nombre: 'Informe de gestión', aplicaA: ['reporte'] },
  { id: 'boletin', nombre: 'Boletín estadístico', aplicaA: ['reporte'] },
  { id: 'indicador', nombre: 'Indicador', aplicaA: ['reporte'] },
  { id: 'serie', nombre: 'Serie histórica', aplicaA: ['reporte'] },
  { id: 'monitoreo', nombre: 'Monitoreo', aplicaA: ['tablero'] },
  { id: 'georref', nombre: 'Georreferencial', aplicaA: ['mapa'] },
]

export const categorias: Categoria[] = [
  { id: 'matricula', nombre: 'Matrícula', color: 'brand' },
  { id: 'trayectorias', nombre: 'Trayectorias', color: 'informative' },
  { id: 'asistencia', nombre: 'Asistencia', color: 'severe' },
  { id: 'infraestructura', nombre: 'Infraestructura', color: 'warning' },
  { id: 'rrhh', nombre: 'Recursos humanos', color: 'success' },
  { id: 'aprendizajes', nombre: 'Aprendizajes', color: 'important' },
]

export const tags: Tag[] = [
  { id: 'nominal', nombre: 'Nominal' },
  { id: 'territorial', nombre: 'Territorial' },
  { id: 'alertas', nombre: 'Alertas' },
  { id: 'anual', nombre: 'Anual' },
  { id: 'historico', nombre: 'Histórico' },
  { id: 'estrategico', nombre: 'Estratégico' },
  { id: 'tiempo-real', nombre: 'Tiempo real' },
]

export const recursos: Recurso[] = [
  {
    id: 'r1',
    titulo: 'Mapa de matrícula provincial',
    descripcion:
      'Estudiantes y establecimientos georreferenciados en el territorio provincial.',
    formato: 'mapa',
    nivelId: 'transversal',
    tipoId: 'georref',
    categoriaId: 'matricula',
    tagIds: ['territorial', 'nominal'],
    area: 'Dirección de Sistemas de Información',
    actualizado: '2026-07-28',
    estado: 'publicado',
    ruta: '/mapas/matricula',
  },
  {
    id: 'r2',
    titulo: 'Tablero de control de inasistencias',
    descripcion:
      'Alertas por inasistencias nominales para el seguimiento de la gestión escolar.',
    formato: 'tablero',
    nivelId: 'secundario',
    tipoId: 'monitoreo',
    categoriaId: 'asistencia',
    tagIds: ['alertas', 'nominal', 'tiempo-real'],
    area: 'Dirección de Gestión Escolar',
    actualizado: '2026-08-05',
    estado: 'publicado',
  },
  {
    id: 'r3',
    titulo: 'Mapa interactivo de alertas',
    descripcion: 'Visualización territorial de alertas por inasistencias.',
    formato: 'mapa',
    nivelId: 'secundario',
    tipoId: 'georref',
    categoriaId: 'asistencia',
    tagIds: ['territorial', 'alertas'],
    area: 'Dirección de Sistemas de Información',
    actualizado: '2026-08-02',
    estado: 'publicado',
  },
  {
    id: 'r4',
    titulo: 'Boletín de matrícula 2025',
    descripcion:
      'Síntesis estadística de la matrícula del nivel primario para el ciclo 2025.',
    formato: 'reporte',
    nivelId: 'primario',
    tipoId: 'boletin',
    categoriaId: 'matricula',
    tagIds: ['anual'],
    area: 'Dirección de Planeamiento',
    actualizado: '2026-03-15',
    estado: 'publicado',
  },
  {
    id: 'r5',
    titulo: 'Informe de trayectorias escolares',
    descripcion:
      'Análisis de continuidad, promoción y egreso en el nivel secundario.',
    formato: 'reporte',
    nivelId: 'secundario',
    tipoId: 'informe',
    categoriaId: 'trayectorias',
    tagIds: ['estrategico', 'anual'],
    area: 'Dirección de Gestión Escolar',
    actualizado: '2026-06-20',
    estado: 'publicado',
  },
  {
    id: 'r6',
    titulo: 'Indicadores de repitencia',
    descripcion:
      'Tasas de repitencia por departamento y modalidad en el nivel primario.',
    formato: 'reporte',
    nivelId: 'primario',
    tipoId: 'indicador',
    categoriaId: 'trayectorias',
    tagIds: ['anual', 'territorial'],
    area: 'Dirección de Planeamiento',
    actualizado: '2026-05-10',
    estado: 'publicado',
  },
  {
    id: 'r7',
    titulo: 'Serie histórica de matrícula',
    descripcion: 'Evolución de la matrícula provincial en la última década.',
    formato: 'reporte',
    nivelId: 'transversal',
    tipoId: 'serie',
    categoriaId: 'matricula',
    tagIds: ['historico'],
    area: 'Dirección de Planeamiento',
    actualizado: '2026-02-01',
    estado: 'publicado',
  },
  {
    id: 'r8',
    titulo: 'Informe de infraestructura escolar',
    descripcion:
      'Estado edilicio y disponibilidad de servicios en los establecimientos.',
    formato: 'reporte',
    nivelId: 'transversal',
    tipoId: 'informe',
    categoriaId: 'infraestructura',
    tagIds: ['territorial', 'estrategico'],
    area: 'Dirección de Infraestructura',
    actualizado: '2026-04-18',
    estado: 'publicado',
  },
  {
    id: 'r9',
    titulo: 'Tablero de recursos humanos',
    descripcion:
      'Planta funcional, coberturas y suplencias del sistema educativo.',
    formato: 'tablero',
    nivelId: 'transversal',
    tipoId: 'monitoreo',
    categoriaId: 'rrhh',
    tagIds: ['estrategico'],
    area: 'Dirección de Recursos Humanos',
    actualizado: '2026-08-08',
    estado: 'publicado',
  },
  {
    id: 'r10',
    titulo: 'Boletín de nivel inicial',
    descripcion: 'Cobertura y matrícula del nivel inicial por departamento.',
    formato: 'reporte',
    nivelId: 'inicial',
    tipoId: 'boletin',
    categoriaId: 'matricula',
    tagIds: ['anual'],
    area: 'Dirección de Planeamiento',
    actualizado: '2026-03-22',
    estado: 'publicado',
  },
  {
    id: 'r11',
    titulo: 'Informe de resultados de aprendizaje',
    descripcion:
      'Desempeños en evaluaciones estandarizadas del nivel superior.',
    formato: 'reporte',
    nivelId: 'superior',
    tipoId: 'informe',
    categoriaId: 'aprendizajes',
    tagIds: ['estrategico'],
    area: 'Dirección de Evaluación',
    actualizado: '2026-07-01',
    estado: 'borrador',
  },
  {
    id: 'r12',
    titulo: 'Tablero de matrícula territorial',
    descripcion:
      'Distribución de la matrícula por departamento con seguimiento mensual.',
    formato: 'tablero',
    nivelId: 'transversal',
    tipoId: 'monitoreo',
    categoriaId: 'matricula',
    tagIds: ['territorial', 'tiempo-real'],
    area: 'Dirección de Sistemas de Información',
    actualizado: '2026-08-09',
    estado: 'publicado',
  },
]

// ── Helpers de resolución de referencias ───────────────────────────────────

export function nivelNombre(list: Nivel[], id: string) {
  return list.find((n) => n.id === id)?.nombre ?? '—'
}
export function tipoNombre(list: Tipo[], id: string) {
  return list.find((t) => t.id === id)?.nombre ?? '—'
}
export function categoria(list: Categoria[], id: string) {
  return list.find((c) => c.id === id)
}
export function tagNombres(list: Tag[], ids: string[]) {
  return ids
    .map((id) => list.find((t) => t.id === id)?.nombre)
    .filter((x): x is string => Boolean(x))
}

export function formatearFecha(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
