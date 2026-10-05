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

/** Título compartido por el resumen de carga, la línea de tiempo y el historial. */
export function tituloMovimiento(diff: DiffParte, tipo: TipoMovimiento, _rigeDesde: string): string {
  const ids = new Set([
    ...diff.afectacionesAgregadas.map((item) => item.afectacionId),
    ...diff.afectacionesRetiradas.map((item) => item.afectacionId),
    ...diff.severidadesCambiadas.map((item) => item.afectacionId),
    ...diff.alcancesCambiados.map((item) => item.afectacionId),
    ...(diff.datosCambiados ?? []).map((item) => item.afectacionId),
  ])
  if (ids.size > 1) return `Se actualizaron ${ids.size} situaciones`

  const agregado = diff.afectacionesAgregadas[0]
  if (agregado) return `Se informó ${agregado.motivo}`

  const severidad = diff.severidadesCambiadas[0]
  if (severidad) return `Cambió la gravedad: ${severidad.de} → ${severidad.a}`

  const retirada = diff.afectacionesRetiradas[0]
  if (retirada) {
    return retirada.cierre === 'solucionada'
      ? `Se solucionó ${retirada.motivo}`
      : `Se dejó de informar ${retirada.motivo}`
  }

  const alcance = diff.alcancesCambiados[0]
  if (alcance) return `Cambió el alcance de ${alcance.motivo}`

  const datos = (diff.datosCambiados ?? [])[0]
  if (datos) return `Se actualizaron los datos de ${datos.motivo}`

  if (diff.establecimientoCambiado && diff.serviciosCambiados.length > 0) return 'Cambiaron las clases y el edificio'
  if (diff.serviciosCambiados.length > 0) return 'Cambió el funcionamiento de las clases'
  if (diff.establecimientoCambiado) return 'Cambió el estado del edificio'
  if (diff.asistenciaPedagogicaCambiada) return 'Cambió la asistencia pedagógica'
  return tipo === 'confirmacion' ? 'Situación confirmada' : 'Se actualizó el parte'
}

function detalleAlcance(secciones: number, alumnos: number): string {
  const textoSecciones = `${secciones} ${pluralizar(secciones, 'sección', 'secciones')}`
  const textoAlumnos = `${alumnos} ${pluralizar(alumnos, 'alumno', 'alumnos')}`
  return secciones > 0
    ? `Alcanza a ${textoSecciones}${alumnos > 0 ? ` (${textoAlumnos})` : ''}`
    : `Alcanza a ${textoAlumnos}`
}

function detalleCambioAlcance(cambio: DiffParte['alcancesCambiados'][number]): string {
  const partes: string[] = []
  if (cambio.seccionesAgregadas > 0) partes.push(`${cambio.seccionesAgregadas} ${pluralizar(cambio.seccionesAgregadas, 'sección', 'secciones')} más`)
  if (cambio.seccionesRetiradas > 0) partes.push(`${cambio.seccionesRetiradas} ${pluralizar(cambio.seccionesRetiradas, 'sección', 'secciones')} menos`)
  if (cambio.alumnosAgregados > 0) partes.push(`${cambio.alumnosAgregados} ${pluralizar(cambio.alumnosAgregados, 'alumno', 'alumnos')} más`)
  if (cambio.alumnosRetirados > 0) partes.push(`${cambio.alumnosRetirados} ${pluralizar(cambio.alumnosRetirados, 'alumno', 'alumnos')} menos`)
  const verbo = cambio.seccionesRetiradas + cambio.alumnosRetirados > 0
    ? cambio.seccionesAgregadas + cambio.alumnosAgregados > 0 ? 'Se actualizó' : 'Se redujo'
    : 'Se amplió'
  return `${verbo} el alcance de ${cambio.motivo}: ${partes.join(' y ')}`
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

  diff.afectacionesAgregadas.forEach((agregada) => {
    lineas.push(`Se informó ${agregada.motivo}`)
    lineas.push(`Gravedad ${agregada.severidad}`)
    if (agregada.secciones > 0 || agregada.alumnos > 0) lineas.push(detalleAlcance(agregada.secciones, agregada.alumnos))
    if (agregada.causadaPor) lineas.push(`Causado por "${agregada.causadaPor.motivo}"`)
  })

  for (const retirada of diff.afectacionesRetiradas) {
    lineas.push(retirada.cierre === 'solucionada' ? `Se solucionó ${retirada.motivo}` : `Se dejó de informar ${retirada.motivo}`)
  }

  const idsSituaciones = new Set([
    ...diff.afectacionesAgregadas.map((item) => item.afectacionId),
    ...diff.afectacionesRetiradas.map((item) => item.afectacionId),
    ...diff.severidadesCambiadas.map((item) => item.afectacionId),
    ...diff.alcancesCambiados.map((item) => item.afectacionId),
    ...(diff.datosCambiados ?? []).map((item) => item.afectacionId),
  ])
  for (const cambio of diff.severidadesCambiadas) {
    lineas.push(idsSituaciones.size > 1
      ? `${cambio.motivo}: gravedad ${cambio.de} → ${cambio.a}`
      : `Situación: ${cambio.motivo}`)
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
    lineas.push(detalleCambioAlcance(cambio))
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
