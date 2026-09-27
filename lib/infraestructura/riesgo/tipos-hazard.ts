// Contratos Zod/TS de amenazas hidrometeorológicas para el batch de riesgo
// ENOS. Validan forma únicamente; la persistencia y el fetch viven fuera.
import { z } from 'zod'

// Variables de amenaza. Nombres en español alineados con el resto del dominio.
export const hazardVariableSchema = z.enum([
  'precipitacion',
  'cape',
  'rafagas',
  'temperatura',
  'viento',
  'caudal',
])

export type HazardVariable = z.infer<typeof hazardVariableSchema>

// Estado de una fuente externa: ok cuando respondió bien, degradado cuando
// respondió con datos parciales o viejos, no_disponible cuando no hay datos.
export const estadoFuenteSchema = z.enum(['ok', 'degradado', 'no_disponible'])

export type EstadoFuente = z.infer<typeof estadoFuenteSchema>

// Punto de pronóstico de una variable para una geometría (escuela) en una
// corrida y horizonte concretos. pasoHoras sólo admite 1, 3 o 6 porque son las
// resoluciones que exponen los modelos que consumimos.
export const hazardForecastPuntoSchema = z.object({
  variable: hazardVariableSchema,
  geometryRef: z.string(),
  corridaEn: z.iso.datetime({ offset: false }),
  validoEn: z.iso.datetime({ offset: false }),
  horizonteHoras: z.number().int().min(0),
  valor: z.number(),
  unidad: z.string(),
  pasoHoras: z.union([z.literal(1), z.literal(3), z.literal(6)]),
})

export type HazardForecastPunto = z.infer<typeof hazardForecastPuntoSchema>

// Punto de climatología de precipitación diaria (percentiles históricos). No es
// un pronóstico: se calcula offline y por eso no implementa HazardProvider.
export const hazardClimatologiaPuntoSchema = z.object({
  geometryRef: z.string(),
  variable: z.literal('precipitacion_diaria'),
  percentil: z.enum(['p90', 'p95', 'p99']),
  muestra: z.enum(['todos_los_dias', 'dias_humedos']),
  valor: z.number(),
  unidad: z.string(),
  periodoDesde: z.string(),
  periodoHasta: z.string(),
})

export type HazardClimatologiaPunto = z.infer<typeof hazardClimatologiaPuntoSchema>

// Entrada de salud de una fuente (provider) para el panel de estado.
export const hazardSourceHealthEntradaSchema = z.object({
  provider: z.string(),
  estado: estadoFuenteSchema,
  ultimoExitoEn: z.string().nullable(),
  ultimoIntentoEn: z.string().nullable(),
  ultimoErrorSaneado: z.string().nullable(),
  ttlMinutos: z.number().int().positive(),
  licencia: z.string(),
})

export type HazardSourceHealthEntrada = z.infer<typeof hazardSourceHealthEntradaSchema>

// Contrato de código (no Zod) que implementa cada adapter concreto de pronóstico
// (p. ej. ECMWF, Flood). La climatología NO lo implementa: es un cálculo offline
// aparte, no un fetch atado al "ahora" de la corrida.
export interface HazardProvider {
  readonly nombreProveedor: string
  obtenerPronostico(params: { geometryRefs: string[]; ahora: Date }): Promise<HazardForecastPunto[]>
}
