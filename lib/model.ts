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
  ruta?: string
  storageKey?: string
  mime?: string
  nombreOriginal?: string
  size?: number
  audienciaNivelIds?: string[]
  audienciaUserIds?: string[]
}

// ── Catálogo publicado (solo recursos con archivo o visor) ─────────────────

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
  { id: 'aprendizajes', nombre: 'Aprendizajes', color: 'important' },
]

export const tags: Tag[] = [
  { id: 'nominal', nombre: 'Nominal' },
  { id: 'territorial', nombre: 'Territorial' },
  { id: 'alertas', nombre: 'Alertas' },
  { id: 'anual', nombre: 'Anual' },
  { id: 'estrategico', nombre: 'Estratégico' },
  { id: 'sobreedad', nombre: 'Sobreedad' },
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
    titulo: 'Tablero nominal de alertas de trayectorias',
    descripcion:
      'Resumen ejecutivo, establecimientos y listado nominal de alertas. Primario y secundario · corte 12/08/2026.',
    formato: 'tablero',
    nivelId: 'transversal',
    tipoId: 'monitoreo',
    categoriaId: 'trayectorias',
    tagIds: ['alertas', 'nominal'],
    area: 'Dirección de Gestión Escolar',
    actualizado: '2026-08-12',
    estado: 'publicado',
  },
  {
    id: 'r3',
    titulo: 'Mapa de calor de alertas de trayectorias',
    descripcion:
      'Visualización territorial de alertas de trayectorias. Agosto 2026.',
    formato: 'mapa',
    nivelId: 'transversal',
    tipoId: 'georref',
    categoriaId: 'trayectorias',
    tagIds: ['territorial', 'alertas'],
    area: 'Dirección de Gestión Escolar',
    actualizado: '2026-08-12',
    estado: 'publicado',
  },
  {
    id: 'r13',
    titulo: 'Mapa de sobreedad 2026',
    descripcion:
      'Análisis territorial por nivel, establecimiento y curso con categorías excluyentes de sobreedad.',
    formato: 'mapa',
    nivelId: 'transversal',
    tipoId: 'georref',
    categoriaId: 'trayectorias',
    tagIds: ['territorial', 'sobreedad'],
    area: 'Dirección de Gestión Escolar',
    actualizado: '2026-08-19',
    estado: 'publicado',
  },
  {
    id: 'r14',
    titulo: 'Mapa de notas 2026',
    descripcion:
      'Análisis territorial de calificaciones por nivel, establecimiento y espacio curricular.',
    formato: 'mapa',
    nivelId: 'transversal',
    tipoId: 'georref',
    categoriaId: 'aprendizajes',
    tagIds: ['territorial', 'anual'],
    area: 'Dirección de Gestión Escolar',
    actualizado: '2026-08-19',
    estado: 'publicado',
  },
  {
    id: 'r15',
    titulo: 'Reporte ejecutivo de sobreedad · Inicial 2026',
    descripcion:
      'Síntesis de sobreedad en el nivel inicial para la gestión educativa.',
    formato: 'reporte',
    nivelId: 'inicial',
    tipoId: 'informe',
    categoriaId: 'trayectorias',
    tagIds: ['sobreedad', 'anual', 'estrategico'],
    area: 'Dirección de Gestión Escolar',
    actualizado: '2026-08-19',
    estado: 'publicado',
  },
  {
    id: 'r16',
    titulo: 'Reporte ejecutivo de sobreedad · Primario 2026',
    descripcion:
      'Síntesis de sobreedad en el nivel primario para la gestión educativa.',
    formato: 'reporte',
    nivelId: 'primario',
    tipoId: 'informe',
    categoriaId: 'trayectorias',
    tagIds: ['sobreedad', 'anual', 'estrategico'],
    area: 'Dirección de Gestión Escolar',
    actualizado: '2026-08-19',
    estado: 'publicado',
  },
  {
    id: 'r17',
    titulo: 'Reporte ejecutivo de sobreedad · Secundario 2026',
    descripcion:
      'Síntesis de sobreedad en el nivel secundario para la gestión educativa.',
    formato: 'reporte',
    nivelId: 'secundario',
    tipoId: 'informe',
    categoriaId: 'trayectorias',
    tagIds: ['sobreedad', 'anual', 'estrategico'],
    area: 'Dirección de Gestión Escolar',
    actualizado: '2026-08-19',
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
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = dateOnly
    ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      )
    : new Date(iso)
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
