import { formatoFechaRegion } from '@/lib/infraestructura/formato-region'
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
export function formatearCargaCorta(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  const { dia, mes, hora, minuto } = partesEnZona(fecha)
  return `${dia} ${MESES_CORTOS[mes]} · ${hora}:${minuto}`
}

/** Fecha y hora de un movimiento: "Hoy, 00:49" o "1 de octubre, 10:45". */
export function formatearMomentoHistorial(iso: string, ahora: Date = new Date()): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  const { dia, mes, hora, minuto } = partesEnZona(fecha)
  if (fechaClave().format(fecha) === fechaClave().format(ahora)) return `Hoy, ${hora}:${minuto}`
  return `${dia} de ${MESES_LARGOS[mes]}, ${hora}:${minuto}`
}

/**
 * Vigencia en lenguaje llano: "Rige desde el 18 de septiembre a las 10:30"
 * (spec §13, misma redacción que el eco de VigenciaField).
 */
export function formatearRigeDesde(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  const { dia, mes, hora, minuto } = partesEnZona(fecha)
  return `Rige desde el ${dia} de ${MESES_LARGOS[mes]} a las ${hora}:${minuto}`
}

/** Fecha para referencias breves a una situación: "5 de octubre". */
export function formatearFechaHistorial(valor: string): string {
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor)
  const fecha = local
    ? new Date(Date.UTC(Number(local[3]), Number(local[2]) - 1, Number(local[1]), 12))
    : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  const { dia, mes } = partesEnZona(fecha)
  return `${dia} de ${MESES_LARGOS[mes]}`
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
