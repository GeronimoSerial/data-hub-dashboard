import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { infraGeoProfile, infraGeoRio } from '@/lib/db/schema'
import { PUNTOS_RIO, type PuntoRio } from './puntos-rio'
import {
  calcularAsociacionesRio,
  elegirPuntoRioMasCercano,
  RADIO_MAXIMO_KM_DEFAULT,
  RIO_ASOCIACION_VERSION,
} from './rio-asociacion'

usarDbTemporal('rio-asociacion-', { seed: false })

beforeAll(async () => {
  // Crea hub.sqlite (incluidas infra_geo_profile e infra_geo_rio) con el
  // esquema real del repo. Primer uso de getDb() en el archivo, así que queda
  // memoizado contra este DATA_DIR.
  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

// Punto real de PUNTOS_RIO sobre el que se construyen los fixtures de la DB.
const CORRIENTES = { lat: -27.4692, lon: -58.9306, id: 'parana-corrientes-paso-patria' }

// 1 grado de latitud en km con el mismo radio terrestre que usa el módulo
// (haversine, 6371 km). Ubicar la escuela como un desplazamiento en latitud
// sobre la misma longitud hace que la distancia esperada sea exactamente km.
const KM_POR_GRADO_LAT = (6371 * Math.PI) / 180

function desplazarAlNorte(lat: number, lon: number, km: number) {
  return { lat: lat + km / KM_POR_GRADO_LAT, lon }
}

beforeEach(async () => {
  const db = getDb()
  await db.delete(infraGeoRio)
  await db.delete(infraGeoProfile)
})

async function insertarPerfil(fila: {
  cueAnexo: string
  lat: number | null
  lon: number | null
  motivoExclusion?: string | null
}) {
  const db = getDb()
  await db.insert(infraGeoProfile).values({
    cueAnexo: fila.cueAnexo,
    lat: fila.lat,
    lon: fila.lon,
    motivoExclusion: fila.motivoExclusion ?? null,
    perfilVersion: 'geo-perfil-v1',
    calculadoEn: '2026-09-01T00:00:00.000Z',
  })
}

describe('elegirPuntoRioMasCercano', () => {
  it('ante empate exacto de distancia elige el primero del array, en cualquier orden', () => {
    const puntoArriba: PuntoRio = {
      id: 'a',
      rio: 'parana',
      localidad: 'A',
      lat: 0.01,
      lon: 0,
      criterio: 'fixture simétrico',
    }
    const puntoAbajo: PuntoRio = {
      id: 'b',
      rio: 'parana',
      localidad: 'B',
      lat: -0.01,
      lon: 0,
      criterio: 'fixture simétrico',
    }
    const distanciaEmpateKm = KM_POR_GRADO_LAT * 0.01

    const primeroArriba = elegirPuntoRioMasCercano(0, 0, 40, [puntoArriba, puntoAbajo])
    expect(primeroArriba?.puntoRioId).toBe('a')
    expect(primeroArriba?.distanciaKm).toBeCloseTo(distanciaEmpateKm, 6)

    const primeroAbajo = elegirPuntoRioMasCercano(0, 0, 40, [puntoAbajo, puntoArriba])
    expect(primeroAbajo?.puntoRioId).toBe('b')
    expect(primeroAbajo?.distanciaKm).toBeCloseTo(distanciaEmpateKm, 6)
  })
})

describe('calcularAsociacionesRio', () => {
  it('asocia una escuela dentro del radio con el punto correcto y su distancia', async () => {
    const dentro = desplazarAlNorte(CORRIENTES.lat, CORRIENTES.lon, 5)
    await insertarPerfil({ cueAnexo: '1800001-00', lat: dentro.lat, lon: dentro.lon })

    const resultado = await calcularAsociacionesRio({
      ahora: new Date('2026-09-02T00:00:00.000Z'),
    })
    expect(resultado).toEqual({
      procesados: 1,
      conPunto: 1,
      sinPunto: 0,
      version: RIO_ASOCIACION_VERSION,
    })

    const db = getDb()
    const filas = await db.select().from(infraGeoRio)
    expect(filas).toHaveLength(1)
    expect(filas[0].puntoRioId).toBe(CORRIENTES.id)
    expect(filas[0].distanciaKm).toBeCloseTo(5, 1)
    expect(filas[0].radioMaximoKm).toBe(RADIO_MAXIMO_KM_DEFAULT)
    expect(filas[0].version).toBe(RIO_ASOCIACION_VERSION)
    expect(filas[0].calculadoEn).toBe('2026-09-02T00:00:00.000Z')
  })

  it('deja sin punto a una escuela fuera del radio, nunca el más cercano de los lejanos', async () => {
    const fuera = desplazarAlNorte(CORRIENTES.lat, CORRIENTES.lon, 200)
    await insertarPerfil({ cueAnexo: '1800002-00', lat: fuera.lat, lon: fuera.lon })

    const resultado = await calcularAsociacionesRio()
    expect(resultado).toEqual({
      procesados: 1,
      conPunto: 0,
      sinPunto: 1,
      version: RIO_ASOCIACION_VERSION,
    })

    const db = getDb()
    const filas = await db.select().from(infraGeoRio)
    expect(filas).toHaveLength(1)
    expect(filas[0].puntoRioId).toBeNull()
    expect(filas[0].distanciaKm).toBeNull()
  })

  it('una escuela sin coordenadas cuenta como sinPunto y no rompe el resto del batch', async () => {
    const dentro = desplazarAlNorte(CORRIENTES.lat, CORRIENTES.lon, 5)
    await insertarPerfil({ cueAnexo: '1800003-00', lat: null, lon: null, motivoExclusion: 'sin_coordenadas' })
    await insertarPerfil({ cueAnexo: '1800004-00', lat: dentro.lat, lon: dentro.lon })

    const resultado = await calcularAsociacionesRio()
    expect(resultado).toEqual({
      procesados: 2,
      conPunto: 1,
      sinPunto: 1,
      version: RIO_ASOCIACION_VERSION,
    })

    const db = getDb()
    const filas = await db.select().from(infraGeoRio)
    expect(filas).toHaveLength(2)
    const sinCoordenadas = filas.find((f) => f.cueAnexo === '1800003-00')
    expect(sinCoordenadas?.puntoRioId).toBeNull()
    const conPunto = filas.find((f) => f.cueAnexo === '1800004-00')
    expect(conPunto?.puntoRioId).toBe(CORRIENTES.id)
  })

  it('segunda corrida sobre el mismo estado da el mismo resultado sin duplicar filas', async () => {
    const dentro = desplazarAlNorte(CORRIENTES.lat, CORRIENTES.lon, 5)
    const fuera = desplazarAlNorte(CORRIENTES.lat, CORRIENTES.lon, 200)
    await insertarPerfil({ cueAnexo: '1800005-00', lat: dentro.lat, lon: dentro.lon })
    await insertarPerfil({ cueAnexo: '1800006-00', lat: fuera.lat, lon: fuera.lon })

    const db = getDb()
    const primera = await calcularAsociacionesRio()
    expect(primera).toEqual({
      procesados: 2,
      conPunto: 1,
      sinPunto: 1,
      version: RIO_ASOCIACION_VERSION,
    })
    const filasTrasPrimera = await db.select().from(infraGeoRio)
    expect(filasTrasPrimera).toHaveLength(2)

    const segunda = await calcularAsociacionesRio()
    expect(segunda).toEqual(primera)
    const filasTrasSegunda = await db.select().from(infraGeoRio)
    expect(filasTrasSegunda).toHaveLength(2)
  })

  it('respeta un radio máximo explícito por debajo del default', async () => {
    const dentro = desplazarAlNorte(CORRIENTES.lat, CORRIENTES.lon, 5)
    await insertarPerfil({ cueAnexo: '1800007-00', lat: dentro.lat, lon: dentro.lon })

    const resultado = await calcularAsociacionesRio({ radioMaximoKm: 4 })
    expect(resultado.sinPunto).toBe(1)
    expect(resultado.conPunto).toBe(0)
  })
})

describe('PUNTOS_RIO', () => {
  it('expone el punto de Corrientes usado como fixture', () => {
    expect(PUNTOS_RIO.some((p) => p.id === CORRIENTES.id)).toBe(true)
  })
})
