import { regionPublicaActual } from './region/publica'

// Region-aware date formatting. The zone and locale are read at call time so a
// client provider can set the region after this module loads. Formatters are
// memoized by their full configuration, so repeated calls do not rebuild them.
const formatosMemorizados = new Map<string, Intl.DateTimeFormat>()

export function zonaHorariaRegion(): string {
  return regionPublicaActual().zonaHoraria
}

export function localeRegion(): string {
  return regionPublicaActual().locale
}

export function formatoFechaRegion(
  locale: string,
  opciones: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
): Intl.DateTimeFormat {
  const zona = zonaHorariaRegion()
  const clave = JSON.stringify([locale, zona, opciones])
  let formato = formatosMemorizados.get(clave)
  if (!formato) {
    formato = new Intl.DateTimeFormat(locale, { ...opciones, timeZone: zona })
    formatosMemorizados.set(clave, formato)
  }
  return formato
}
