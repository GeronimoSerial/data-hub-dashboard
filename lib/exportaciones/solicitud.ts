import { parsearContextoMapaDeQuery } from '@/lib/infraestructura/mapa/estado-retorno'
import { ETIQUETA_APOYO, ETIQUETA_ESTADO_CLASES, ETIQUETA_GRAVEDAD, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'
import {
  esTipoExportacion,
  EXPORTACIONES_ESCUELAS,
  TIPOS_EXPORTACION_ESCUELAS,
  tituloExportacion,
  type TipoExportacionEscuelas,
} from './escuelas'
import type { FiltroLibro } from './libro-institucional'

export const HORIZONTE_POR_DEFECTO: HorizonteMotor = 72
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

export type FormatoExportacion = 'xlsx' | 'json'

export type SolicitudExportacion = {
  /** Estados seleccionados (unión); vacío = todas las escuelas. */
  estados: TipoExportacionEscuelas[]
  filtros: FiltrosMapa
  /** `null` cuando no se pidió horizonte: el radar sólo se carga si hace falta. */
  horizonte: HorizonteMotor | null
  formato: FormatoExportacion
  pagina: number
  tamanoPagina: number
  ordenarPor: string | null
  sentido: 'asc' | 'desc'
}

export type ResultadoSolicitudExportacion =
  | { ok: true; solicitud: SolicitudExportacion }
  | { ok: false; error: string }

/**
 * Mismos parámetros que la URL del mapa, más `estado` (repetible o separado
 * por comas), `horizonte` y `formato` (`xlsx` por defecto, o `json`).
 */
export function parsearSolicitudExportacion(params: URLSearchParams): ResultadoSolicitudExportacion {
  const valores = params
    .getAll('estado')
    .flatMap((valor) => valor.split(','))
    .map((valor) => valor.trim())
    .filter((valor) => valor !== '')
  if (valores.some((valor) => !esTipoExportacion(valor))) {
    return { ok: false, error: 'estado de exportación inválido' }
  }

  const formato = params.get('formato') ?? 'xlsx'
  if (formato !== 'xlsx' && formato !== 'json') {
    return { ok: false, error: 'formato de exportación inválido' }
  }

  const contexto = parsearContextoMapaDeQuery(params)
  if (params.has('horizonte') && contexto.horizonte === null) {
    return { ok: false, error: 'horizonte inválido' }
  }

  const pagina = Number(params.get('pagina') ?? 1)
  const tamanoPagina = Number(params.get('tamanoPagina') ?? 25)
  const sentido = params.get('sentido') ?? 'asc'
  if (!Number.isSafeInteger(pagina) || pagina < 1 ||
      !Number.isSafeInteger(tamanoPagina) || tamanoPagina < 1 || tamanoPagina > 100 ||
      pagina > Math.floor(Number.MAX_SAFE_INTEGER / tamanoPagina)) {
    return { ok: false, error: 'paginación inválida' }
  }
  if (sentido !== 'asc' && sentido !== 'desc') return { ok: false, error: 'sentido de orden inválido' }

  return {
    ok: true,
    solicitud: {
      estados: TIPOS_EXPORTACION_ESCUELAS.filter((tipo) => valores.includes(tipo)),
      filtros: { ...FILTROS_MAPA_VACIOS, ...contexto.filtrosParciales },
      horizonte: contexto.horizonte,
      formato,
      pagina,
      tamanoPagina,
      ordenarPor: params.get('ordenarPor'),
      sentido,
    },
  }
}

/** Filtros aplicados en texto legible para la cabecera del libro. */
export function etiquetasFiltros(
  filtros: FiltrosMapa,
  direcciones: ReadonlyArray<{ id: number; nombre: string }>,
  estados: readonly TipoExportacionEscuelas[] = [],
): FiltroLibro[] {
  const nombreDireccion = new Map(direcciones.map((direccion) => [direccion.id, direccion.nombre]))
  const etiquetas: FiltroLibro[] = []

  if (estados.length > 0) {
    etiquetas.push({ etiqueta: 'Estado', valor: estados.map((tipo) => EXPORTACIONES_ESCUELAS[tipo].etiqueta).join(', ') })
  }
  if (filtros.q) etiquetas.push({ etiqueta: 'Búsqueda', valor: filtros.q })
  if (filtros.departamentos.length > 0) {
    etiquetas.push({ etiqueta: 'Departamento', valor: filtros.departamentos.map(etiquetaDepartamento).join(', ') })
  }
  if (filtros.direcciones.length > 0) {
    etiquetas.push({
      etiqueta: 'Dirección',
      valor: filtros.direcciones.map((id) => nombreDireccion.get(id) ?? `Nivel ${id}`).join(', '),
    })
  }
  if (filtros.gravedades.length > 0) {
    etiquetas.push({ etiqueta: 'Gravedad', valor: filtros.gravedades.map((g) => ETIQUETA_GRAVEDAD[g]).join(', ') })
  }
  if (filtros.clases.length > 0) {
    etiquetas.push({ etiqueta: 'Estado de clases', valor: filtros.clases.map((c) => ETIQUETA_ESTADO_CLASES[c]).join(', ') })
  }
  if (filtros.apoyo.length > 0) {
    etiquetas.push({ etiqueta: 'Apoyo pedagógico', valor: filtros.apoyo.map((a) => ETIQUETA_APOYO[a]).join(', ') })
  }
  if (filtros.sinActualizar) etiquetas.push({ etiqueta: 'Sin actualizar', valor: 'Sí' })
  if (filtros.solucionadasRecientes) etiquetas.push({ etiqueta: 'Solucionadas recientes', valor: 'Sí' })

  return etiquetas.length > 0 ? etiquetas : [{ etiqueta: 'Filtros', valor: 'Sin filtros aplicados' }]
}

/** Slug del título de los estados más la fecha en hora de Buenos Aires. */
export function nombreArchivoExportacion(estados: readonly TipoExportacionEscuelas[], fecha: Date): string {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(fecha)
  const slug = tituloExportacion(estados)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug}-${dia}.xlsx`
}
