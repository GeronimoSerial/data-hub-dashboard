import { regionPublicaActual } from '@/lib/infraestructura/region/publica'

const formatosPorClave = new Map<string, Intl.DateTimeFormat>()

/**
 * Date formatter for the active region's time zone and locale. Built on the
 * first call and memoized by zone, locale and options, so it is never created
 * at module load (the region is only known once the provider has run).
 */
export function formatoFechaRegion(opciones: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat {
  const { zonaHoraria, locale } = regionPublicaActual()
  const clave = JSON.stringify([zonaHoraria, locale, opciones])
  let formato = formatosPorClave.get(clave)
  if (!formato) {
    formato = new Intl.DateTimeFormat(locale, { timeZone: zonaHoraria, ...opciones })
    formatosPorClave.set(clave, formato)
  }
  return formato
}
