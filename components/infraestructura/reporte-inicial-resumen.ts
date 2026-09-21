// Resumen en lenguaje llano de lo que el director está por declarar, para el
// último paso del asistente de reporte inicial.
//
// Puro (sin React, sin fetch, sin base) por el mismo criterio que
// estado-actual-textos.ts: el vocabulario exacto se prueba sin montar nada.
//
// Vocabulario prohibido por spec §5.4 ("versión", "entidad", "registro
// histórico", "persistencia"): no aparece acá a propósito.
import {
  ETIQUETA_ESTABLECIMIENTO,
  ETIQUETA_SERVICIO,
  formatearMomento,
  resumirAlcance,
} from '@/components/infraestructura/estado-actual-textos'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'

export interface AfectacionResumen {
  motivo: string
  severidad: string
  secciones: number
  alumnos: number
  descripcion: string
}

export interface ServicioResumen {
  estado: 'normal' | 'suspendido'
  alcanceTipo: 'establecimiento' | 'turno' | 'seccion' | ''
  turnos: string[]
  secciones: number
}

export interface EntradaResumen {
  afectacion: AfectacionResumen
  servicio: ServicioResumen | null
  estadoEstablecimiento: EstadoEstablecimiento | ''
  rigeDesde: string
}

function contar(cantidad: number, singular: string, plural: string): string {
  return cantidad === 1 ? `1 ${singular}` : `${cantidad} ${plural}`
}

/**
 * Cómo se lee el alcance de una suspensión. Un alcance de turnos o secciones
 * sin ninguno elegido se informa como "sin alcance indicado" en vez de
 * inventar "todo el establecimiento": el director tiene que poder ver que le
 * falta un dato antes de guardar, no después.
 */
export function describirAlcanceServicio(servicio: ServicioResumen): string {
  if (servicio.estado === 'normal') return ETIQUETA_SERVICIO.normal

  const etiqueta = ETIQUETA_SERVICIO.suspendido
  if (servicio.alcanceTipo === 'establecimiento') return `${etiqueta} en todo el establecimiento`
  if (servicio.alcanceTipo === 'turno') {
    return servicio.turnos.length > 0
      ? `${etiqueta} en el turno ${servicio.turnos.join(', ')}`
      : `${etiqueta}, sin alcance indicado`
  }
  if (servicio.alcanceTipo === 'seccion') {
    return servicio.secciones > 0
      ? `${etiqueta} en ${contar(servicio.secciones, 'sección', 'secciones')}`
      : `${etiqueta}, sin alcance indicado`
  }
  return `${etiqueta}, sin alcance indicado`
}

/**
 * Las líneas del último paso, en el orden en que el director las contestó.
 * La descripción libre se incluye sólo si la escribió: una línea vacía
 * "Descripción: —" es ruido que no ayuda a confirmar nada.
 */
export function armarResumen(entrada: EntradaResumen): string[] {
  const { afectacion, servicio, estadoEstablecimiento, rigeDesde } = entrada

  const lineas: string[] = [
    `${afectacion.motivo} · Severidad ${afectacion.severidad}`,
    resumirAlcance({ secciones: afectacion.secciones, alumnos: afectacion.alumnos }),
  ]

  const descripcion = afectacion.descripcion.trim()
  if (descripcion !== '') lineas.push(descripcion)

  if (servicio) lineas.push(describirAlcanceServicio(servicio))
  if (estadoEstablecimiento !== '') lineas.push(ETIQUETA_ESTABLECIMIENTO[estadoEstablecimiento])

  const momento = formatearMomento(rigeDesde)
  if (momento) lineas.push(`Rige desde el ${momento}`)

  return lineas
}
