import { eq } from 'drizzle-orm'
import { getDb, getRawClient } from '@/lib/db'
import { infraCentroEvacuados, infraRutaEvacuacionOsm, type CandidatoRutaEvacuacion, type RutaGeoJson } from '@/lib/db/schema'
import { crearEjecutorSql } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'

export type FilaCentro = typeof infraCentroEvacuados.$inferSelect

export interface CentroEvacuadosRespuesta {
  cueAnexo: string
  // La escuela consultada es "posible centro de evacuados" (sugerencia calculada).
  apto: boolean
  disponible: boolean
  motivoSinDestino?: 'sin_calculo' | 'sin_destino_apto'
  // 'camino' = ruta OSM precomputada; 'linea_recta' = sin ruta por camino, sólo distancia aérea.
  tipo?: 'camino' | 'linea_recta'
  destino?: { cueAnexo: string; nombre: string; lat: number; lon: number }
  distanciaKm?: number
  distanciaRectaKm?: number
  ruta?: RutaGeoJson
  calculadoEn?: string
}

const km = (m: number) => Math.round(m / 100) / 10

export function construirRespuestaCentro(
  cueAnexo: string,
  fila: FilaCentro | null,
  candidatos: readonly CandidatoRutaEvacuacion[] | null,
  destinoGeo: { lat: number; lon: number } | null,
): CentroEvacuadosRespuesta {
  if (!fila) return { cueAnexo, apto: false, disponible: false, motivoSinDestino: 'sin_calculo' }
  if (!fila.destinoCue || !fila.destinoNombre || fila.distanciaRectaM === null || !destinoGeo) {
    return { cueAnexo, apto: fila.apto, disponible: false, motivoSinDestino: 'sin_destino_apto', calculadoEn: fila.calculadoEn }
  }
  const destino = { cueAnexo: fila.destinoCue, nombre: fila.destinoNombre, lat: destinoGeo.lat, lon: destinoGeo.lon }
  const ruta = fila.distanciaRutaM !== null ? candidatos?.find((c) => c.destinoCue === fila.destinoCue)?.ruta : undefined
  const base = { cueAnexo, apto: fila.apto, disponible: true, destino, distanciaRectaKm: km(fila.distanciaRectaM), calculadoEn: fila.calculadoEn }
  return ruta
    ? { ...base, tipo: 'camino', ruta, distanciaKm: km(fila.distanciaRutaM as number) }
    : { ...base, tipo: 'linea_recta', distanciaKm: km(fila.distanciaRectaM) }
}

export async function obtenerCentroEvacuados(cueAnexo: string): Promise<CentroEvacuadosRespuesta> {
  const db = getDb()
  const [fila] = await db.select().from(infraCentroEvacuados).where(eq(infraCentroEvacuados.cueAnexo, cueAnexo))
  if (!fila?.destinoCue) return construirRespuestaCentro(cueAnexo, fila ?? null, null, null)

  const rutas = await db.select().from(infraRutaEvacuacionOsm).where(eq(infraRutaEvacuacionOsm.cueAnexo, cueAnexo))
  const ultima = rutas.reduce<(typeof rutas)[number] | null>((e, r) => (!e || Date.parse(r.importadoEn) > Date.parse(e.importadoEn) ? r : e), null)

  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)
  const res = await client.execute({ sql: 'SELECT lat, lon FROM ge.ge_localizacion WHERE cue_anexo = ?', args: [fila.destinoCue] })
  const lat = Number(res.rows[0]?.lat)
  const lon = Number(res.rows[0]?.lon)
  const destinoGeo = res.rows[0] && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
  return construirRespuestaCentro(cueAnexo, fila, ultima?.candidatos ?? null, destinoGeo)
}
