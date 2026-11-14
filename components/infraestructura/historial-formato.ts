import { formatoFechaRegion } from '@/lib/infraestructura/formato-region'
import { textos, type Idioma } from '@/lib/i18n'
// Formato de fechas del historial (spec §15). Funciones puras, sin React:
// la pantalla es de sólo lectura y todo lo que hace con los timestamps es
// mostrarlos, así que conviene poder probarlas sin montar nada.
//
// Los nombres de mes son una tabla propia y no `Intl.DateTimeFormat`: la
// spec fija la abreviatura ("18 sep · 10:35") y el ICU de Node devuelve
// "sept" para septiembre en es-AR. Doce cadenas fijas valen más que una
// dependencia del ICU del entorno.

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

// La provincia entera trabaja en un solo huso; fijarlo evita que el
// historial se lea con la hora del dispositivo cuando alguien lo abre desde
// otro huso (mismo criterio que estado-actual-textos.ts).
// Español usa las tablas de arriba (salida fija). Portugués toma el nombre del
// mes de ICU con el locale pt-BR: la tabla de meses no puede vivir en el
// diccionario porque varias abreviaturas coinciden con el español.
function nombreMes(idioma: Idioma, mes: number, largo: boolean): string {
  if (idioma === 'es') return (largo ? MESES_LARGOS : MESES_CORTOS)[mes] ?? ''
  const fecha = new Date(Date.UTC(2026, mes, 15, 12))
  return new Intl.DateTimeFormat('pt-BR', { month: largo ? 'long' : 'short', timeZone: 'UTC' })
    .format(fecha)
    .replace('.', '')
}

function partesFormato(): Intl.DateTimeFormat {
  return formatoFechaRegion('en-US', {
    month: '2-digit',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

function fechaClave(): Intl.DateTimeFormat {
  return formatoFechaRegion('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

interface PartesFecha {
  dia: number
  mes: number
  hora: string
  minuto: string
}

function partesEnZona(fecha: Date): PartesFecha {
  const partes = partesFormato().formatToParts(fecha)
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '00'
  return {
    dia: Number(valor('day')),
    mes: Number(valor('month')) - 1,
    hora: valor('hour'),
    minuto: valor('minute'),
  }
}

/**
 * Encabezado del movimiento: "18 sep · 10:35" (spec §15, primer ejemplo).
 * Devuelve cadena vacía si el timestamp no es interpretable, para que la
 * pantalla nunca muestre "Invalid Date" a un director.
 */
export function formatearCargaCorta(iso: string, idioma: Idioma = 'es'): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  const { dia, mes, hora, minuto } = partesEnZona(fecha)
  return `${dia} ${nombreMes(idioma, mes, false)} · ${hora}:${minuto}`
}

/** Fecha y hora de un movimiento: "Hoy, 00:49" o "1 de octubre, 10:45". */
export function formatearMomentoHistorial(iso: string, ahora: Date = new Date(), idioma: Idioma = 'es'): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  const { dia, mes, hora, minuto } = partesEnZona(fecha)
  const t = textos(idioma).fichaHistorial.formato
  if (fechaClave().format(fecha) === fechaClave().format(ahora)) return `${t.hoy}, ${hora}:${minuto}`
  return t.momento(dia, nombreMes(idioma, mes, true), hora, minuto)
}

/**
 * Vigencia en lenguaje llano: "Rige desde el 18 de septiembre a las 10:30"
 * (spec §13, misma redacción que el eco de VigenciaField).
 */
export function formatearRigeDesde(iso: string, idioma: Idioma = 'es'): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  const { dia, mes, hora, minuto } = partesEnZona(fecha)
  return textos(idioma).fichaHistorial.formato.rigeDesde(dia, nombreMes(idioma, mes, true), hora, minuto)
}

/** Fecha para referencias breves a una situación: "5 de octubre". */
export function formatearFechaHistorial(valor: string, idioma: Idioma = 'es'): string {
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor)
  const fecha = local
    ? new Date(Date.UTC(Number(local[3]), Number(local[2]) - 1, Number(local[1]), 12))
    : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  const { dia, mes } = partesEnZona(fecha)
  return textos(idioma).fichaHistorial.formato.fecha(dia, nombreMes(idioma, mes, true))
}

/**
 * Carga y vigencia son dos conceptos distintos (spec §12) y sólo hay algo
 * que contar cuando difieren: si coinciden, repetir el mismo instante con
 * otras palabras es ruido (Krug #3). La comparación es por instante, no por
 * día: un cambio cargado a las 10:35 que rige desde las 10:30 del mismo día
 * sí tiene que mostrar su vigencia.
 */
export function debeMostrarRigeDesde(creadaEn: string, rigeDesde: string): boolean {
  const carga = new Date(creadaEn).getTime()
  const vigencia = new Date(rigeDesde).getTime()
  if (Number.isNaN(vigencia)) return false
  if (Number.isNaN(carga)) return true
  return carga !== vigencia
}

const DIAS_CORTOS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const
const INDICE_DIA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function diaSemanaCorto(fecha: Date, idioma: Idioma): string {
  if (idioma === 'es') {
    return DIAS_CORTOS_ES[INDICE_DIA[formatoFechaRegion('en-US', { weekday: 'short' }).format(fecha)] ?? 0]
  }
  return formatoFechaRegion('pt-BR', { weekday: 'short' }).format(fecha).replace('.', '')
}

/** Calendar day in the region's time zone ("2026-11-14"); '' when unparseable. */
export function claveDiaHistorial(iso: string): string {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? '' : fechaClave().format(fecha)
}

/** Day header for the log: "Hoy", "Ayer" or "mié 12/11". Without `ahora`, always the date. */
export function etiquetaDiaHistorial(iso: string, ahora: Date | null, idioma: Idioma = 'es'): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  if (ahora) {
    const clave = fechaClave().format(fecha)
    if (clave === fechaClave().format(ahora)) return textos(idioma).fichaHistorial.formato.hoy
    if (clave === fechaClave().format(new Date(ahora.getTime() - 86_400_000))) return textos(idioma).fichaBitacora.ayer
  }
  const { dia, mes } = partesEnZona(fecha)
  return `${diaSemanaCorto(fecha, idioma)} ${dia}/${mes + 1}`
}

/** Time of day: "09:12". */
export function horaHistorial(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  const { hora, minuto } = partesEnZona(fecha)
  return `${hora}:${minuto}`
}

/** Short moment: "Hoy 09:12", "Ayer 17:40" or "12/11 07:50". */
export function momentoCortoHistorial(iso: string, ahora: Date | null, idioma: Idioma = 'es'): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  const t = textos(idioma)
  const dia = etiquetaDiaHistorial(iso, ahora, idioma)
  const { dia: numero, mes } = partesEnZona(fecha)
  const relativo = dia === t.fichaHistorial.formato.hoy || dia === t.fichaBitacora.ayer
  return `${relativo ? dia : `${numero}/${mes + 1}`} ${horaHistorial(iso)}`
}
