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

/** Margen adicional (sobre el 80% operativo ya aplicado por `limiteVentana`) para dejar lugar a los syncs de 6h y sync-seasonal que comparten el mismo minuto/bucket. */
const MARGEN_SEGURIDAD_TRAMO = 0.5

/**
 * Días máximos de un tramo de período para que un lote de `celdasPorLote`
 * celdas quede, con margen, muy por debajo de `limiteMinuto`. Devuelve al
 * menos 1 (nunca 0 ni negativo): si ni 1 día alcanza (sólo posible con un
 * `limiteMinuto` mal configurado a casi 0), `asegurarPesoAlcanzable` corta
 * con un error explícito antes de intentar la request, en vez de partir en
 * tramos de 0 días.
 */
export function diasMaximosPorTramo(params: {
  celdasPorLote: number
  variables: number
  limiteMinuto: number
}): number {
  const factorVariables = Math.max(1, params.variables / 10)
  const presupuesto = params.limiteMinuto * MARGEN_SEGURIDAD_TRAMO
  const diasMax = Math.floor((presupuesto / (params.celdasPorLote * factorVariables)) * 14)
  return Math.max(1, diasMax)
}

/** Parte [desde, hasta] (fechas `YYYY-MM-DD` inclusive) en tramos contiguos de a lo sumo `diasPorTramo` días. */
export function partirPeriodoEnTramos(
  desde: string,
  hasta: string,
  diasPorTramo: number,
): Array<{ desde: string; hasta: string }> {
  const msPorDia = 86_400_000
  const inicio = Date.parse(`${desde}T00:00:00Z`)
  const fin = Date.parse(`${hasta}T00:00:00Z`)
  const tramos: Array<{ desde: string; hasta: string }> = []
  let cursor = inicio
  while (cursor <= fin) {
    const finTramo = Math.min(cursor + (diasPorTramo - 1) * msPorDia, fin)
    tramos.push({
      desde: new Date(cursor).toISOString().slice(0, 10),
      hasta: new Date(finTramo).toISOString().slice(0, 10),
    })
    cursor = finTramo + msPorDia
  }
  return tramos
}
