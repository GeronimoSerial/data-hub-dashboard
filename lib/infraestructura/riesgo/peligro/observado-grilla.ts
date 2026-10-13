import { and, count, eq, gt, lte, max, sum } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { hazardObservation } from '@/lib/db/schema'
import {
  type HorizonteObservado,
  PROVIDER_OBSERVADO,
  UMBRAL_COBERTURA_MINIMA,
  VARIABLE_OBSERVADA,
} from './observado'

// Cadencia nativa de IMERG Early Run: un gránulo cada 30 min.
const GRANULOS_POR_HORA = 2
// Media celda de la grilla de 0.1°: el centro de cada celda está en lat_lon
// redondeado a un decimal (ver lib/infraestructura/riesgo/celda.ts).
const MEDIA_CELDA_GRADOS = 0.05

export interface CeldaObservada {
  geometryRef: string
  acumuladoMm: number
  granulos: number
  esperados: number
  cobertura: number
  parcial: boolean
}

export interface GrillaObservada {
  hasta: string | null
  desde: string | null
  celdas: CeldaObservada[]
}

type Db = ReturnType<typeof getDb>

const CENTRO_CELDA = /^(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/

// Polígono GeoJSON (orden [lon, lat]) de la celda de 0.1° centrada en geometryRef.
export function celdaAPoligono(geometryRef: string) {
  const coincidencia = CENTRO_CELDA.exec(geometryRef)
  if (!coincidencia) return null
  const lat = Number(coincidencia[1])
  const lon = Number(coincidencia[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  // Redondeo a 6 decimales: evita ruido de coma flotante (p. ej. -27.349999...).
  const grado = (valor: number) => Math.round(valor * 1e6) / 1e6
  const norte = grado(lat + MEDIA_CELDA_GRADOS)
  const sur = grado(lat - MEDIA_CELDA_GRADOS)
  const este = grado(lon + MEDIA_CELDA_GRADOS)
  const oeste = grado(lon - MEDIA_CELDA_GRADOS)
  return {
    type: 'Polygon' as const,
    coordinates: [
      [
        [oeste, sur],
        [este, sur],
        [este, norte],
        [oeste, norte],
        [oeste, sur],
      ],
    ],
  }
}

// Acumulado IMERG por celda para las últimas `horas` horas, tomando como
// referencia el gránulo más reciente disponible. Los timestamps son ISO UTC de
// formato uniforme, por lo que la comparación lexicográfica es temporal.
export async function obtenerGrillaObservada(db: Db, horas: HorizonteObservado): Promise<GrillaObservada> {
  const [ultimo] = await db
    .select({ hasta: max(hazardObservation.observadoEn) })
    .from(hazardObservation)
    .where(
      and(
        eq(hazardObservation.provider, PROVIDER_OBSERVADO),
        eq(hazardObservation.variable, VARIABLE_OBSERVADA),
      ),
    )

  const hasta = ultimo?.hasta ?? null
  if (hasta === null) return { hasta: null, desde: null, celdas: [] }

  const desde = new Date(Date.parse(hasta) - horas * 60 * 60 * 1000).toISOString()
  const esperados = horas * GRANULOS_POR_HORA

  const filas = await db
    .select({
      geometryRef: hazardObservation.geometryRef,
      suma: sum(hazardObservation.valor),
      granulos: count(),
    })
    .from(hazardObservation)
    .where(
      and(
        eq(hazardObservation.provider, PROVIDER_OBSERVADO),
        eq(hazardObservation.variable, VARIABLE_OBSERVADA),
        gt(hazardObservation.observadoEn, desde),
        lte(hazardObservation.observadoEn, hasta),
      ),
    )
    .groupBy(hazardObservation.geometryRef)

  const celdas = filas.map((fila): CeldaObservada => {
    const granulos = Number(fila.granulos)
    const cobertura = Math.min(granulos / esperados, 1)
    return {
      geometryRef: fila.geometryRef,
      acumuladoMm: Math.round(Number(fila.suma ?? 0) * 10) / 10,
      granulos,
      esperados,
      cobertura,
      parcial: cobertura < UMBRAL_COBERTURA_MINIMA,
    }
  })

  return { hasta, desde, celdas }
}
