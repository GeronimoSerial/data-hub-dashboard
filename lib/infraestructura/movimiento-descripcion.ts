// Traduce un DiffParte a español llano (spec §13 "Cambios que se
// registrarán" y §15 "Historial"). Devuelve una línea por cada cambio, en el
// mismo orden en que aparecen los ejemplos de la spec: servicio educativo,
// afectaciones agregadas/retiradas, severidades, alcance, establecimiento.
//
// Vocabulario prohibido (spec §5.4, CONTRACT.md): "versión", "entidad",
// "registro histórico", "persistencia". Ninguna cadena de este archivo los
// usa — si se agrega un caso nuevo, mantener esa restricción.
import type {
  DiffDatosCambio,
  DiffParte,
  DiffServicioAlcanceRef,
  DiffServicioCambio,
} from './movimiento-diff'
import type { EstadoEstablecimiento, SeccionEstablecimiento, ServicioEstado, TipoMovimiento } from './trayectoria-tipos'

export interface DescribirMovimientoOpciones {
  // Cuando el movimiento es el reporte inicial, la primera afectación
  // agregada se narra como "Se inició la situación…" en vez de
  // "Se agregó…" (spec §15, segundo ejemplo del historial). El resto de las
  // líneas usa el mismo criterio que una actualización.
  tipo?: TipoMovimiento
  secciones?: SeccionEstablecimiento[]
}

function textoServicioEstado(estado: ServicioEstado): string {
  return estado === 'suspendido' ? 'interrumpido' : 'habitual'
}

export function resolverNombreSeccion(
  referenciaId: string | null,
  secciones: SeccionEstablecimiento[],
): string | null {
  const id = Number(referenciaId)
  if (!Number.isSafeInteger(id) || referenciaId === null) return null
  const seccion = secciones.find((item) => item.geSectionId === id)
  if (!seccion?.curso || !seccion.division || !seccion.turno) return null
  return `${seccion.curso} "${seccion.division}" (${seccion.turno})`
}

function textoAlcanceServicio(
  alcance: DiffServicioAlcanceRef,
  secciones: SeccionEstablecimiento[],
): string {
  if (alcance.tipo === 'establecimiento') return ''
  const etiqueta = alcance.tipo === 'seccion'
    ? (alcance.etiqueta && !/^\d+$/.test(alcance.etiqueta) ? alcance.etiqueta : null)
      ?? resolverNombreSeccion(alcance.referenciaId, secciones)
      ?? '1 sección'
    : alcance.etiqueta ?? (alcance.tipo === 'turno' ? alcance.referenciaId : null) ?? ''
  if (alcance.tipo === 'turno') return ` en el turno ${etiqueta}`
  return ` en ${etiqueta}`
}

function lineaServicio(cambio: DiffServicioCambio, secciones: SeccionEstablecimiento[]): string {
  const sufijo = textoAlcanceServicio(cambio.alcance, secciones)
  if (cambio.de === null || cambio.a === null) {
    const estado = cambio.a ?? cambio.de
    return estado ? `Funcionamiento: ${textoServicioEstado(estado)}${sufijo}` : ''
  }
  return `Funcionamiento: ${textoServicioEstado(cambio.de)} → ${textoServicioEstado(cambio.a)}${sufijo}`
}

function lineasServicio(cambios: DiffServicioCambio[], secciones: SeccionEstablecimiento[]): string[] {
  const grupos = new Map<string, { base: string; alcance: DiffServicioCambio['alcance']; nombres: string[]; sinNombre: number }>()
  for (const cambio of cambios) {
    const clave = `${cambio.de ?? ''}|${cambio.a ?? ''}|${cambio.alcance.tipo}`
    let grupo = grupos.get(clave)
    if (!grupo) {
      grupo = { base: lineaServicio({ ...cambio, alcance: { tipo: 'establecimiento', referenciaId: null } }, secciones), alcance: cambio.alcance, nombres: [], sinNombre: 0 }
      grupos.set(clave, grupo)
    }
    if (cambio.alcance.tipo === 'seccion') {
      const nombre = cambio.alcance.etiqueta && !/^\d+$/.test(cambio.alcance.etiqueta)
        ? cambio.alcance.etiqueta
        : resolverNombreSeccion(cambio.alcance.referenciaId, secciones)
      if (nombre) grupo.nombres.push(nombre)
      else grupo.sinNombre++
    } else if (cambio.alcance.tipo === 'turno') {
      const nombre = cambio.alcance.etiqueta ?? cambio.alcance.referenciaId
      if (nombre) grupo.nombres.push(`turno ${nombre}`)
    }
  }

  return [...grupos.values()].map((grupo) => {
    const alcances = [...grupo.nombres]
    if (grupo.sinNombre > 0) alcances.push(`${grupo.sinNombre} ${grupo.sinNombre === 1 ? 'sección' : 'secciones'}`)
    if (grupo.alcance.tipo === 'establecimiento') return grupo.base
    return `${grupo.base} en ${alcances.join(', ')}`
  })
}

function pluralizar(cantidad: number, singular: string, plural: string): string {
  return cantidad === 1 ? singular : plural
}

const ESTADO_ESTABLECIMIENTO_TEXTO: Record<EstadoEstablecimiento, string> = {
  habitual: 'habitual',
  parcial: 'parcial',
  evacuado: 'evacuado',
  centro_evacuados: 'centro de evacuados',
}

const HORA_ZONA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const FECHA_ZONA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: 'numeric',
  month: 'long',
})
const DIA_ZONA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function momentoDesde(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return 'desde hora no indicada'
  const hora = HORA_ZONA.format(fecha)
  if (DIA_ZONA.format(fecha) === DIA_ZONA.format(new Date())) return `desde ${hora}`
  return `desde el ${FECHA_ZONA.format(fecha)}, ${hora}`
}

/** Título compartido por el resumen de carga, la línea de tiempo y el historial. */
export function tituloMovimiento(diff: DiffParte, tipo: TipoMovimiento, rigeDesde: string): string {
  const agregado = diff.afectacionesAgregadas[0]
  const severidad = diff.severidadesCambiadas[0]
  const retirada = diff.afectacionesRetiradas[0]
  const alcance = diff.alcancesCambiados[0]
  let situacion: string
  let gravedad: string

  if (agregado) {
    situacion = agregado.motivo
    gravedad = agregado.severidad
  } else if (severidad) {
    situacion = severidad.motivo
    gravedad = `${severidad.de} → ${severidad.a}`
  } else if (retirada) {
    situacion = retirada.motivo
    gravedad = retirada.cierre === 'solucionada' ? 'Solucionada' : 'Resuelta'
  } else if (alcance) {
    situacion = alcance.motivo
    gravedad = 'Alcance actualizado'
  } else if (diff.datosCambiados?.[0]) {
    situacion = diff.datosCambiados[0].motivo
    gravedad = 'Datos actualizados'
  } else if (diff.establecimientoCambiado || diff.serviciosCambiados.length > 0) {
    situacion = 'Funcionamiento'
    gravedad = diff.establecimientoCambiado
      ? ESTADO_ESTABLECIMIENTO_TEXTO[diff.establecimientoCambiado.a]
      : textoServicioEstado(diff.serviciosCambiados[0].a ?? diff.serviciosCambiados[0].de ?? 'normal')
  } else if (diff.asistenciaPedagogicaCambiada) {
    situacion = 'Asistencia pedagógica'
    gravedad = 'Actualizada'
  } else {
    situacion = tipo === 'confirmacion' ? 'Situación confirmada' : 'Movimiento del parte'
    gravedad = 'Actualizado'
  }

  return `${situacion} · ${gravedad} · ${momentoDesde(rigeDesde)}`
}

export function describirMovimiento(
  diff: DiffParte,
  opciones: DescribirMovimientoOpciones = {},
): string[] {
  const lineas: string[] = []

  for (const confirmada of diff.afectacionesConfirmadas ?? []) {
    lineas.push(`Sigue igual: "${confirmada.motivo}"`)
  }

  lineas.push(...lineasServicio(diff.serviciosCambiados, opciones.secciones ?? []).filter(Boolean))

  const esReporteInicial = opciones.tipo === 'reporte_inicial'

  diff.afectacionesAgregadas.forEach((agregada, indice) => {
    if (esReporteInicial && indice === 0) {
      lineas.push(`Se inició la situación "${agregada.motivo}"`)
      const partes: string[] = [`Severidad ${agregada.severidad}`]
      if (agregada.secciones > 0) {
        partes.push(`${agregada.secciones} ${pluralizar(agregada.secciones, 'sección', 'secciones')}`)
      }
      if (agregada.alumnos > 0) {
        partes.push(`${agregada.alumnos} ${pluralizar(agregada.alumnos, 'alumno', 'alumnos')}`)
      }
      lineas.push(partes.join(' · '))
      if (agregada.causadaPor) lineas.push(`Causado por "${agregada.causadaPor.motivo}"`)
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
    if (agregada.causadaPor) lineas.push(`Causado por "${agregada.causadaPor.motivo}"`)
  })

  for (const retirada of diff.afectacionesRetiradas) {
    // "Se resolvió", no "Se retiró": la §15 no fija una cadena para esto, y
    // "retirar" nombra lo que el sistema hace con la fila, no lo que pasó en
    // la escuela. Es la misma palabra que el director tocó para llegar acá.
    lineas.push(retirada.cierre === 'solucionada' ? `Se solucionó "${retirada.motivo}"` : `Se resolvió "${retirada.motivo}"`)
  }

  for (const cambio of diff.severidadesCambiadas) {
    lineas.push(`Severidad de "${cambio.motivo}": ${cambio.de} → ${cambio.a}`)
  }

  // diff.datosCambiados puede faltar en un resumen ya persistido de antes de
  // que esta variante existiera (infra_movimiento es append-only, nunca se
  // reescriben filas viejas) — el `?? []` evita que el historial existente
  // rompa al renderizarse.
  for (const cambio of (diff.datosCambiados ?? []) as DiffDatosCambio[]) {
    for (const campo of cambio.campos) {
      if (campo.campo === 'motivo') {
        lineas.push(`Motivo actualizado: "${campo.de}" → "${campo.a}"`)
      } else if (campo.campo === 'categoria') {
        lineas.push(`Categoría de "${cambio.motivo}" actualizada`)
      } else if (campo.campo === 'descripcion') {
        lineas.push(`Descripción de "${cambio.motivo}" actualizada`)
      }
    }
    if (cambio.seccionesConSeleccionCambiada.length > 0) {
      const cantidad = cambio.seccionesConSeleccionCambiada.length
      lineas.push(
        `${cantidad} ${pluralizar(cantidad, 'sección con selección modificada', 'secciones con selección modificada')} en "${cambio.motivo}"`,
      )
    }
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
    lineas.push(`Funcionamiento: ${ESTADO_ESTABLECIMIENTO_TEXTO[de]} → ${ESTADO_ESTABLECIMIENTO_TEXTO[a]}`)
  }

  if (diff.asistenciaPedagogicaCambiada) {
    const asistencia = diff.asistenciaPedagogicaCambiada.a
    if (!asistencia) lineas.push('Se quitó la asistencia pedagógica')
    else if (!asistencia.brinda) lineas.push('No se brinda asistencia pedagógica')
    else lineas.push(`Se brinda asistencia pedagógica: ${asistencia.modalidades.join(' y ')}`)
  }

  return lineas
}
