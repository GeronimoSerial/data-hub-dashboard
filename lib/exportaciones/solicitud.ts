import { parsearContextoMapaDeQuery } from '@/lib/infraestructura/mapa/estado-retorno'
import { ETIQUETA_APOYO, ETIQUETA_ESTADO_CLASES, ETIQUETA_GRAVEDAD, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'
import { esTipoExportacion, EXPORTACIONES_ESCUELAS, type TipoExportacionEscuelas } from './escuelas'
import type { FiltroLibro } from './libro-institucional'

const HORIZONTE_POR_DEFECTO: HorizonteMotor = 72
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

export type SolicitudExportacion = {
  tipo: TipoExportacionEscuelas
  filtros: FiltrosMapa
  horizonte: HorizonteMotor
}

export type ResultadoSolicitudExportacion =
  | { ok: true; solicitud: SolicitudExportacion }
  | { ok: false; error: string }

/** Mismos parámetros que la URL del mapa, más `tipo` y `horizonte`. */
export function parsearSolicitudExportacion(params: URLSearchParams): ResultadoSolicitudExportacion {
  const tipo = params.get('tipo')
  if (tipo === null || !esTipoExportacion(tipo)) {
    return { ok: false, error: 'tipo de exportación inválido' }
  }

  const contexto = parsearContextoMapaDeQuery(params)
  if (params.has('horizonte') && contexto.horizonte === null) {
    return { ok: false, error: 'horizonte inválido' }
  }

  return {
    ok: true,
    solicitud: {
      tipo,
      filtros: { ...FILTROS_MAPA_VACIOS, ...contexto.filtrosParciales },
      horizonte: contexto.horizonte ?? HORIZONTE_POR_DEFECTO,
    },
  }
}

/** Filtros aplicados en texto legible para la cabecera del libro. */
export function etiquetasFiltros(
  filtros: FiltrosMapa,
  direcciones: ReadonlyArray<{ id: number; nombre: string }>,
): FiltroLibro[] {
  const nombreDireccion = new Map(direcciones.map((direccion) => [direccion.id, direccion.nombre]))
  const etiquetas: FiltroLibro[] = []

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

export function nombreArchivoExportacion(tipo: TipoExportacionEscuelas, fecha: Date): string {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(fecha)
  return `${EXPORTACIONES_ESCUELAS[tipo].nombreArchivo}-${dia}.xlsx`
}
