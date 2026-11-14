import type { CategoriaAfectacion } from './categorias'
import { dentroDeRangoVigencia } from './vigencia-rango'
import { parteComunTextosEs } from '@/lib/i18n/diccionarios/grupos/parteComunTextos.es'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

export const MENSAJE_HORA_FUTURA = parteComunTextosEs.vigencia.horaFutura

// Spec rediseño §5.3: tres chips en vez de un panel de fecha y hora. "Ahora"
// se resuelve al ENVIAR, no al abrir el formulario: un parte que se carga en
// diez minutos tiene que fecharse cuando se manda.
export type EleccionVigencia =
  | { modo: 'ahora' }
  | { modo: 'hoy'; hora: string }
  | { modo: 'otro'; fecha: string; hora: string }

export const VIGENCIA_AHORA: EleccionVigencia = { modo: 'ahora' }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function combinar(fecha: Date, hora: string): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hora)
  if (!m) return null
  const horas = Number(m[1])
  const minutos = Number(m[2])
  if (horas > 23 || minutos > 59) return null
  const d = new Date(fecha)
  d.setHours(horas, minutos, 0, 0)
  return d
}

function fechaLocal(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (!m) return null
  const año = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  const fecha = new Date(año, mes - 1, dia)
  if (fecha.getFullYear() !== año || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return null
  return fecha
}

export function resolverVigencia(eleccion: EleccionVigencia, ahora: Date = new Date()): string | null {
  if (eleccion.modo === 'ahora') return ahora.toISOString()
  const base = eleccion.modo === 'hoy' ? ahora : fechaLocal(eleccion.fecha)
  if (!base) return null
  const momento = combinar(base, eleccion.hora)
  if (!momento || !dentroDeRangoVigencia(momento, ahora)) return null
  return momento.toISOString()
}

export const MENSAJE_ELIJA_HORA = parteComunTextosEs.vigencia.elijaHora
export const MENSAJE_ELIJA_FECHA_Y_HORA = parteComunTextosEs.vigencia.elijaFechaYHora

/**
 * Mensaje para una elección que no se puede resolver. Una elección incompleta
 * pide lo que falta; sólo una elección completa fuera de rango recibe el
 * mensaje de la ventana, que no debe aparecer mientras el director todavía
 * no terminó de cargarla.
 */
export function errorVigencia(eleccion: EleccionVigencia, ahora: Date = new Date(), t: Diccionario = es): string | null {
  const v = t.parteComunTextos.vigencia
  if (eleccion.modo === 'ahora' || resolverVigencia(eleccion, ahora) !== null) return null
  if (eleccion.modo === 'hoy' && !eleccion.hora) return v.elijaHora
  if (eleccion.modo === 'otro' && (!fechaLocal(eleccion.fecha) || !eleccion.hora)) return v.elijaFechaYHora
  if (eleccion.modo === 'hoy' && eleccion.hora) {
    const momento = combinar(ahora, eleccion.hora)
    if (momento && momento.getTime() > ahora.getTime()) return v.horaFutura
  }
  return v.fueraDeRango
}

export function resumenVigencia(eleccion: EleccionVigencia, etiquetaMomento?: string, t: Diccionario = es): string {
  const v = t.residuos.vigencia
  const etiqueta = etiquetaMomento ?? v.desde
  if (eleccion.modo === 'ahora') return v.ahora(etiqueta)
  if (eleccion.modo === 'hoy') return eleccion.hora ? v.hoy(etiqueta, eleccion.hora) : v.elijaHora
  const fecha = fechaLocal(eleccion.fecha)
  if (!fecha || !eleccion.hora) return v.elijaFechaYHora
  return v.fechaYHora(etiqueta, v.dias[fecha.getDay()]!, `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}`, eleccion.hora)
}

export function etiquetaVigencia(categoria: CategoriaAfectacion | ''): string {
  return categoria === 'alumnos' ? '¿Desde cuándo no pueden llegar?' : '¿Desde cuándo ocurre?'
}

export function esEleccionVigencia(valor: unknown): valor is EleccionVigencia {
  if (typeof valor !== 'object' || valor === null) return false
  const v = valor as Record<string, unknown>
  if (v.modo === 'ahora') return true
  if (v.modo === 'hoy') return typeof v.hora === 'string'
  if (v.modo === 'otro') return typeof v.fecha === 'string' && typeof v.hora === 'string'
  return false
}
