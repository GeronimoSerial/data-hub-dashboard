import type { CategoriaAfectacion } from './categorias'
import { dentroDeRangoVigencia, MENSAJE_FUERA_DE_RANGO_VIGENCIA } from './vigencia-rango'
import { calendarioBA, type CalendarioBA, instanteBA } from './zona-horaria'

export const MENSAJE_HORA_FUTURA = 'Esa hora todavía no pasó. Elija una hora anterior a la actual.'

// Spec rediseño §5.3: tres chips en vez de un panel de fecha y hora. "Ahora"
// se resuelve al ENVIAR, no al abrir el formulario: un parte que se carga en
// diez minutos tiene que fecharse cuando se manda.
export type EleccionVigencia =
  | { modo: 'ahora' }
  | { modo: 'hoy'; hora: string }
  | { modo: 'otro'; fecha: string; hora: string }

export const VIGENCIA_AHORA: EleccionVigencia = { modo: 'ahora' }

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Combina un día del calendario de Buenos Aires con una hora `HH:mm` de ese día. */
function combinar(dia: CalendarioBA, hora: string): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hora)
  if (!m) return null
  const horas = Number(m[1])
  const minutos = Number(m[2])
  if (horas > 23 || minutos > 59) return null
  return instanteBA(dia.año, dia.mes, dia.dia, horas, minutos)
}

function fechaCalendario(texto: string): CalendarioBA | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (!m) return null
  const año = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  const fecha = new Date(Date.UTC(año, mes - 1, dia))
  if (fecha.getUTCFullYear() !== año || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null
  return { año, mes, dia, diaSemana: fecha.getUTCDay() }
}

export function resolverVigencia(eleccion: EleccionVigencia, ahora: Date = new Date()): string | null {
  if (eleccion.modo === 'ahora') return ahora.toISOString()
  const base = eleccion.modo === 'hoy' ? calendarioBA(ahora) : fechaCalendario(eleccion.fecha)
  if (!base) return null
  const momento = combinar(base, eleccion.hora)
  if (!momento || !dentroDeRangoVigencia(momento, ahora)) return null
  return momento.toISOString()
}

/** Mensaje accionable para una hora de hoy que aún no ocurrió. */
export function errorVigencia(eleccion: EleccionVigencia, ahora: Date = new Date()): string | null {
  if (eleccion.modo === 'ahora' || resolverVigencia(eleccion, ahora) !== null) return null
  if (eleccion.modo === 'hoy' && eleccion.hora) {
    const momento = combinar(calendarioBA(ahora), eleccion.hora)
    if (momento && momento.getTime() > ahora.getTime()) return MENSAJE_HORA_FUTURA
  }
  return MENSAJE_FUERA_DE_RANGO_VIGENCIA
}

export function resumenVigencia(eleccion: EleccionVigencia, etiquetaMomento = 'Desde'): string {
  if (eleccion.modo === 'ahora') return `${etiquetaMomento} ahora`
  if (eleccion.modo === 'hoy') return eleccion.hora ? `${etiquetaMomento} hoy a las ${eleccion.hora}` : 'Elija la hora'
  const fecha = fechaCalendario(eleccion.fecha)
  if (!fecha || !eleccion.hora) return 'Elija la fecha y la hora'
  return `${etiquetaMomento} el ${DIAS[fecha.diaSemana]} ${pad(fecha.dia)}/${pad(fecha.mes)} a las ${eleccion.hora}`
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
