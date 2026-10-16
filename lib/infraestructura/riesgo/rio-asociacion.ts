import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { infraGeoProfile, infraGeoRio } from '@/lib/db/schema'
import { obtenerPuntosRio, type PuntoRio } from './puntos-rio'

// Asociación establecimiento → punto de río fijo (obtenerPuntosRio()). Corre como job
// (no en request path) e idempotente: upsert por cueAnexo en infraGeoRio, nunca
// dos filas para el mismo establecimiento. El producto es "esta escuela tiene
// conectividad hidrológica razonable con este curso de agua fijo", insumo de las
// señales v2 de E3a.

// Radio máximo por defecto para considerar que una escuela tiene conectividad
// hidrológica razonable con un punto de río fijo: 40 km. Más lejos que eso el
// punto deja de ser informativo sobre el curso de agua que afecta al
// establecimiento. Configurable por corrida para barridos de sensibilidad.
export const RADIO_MAXIMO_KM_DEFAULT = 40

// Versión de la regla de cálculo. Cambiarla permite reprocesar sin confundir
// una corrida vieja con una nueva (ver comentario de infraGeoRio en schema.ts).
export const RIO_ASOCIACION_VERSION = 'rio-asociacion-v1'

const RADIO_TIERRA_KM = 6371

function aRadianes(grados: number): number {
  return (grados * Math.PI) / 180
}

// Haversine: distancia de círculo máximo entre dos coordenadas en km.
function distanciaHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = aRadianes(lat2 - lat1)
  const dLon = aRadianes(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(lat1)) * Math.cos(aRadianes(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return RADIO_TIERRA_KM * c
}

// Función pura: el punto de `puntos` más cercano a (lat, lon) dentro de
// `radioMaximoKm`. Devuelve null si no hay ninguno en radio (nunca el más
// lejano). Ante empate exacto de distancia gana el primero del array: la
// comparación es estricta (<), así que no se reemplaza un empate.
export function elegirPuntoRioMasCercano(
  lat: number,
  lon: number,
  radioMaximoKm: number,
  puntos: readonly PuntoRio[],
): { puntoRioId: string; distanciaKm: number } | null {
  let mejor: { puntoRioId: string; distanciaKm: number } | null = null
  for (const punto of puntos) {
    const distanciaKm = distanciaHaversineKm(lat, lon, punto.lat, punto.lon)
    if (mejor === null || distanciaKm < mejor.distanciaKm) {
      mejor = { puntoRioId: punto.id, distanciaKm }
    }
  }
  if (mejor === null || mejor.distanciaKm > radioMaximoKm) return null
  return mejor
}

export type ResultadoCalculoAsociacionesRio = {
  procesados: number
  conPunto: number
  sinPunto: number
  version: string
}

// Job idempotente: asocia cada fila de infraGeoProfile a su punto de río más
// cercano. Las filas sin coordenadas (motivoExclusion seteado) cuentan como
// sinPunto pero no se omiten del batch.
export async function calcularAsociacionesRio(
  params?: { radioMaximoKm?: number; ahora?: Date },
): Promise<ResultadoCalculoAsociacionesRio> {
  await cargarReferencias()
  const db = getDb()
  const radioMaximoKm = params?.radioMaximoKm ?? RADIO_MAXIMO_KM_DEFAULT
  const calculadoEn = (params?.ahora ?? new Date()).toISOString()

  const filas = await db.select().from(infraGeoProfile)

  // Job (no request path): sin BEGIN IMMEDIATE propio, así que db.transaction
  // (BEGIN DEFERRED) puede toparse con SQLITE_BUSY si compite con un escritor
  // concurrente sobre el mismo hub.sqlite (p. ej. la ruta de parte). Reintento
  // seguro: la transacción entera se revierte si falla a mitad de camino
  // (nunca deja upserts a medio aplicar) y el upsert por cueAnexo es
  // plenamente re-ejecutable desde cero. `conPunto`/`sinPunto` se cuentan
  // DENTRO del intento (nunca afuera) para no duplicar el conteo si un
  // intento anterior llegó a correr parte del loop antes de fallar.
  const { conPunto, sinPunto } = await conReintentoPorBloqueo(() =>
    db.transaction(async (tx) => {
      let conPuntoIntento = 0
      let sinPuntoIntento = 0
      for (const fila of filas) {
      let puntoRioId: string | null = null
      let distanciaKm: number | null = null

      if (fila.lat !== null && fila.lon !== null) {
        const seleccion = elegirPuntoRioMasCercano(
          fila.lat,
          fila.lon,
          radioMaximoKm,
          obtenerPuntosRio(),
        )
        if (seleccion !== null) {
          puntoRioId = seleccion.puntoRioId
          distanciaKm = seleccion.distanciaKm
        }
      }

      await tx
        .insert(infraGeoRio)
        .values({
          cueAnexo: fila.cueAnexo,
          puntoRioId,
          distanciaKm,
          radioMaximoKm,
          version: RIO_ASOCIACION_VERSION,
          calculadoEn,
        })
        .onConflictDoUpdate({
          target: infraGeoRio.cueAnexo,
          set: {
            puntoRioId,
            distanciaKm,
            radioMaximoKm,
            version: RIO_ASOCIACION_VERSION,
            calculadoEn,
          },
        })

      if (puntoRioId !== null) conPuntoIntento += 1
      else sinPuntoIntento += 1
      }
      return { conPunto: conPuntoIntento, sinPunto: sinPuntoIntento }
    }),
  )

  return {
    procesados: filas.length,
    conPunto,
    sinPunto,
    version: RIO_ASOCIACION_VERSION,
  }
}
