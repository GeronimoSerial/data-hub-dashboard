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

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function horaLocal(fecha: Date): string {
  return `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`
}

/**
 * Encabezado del movimiento: "18 sep · 10:35" (spec §15, primer ejemplo).
 * Devuelve cadena vacía si el timestamp no es interpretable, para que la
 * pantalla nunca muestre "Invalid Date" a un director.
 */
export function formatearCargaCorta(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  return `${fecha.getDate()} ${MESES_CORTOS[fecha.getMonth()]} · ${horaLocal(fecha)}`
}

/**
 * Vigencia en lenguaje llano: "Rige desde el 18 de septiembre a las 10:30"
 * (spec §13, misma redacción que el eco de VigenciaField).
 */
export function formatearRigeDesde(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  return `Rige desde el ${fecha.getDate()} de ${MESES_LARGOS[fecha.getMonth()]} a las ${horaLocal(fecha)}`
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
