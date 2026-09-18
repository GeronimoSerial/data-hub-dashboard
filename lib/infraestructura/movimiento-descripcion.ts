// Traduce un DiffParte a español llano (spec §13 "Cambios que se
// registrarán" y §15 "Historial"). Devuelve una línea por cada cambio, en el
// mismo orden en que aparecen los ejemplos de la spec: servicio educativo,
// afectaciones agregadas/retiradas, severidades, alcance, establecimiento.
//
// Vocabulario prohibido (spec §5.4, CONTRACT.md): "versión", "entidad",
// "registro histórico", "persistencia". Ninguna cadena de este archivo los
// usa — si se agrega un caso nuevo, mantener esa restricción.
import type {
  DiffParte,
  DiffServicioAlcanceRef,
  DiffServicioCambio,
} from './movimiento-diff'
import type { EstadoEstablecimiento, ServicioEstado, TipoMovimiento } from './trayectoria-tipos'

export interface DescribirMovimientoOpciones {
  // Cuando el movimiento es el reporte inicial, la primera afectación
  // agregada se narra como "Se inició el reporte por…" en vez de
  // "Se agregó…" (spec §15, segundo ejemplo del historial). El resto de las
  // líneas usa el mismo criterio que una actualización.
  tipo?: TipoMovimiento
}

function textoServicioEstado(estado: ServicioEstado): string {
  return estado === 'suspendido' ? 'suspendidas' : 'normales'
}

function textoAlcanceServicio(alcance: DiffServicioAlcanceRef): string {
  if (alcance.tipo === 'establecimiento') return ''
  const etiqueta = alcance.etiqueta ?? alcance.referenciaId ?? ''
  if (alcance.tipo === 'turno') return ` en el turno ${etiqueta}`
  return ` en ${etiqueta}`
}

function lineaServicio(cambio: DiffServicioCambio): string {
  const sufijo = textoAlcanceServicio(cambio.alcance)
  if (cambio.de === null || cambio.a === null) {
    const estado = cambio.a ?? cambio.de
    return estado ? `Clases ${textoServicioEstado(estado)}${sufijo}` : ''
  }
  return `Clases ${textoServicioEstado(cambio.de)} → Clases ${textoServicioEstado(cambio.a)}${sufijo}`
}

function pluralizar(cantidad: number, singular: string, plural: string): string {
  return cantidad === 1 ? singular : plural
}

const ESTADO_ESTABLECIMIENTO_TEXTO: Record<EstadoEstablecimiento, string> = {
  habitual: 'Funcionamiento habitual',
  evacuado: 'Establecimiento evacuado',
  centro_evacuados: 'Utilizado como centro de evacuados',
}

export function describirMovimiento(
  diff: DiffParte,
  opciones: DescribirMovimientoOpciones = {},
): string[] {
  const lineas: string[] = []

  for (const cambio of diff.serviciosCambiados) {
    const linea = lineaServicio(cambio)
    if (linea) lineas.push(linea)
  }

  const esReporteInicial = opciones.tipo === 'reporte_inicial'

  diff.afectacionesAgregadas.forEach((agregada, indice) => {
    if (esReporteInicial && indice === 0) {
      lineas.push(`Se inició el reporte por "${agregada.motivo}"`)
      const partes: string[] = [`Severidad ${agregada.severidad}`]
      if (agregada.secciones > 0) {
        partes.push(`${agregada.secciones} ${pluralizar(agregada.secciones, 'sección', 'secciones')}`)
      }
      if (agregada.alumnos > 0) {
        partes.push(`${agregada.alumnos} ${pluralizar(agregada.alumnos, 'alumno', 'alumnos')}`)
      }
      lineas.push(partes.join(' · '))
      return
    }

    lineas.push(`Se agregó "${agregada.motivo}" · Severidad ${agregada.severidad}`)
    if (agregada.secciones > 0) {
      lineas.push(
        `${agregada.secciones} ${pluralizar(agregada.secciones, 'sección incorporada', 'secciones incorporadas')}`,
      )
    }
    if (agregada.alumnos > 0) {
      lineas.push(
        `${agregada.alumnos} ${pluralizar(agregada.alumnos, 'alumno incorporado', 'alumnos incorporados')}`,
      )
    }
  })

  for (const retirada of diff.afectacionesRetiradas) {
    lineas.push(`Se retiró "${retirada.motivo}"`)
  }

  for (const cambio of diff.severidadesCambiadas) {
    lineas.push(`Severidad de "${cambio.motivo}": ${cambio.de} → ${cambio.a}`)
  }

  for (const cambio of diff.alcancesCambiados) {
    if (cambio.seccionesAgregadas > 0) {
      lineas.push(
        `${cambio.seccionesAgregadas} ${pluralizar(cambio.seccionesAgregadas, 'sección incorporada', 'secciones incorporadas')} en "${cambio.motivo}"`,
      )
    }
    if (cambio.seccionesRetiradas > 0) {
      lineas.push(
        `${cambio.seccionesRetiradas} ${pluralizar(cambio.seccionesRetiradas, 'sección retirada', 'secciones retiradas')} de "${cambio.motivo}"`,
      )
    }
    if (cambio.alumnosAgregados > 0) {
      lineas.push(
        `${cambio.alumnosAgregados} ${pluralizar(cambio.alumnosAgregados, 'alumno incorporado', 'alumnos incorporados')} en "${cambio.motivo}"`,
      )
    }
    if (cambio.alumnosRetirados > 0) {
      lineas.push(
        `${cambio.alumnosRetirados} ${pluralizar(cambio.alumnosRetirados, 'alumno retirado', 'alumnos retirados')} de "${cambio.motivo}"`,
      )
    }
  }

  if (diff.establecimientoCambiado) {
    const { de, a } = diff.establecimientoCambiado
    lineas.push(`${ESTADO_ESTABLECIMIENTO_TEXTO[de]} → ${ESTADO_ESTABLECIMIENTO_TEXTO[a]}`)
  }

  return lineas
}
