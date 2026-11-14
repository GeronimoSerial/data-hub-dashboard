// Resumen en lenguaje llano de lo que el director está por declarar, para el
// último paso del asistente de reporte inicial.
//
// Puro (sin React, sin fetch, sin base) por el mismo criterio que
// estado-actual-textos.ts: el vocabulario exacto se prueba sin montar nada.
//
// Vocabulario prohibido por spec §5.4 ("versión", "entidad", "registro
// histórico", "persistencia"): no aparece acá a propósito.
import { formatearMomento, resumirAlcance } from '@/components/infraestructura/estado-actual-textos'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'
import { textoImpactoAlumnos, type ImpactoAlumnos } from '@/lib/infraestructura/prioridad-alumnos'

export interface AfectacionResumen {
  /** Alumnos: la prioridad sale del impacto en la matrícula, no de un valor manual. */
  impactoAlumnos?: ImpactoAlumnos
  motivo: string
  severidad: string
  secciones: number
  alumnos: number
  descripcion: string
  /** Sólo institutos superiores. */
  carreras?: number
  carrerasNombres?: string[]
}

export interface ServicioResumen {
  estado: 'normal' | 'suspendido'
  alcanceTipo: 'establecimiento' | 'turno' | 'seccion' | 'carrera' | ''
  turnos: string[]
  secciones: number
  carreras?: number
}

export interface EntradaResumen {
  afectacion: AfectacionResumen
  servicio: ServicioResumen | null
  estadoEstablecimiento: EstadoEstablecimiento | ''
  rigeDesde: string
  asistenciaPedagogica?: { brinda: boolean; modalidades: string[] }
  /** Sólo lectura: las fotos se eligen en el primer paso, no acá. */
  fotosAdjuntas?: number
}

export interface FilaResumen {
  etiqueta: string
  valor: string
  severidad?: string
}

// Alcance de un servicio interrumpido, sin la etiqueta de estado. Null cuando
// no hay ningún turno, sección o carrera elegido.
function alcanceDelServicio(servicio: ServicioResumen, t: Diccionario): string | null {
  const textos = t.parteReporteInicial.servicio
  if (servicio.alcanceTipo === 'establecimiento') return textos.enEstablecimiento
  if (servicio.alcanceTipo === 'turno') return servicio.turnos.length > 0 ? textos.enTurno(servicio.turnos.join(', ')) : null
  if (servicio.alcanceTipo === 'seccion') return servicio.secciones > 0 ? textos.enSecciones(servicio.secciones) : null
  if (servicio.alcanceTipo === 'carrera') return (servicio.carreras ?? 0) > 0 ? textos.enCarreras(servicio.carreras ?? 0) : null
  return null
}

// Un alcance elegido pero vacío se informa como faltante en vez de inventar
// "todo el establecimiento": el director tiene que ver que le falta un dato
// antes de guardar, no después.
function textoServicio(
  servicio: ServicioResumen,
  t: Diccionario,
  etiquetas: { habitual: string; suspendido: string },
): string {
  if (servicio.estado === 'normal') return etiquetas.habitual
  const alcance = alcanceDelServicio(servicio, t)
  return alcance
    ? `${etiquetas.suspendido} ${alcance}`
    : `${etiquetas.suspendido}, ${t.parteReporteInicial.servicio.sinAlcance}`
}

export function describirAlcanceServicio(servicio: ServicioResumen, t: Diccionario = es): string {
  const textos = t.parteReporteInicial.servicio
  return textoServicio(servicio, t, { habitual: textos.habitual, suspendido: textos.interrumpido })
}

/**
 * Las líneas del último paso, en el orden en que el director las contestó.
 * La descripción libre se incluye sólo si la escribió: una línea vacía
 * "Descripción: —" es ruido que no ayuda a confirmar nada.
 */
export function armarResumen(entrada: EntradaResumen, t: Diccionario = es): FilaResumen[] {
  const { afectacion, servicio, estadoEstablecimiento, rigeDesde, asistenciaPedagogica, fotosAdjuntas } = entrada
  const textos = t.parteReporteInicial
  const etiquetas = textos.resumen

  const lineas: FilaResumen[] = [
    { etiqueta: etiquetas.situacion, valor: afectacion.motivo, severidad: afectacion.impactoAlumnos ? undefined : afectacion.severidad },
    ...(afectacion.impactoAlumnos ? [{ etiqueta: 'Impacto', valor: textoImpactoAlumnos(afectacion.impactoAlumnos, t) }] : []),
    {
      etiqueta: etiquetas.afectaA,
      valor: resumirAlcance(
        { secciones: afectacion.secciones, alumnos: afectacion.alumnos, carreras: afectacion.carreras },
        t.fichaPanorama.alcance,
        t,
      ),
    },
  ]
  if (afectacion.carrerasNombres && afectacion.carrerasNombres.length > 0) {
    lineas.push({ etiqueta: etiquetas.carreras, valor: afectacion.carrerasNombres.join(', ') })
  }

  const descripcion = afectacion.descripcion.trim()
  if (descripcion !== '') lineas.push({ etiqueta: etiquetas.detalle, valor: descripcion })

  if (servicio) {
    const valor = textoServicio(servicio, t, { habitual: etiquetas.conNormalidad, suspendido: etiquetas.suspendidas })
    lineas.push({ etiqueta: etiquetas.clases, valor })
  }
  if (estadoEstablecimiento !== '') {
    lineas.push({ etiqueta: etiquetas.edificio, valor: t.fichaPanorama.establecimiento[estadoEstablecimiento] })
  }

  const momento = formatearMomento(rigeDesde)
  if (momento) lineas.push({ etiqueta: 'Desde', valor: momento })

  if (asistenciaPedagogica) {
    const valor = asistenciaPedagogica.brinda
      ? `${textos.opciones.si}${asistenciaPedagogica.modalidades.length ? ` (${asistenciaPedagogica.modalidades.join(', ')})` : ''}`
      : textos.opciones.no
    lineas.push({ etiqueta: etiquetas.asistenciaPedagogica, valor })
  }

  if (fotosAdjuntas !== undefined) lineas.push({ etiqueta: etiquetas.fotosAdjuntas, valor: String(fotosAdjuntas) })

  return lineas
}
