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
  asistenciaPedagogica?: { brinda: boolean; modalidades: string[] }
}

export interface FilaResumen {
  etiqueta: string
  valor: string
  severidad?: string
}

function contar(cantidad: number, singular: string, plural: string): string {
  return cantidad === 1 ? `1 ${singular}` : `${cantidad} ${plural}`
}

/**
 * Cómo se lee el alcance de una interrupción. Un alcance de turnos o secciones
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
export function armarResumen(entrada: EntradaResumen): FilaResumen[] {
  const { afectacion, servicio, estadoEstablecimiento, rigeDesde, asistenciaPedagogica } = entrada

  const lineas: FilaResumen[] = [
    { etiqueta: 'Situación', valor: afectacion.motivo, severidad: afectacion.severidad },
    { etiqueta: 'Afecta a', valor: resumirAlcance({ secciones: afectacion.secciones, alumnos: afectacion.alumnos }) },
  ]

  const descripcion = afectacion.descripcion.trim()
  if (descripcion !== '') lineas.push({ etiqueta: 'Detalle', valor: descripcion })

  if (servicio) {
    const valor = describirAlcanceServicio(servicio)
      .replace(/^Funcionamiento escolar normal$/, 'Con normalidad')
      .replace(/^Funcionamiento escolar interrumpido/, 'Suspendidas')
    lineas.push({ etiqueta: 'Clases', valor })
  }
  if (estadoEstablecimiento !== '') lineas.push({ etiqueta: 'Edificio', valor: ETIQUETA_ESTABLECIMIENTO[estadoEstablecimiento] })

  const momento = formatearMomento(rigeDesde)
  if (momento) lineas.push({ etiqueta: 'Desde', valor: momento })

  if (asistenciaPedagogica) {
    const valor = asistenciaPedagogica.brinda
      ? `Sí${asistenciaPedagogica.modalidades.length ? ` (${asistenciaPedagogica.modalidades.join(', ')})` : ''}`
      : 'No'
    lineas.push({ etiqueta: 'Asistencia pedagógica', valor })
  }

  return lineas
}
