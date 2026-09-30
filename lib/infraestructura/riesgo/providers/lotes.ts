import type { ZodType } from 'zod'
import { agregarApiKey, construirBaseUrl } from './cupo-om'
import type { HostOpenMeteo } from './cupo-om'

/** Parte un array en lotes contiguos sin reordenar sus elementos. */
export function agruparEnLotes<T>(items: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano))
  }
  return lotes
}

/**
 * Valida un lote por elemento, manteniendo la posición con las coordenadas.
 * Acepta objeto suelto para un punto y array para varios; una longitud distinta
 * invalida el lote entero con `payload_invalido` en vez de desalinear datos en
 * silencio. En ensemble, `.superRefine` garantiza que las 51 series tengan el
 * mismo largo que `time` antes de que cada elemento llegue a este parser.
 */
export function crearParserLote<T>(schema: ZodType<T>, cantidad: number, unidad = 'coordenada') {
  return (json: unknown): T[] => {
    const bruto = Array.isArray(json) ? json : [json]
    if (bruto.length !== cantidad) {
      throw new Error(
        `se esperaban ${cantidad} objetos (uno por ${unidad}) y llegaron ${bruto.length}`,
      )
    }
    return bruto.map((elemento) => schema.parse(elemento))
  }
}

/** Construye el prefijo común de coordenadas Open-Meteo y conserva el orden de consulta del proveedor. */
export function construirUrlLoteOpenMeteo(params: {
  subdominio: HostOpenMeteo
  ruta: string
  puntos: readonly { lat: number; lon: number }[]
  queryExtra: string
  apiKey: string | undefined
}): string {
  const latitudes = params.puntos.map((punto) => String(punto.lat)).join(',')
  const longitudes = params.puntos.map((punto) => String(punto.lon)).join(',')
  const base = construirBaseUrl(params.subdominio, params.ruta, params.apiKey)
  return agregarApiKey(
    `${base}?latitude=${latitudes}&longitude=${longitudes}${params.queryExtra}`,
    params.apiKey,
  )
}
