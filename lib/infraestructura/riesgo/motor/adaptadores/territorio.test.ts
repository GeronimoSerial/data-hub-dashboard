import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

usarDbTemporal('motor-territorio-', { seed: false })

beforeAll(async () => {
  const { getRawClient } = await import('@/lib/db')
  const { crearEjecutorSql, ensureGeSchema } = await import('@/lib/infraestructura/ge-db')
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  for (const fila of FILAS) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon, geo_calidad) VALUES (?,?,?,?,?,?,?,?)',
      args: [fila.cueAnexo, null, fila.nombre, fila.departamento, fila.localidad, fila.lat, fila.lon, null],
    })
  }

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  // Puebla infra_geo_profile con la rutina real (mismo patrón que geo-perfil.test).
  const { calcularGeoPerfiles } = await import('../../geo-perfil')
  await calcularGeoPerfiles({ ahora: new Date('2026-09-01T00:00:00.000Z') })
})

// Escuela cerca del punto de río "parana-corrientes-paso-patria"
// (-27.4692, -58.9306): coordenada elegida a <0.05° del punto.
const CUE_CERCA = '1800001-00'
// Escuela a >2° de todos los obtenerPuntosRio() (el más próximo, uruguay-santo-tome,
// está a ~2.9°): supera el umbral de 0.75° y queda sin punto.
const CUE_LEJOS = '1800002-00'
// Perfil sin coordenadas: motivoExclusion no nulo, queda fuera de
// listarCuesConPerfil.
const CUE_SIN_COORDENADAS = '1800003-00'
// Escuela a ~0.2° al este de "parana-bella-vista" (-28.3069, -59.1387): ~20 km
// geodésicos, dentro del radio de 40 km.
const CUE_ESTE_CERCA = '1800004-00'
// Escuela a 0.5° al este de "parana-bella-vista" a latitud -28: ~49 km
// geodésicos (0.5° × 111.19 km × cos 28°), fuera de 40 km. En grados quedaba a
// 0.5° < 0.75° y se asociaba por error; con haversine no debe asociarse.
const CUE_ESTE_LEJOS = '1800005-00'

const FILAS = [
  {
    cueAnexo: CUE_CERCA,
    nombre: 'Escuela Cerca del Río',
    departamento: 'CAPITAL',
    localidad: 'CORRIENTES',
    lat: -27.45,
    lon: -58.9,
  },
  {
    cueAnexo: CUE_LEJOS,
    nombre: 'Escuela Lejos de Todo',
    departamento: 'MONTE CASEROS',
    localidad: 'MONTE CASEROS',
    lat: -31.5,
    lon: -55.5,
  },
  {
    cueAnexo: CUE_SIN_COORDENADAS,
    nombre: 'Escuela Sin Coordenadas',
    departamento: 'GOYA',
    localidad: 'GOYA',
    lat: null,
    lon: null,
  },
  {
    cueAnexo: CUE_ESTE_CERCA,
    nombre: 'Escuela Este Cercana',
    departamento: 'BELLA VISTA',
    localidad: 'BELLA VISTA',
    lat: -28.3069,
    lon: -58.9387,
  },
  {
    cueAnexo: CUE_ESTE_LEJOS,
    nombre: 'Escuela Este Lejana',
    departamento: 'BELLA VISTA',
    localidad: 'BELLA VISTA',
    lat: -28.3069,
    lon: -58.6387,
  },
]

describe('crearAdapterTerritorio', () => {
  it('asigna el punto de río más cercano cuando la escuela está dentro del umbral', async () => {
    const { crearAdapterTerritorio } = await import('./territorio')
    const perfil = await crearAdapterTerritorio().obtenerPerfil(CUE_CERCA)

    expect(perfil).not.toBeNull()
    expect(perfil?.cueAnexo).toBe(CUE_CERCA)
    expect(perfil?.motivoExclusion).toBeNull()
    expect(perfil?.geometryRef).not.toBeNull()
    expect(perfil?.departamento).toBe('CAPITAL')
    expect(perfil?.puntoRioId).toBe('parana-corrientes-paso-patria')
  })

  it('deja puntoRioId en null cuando la escuela supera los 40 km', async () => {
    const { crearAdapterTerritorio } = await import('./territorio')
    const perfil = await crearAdapterTerritorio().obtenerPerfil(CUE_LEJOS)

    expect(perfil).not.toBeNull()
    expect(perfil?.motivoExclusion).toBeNull()
    expect(perfil?.puntoRioId).toBeNull()
  })

  it('no asocia una escuela a 0.5° al este (~49 km) aunque en grados esté bajo 0.75°', async () => {
    const { crearAdapterTerritorio } = await import('./territorio')
    const perfil = await crearAdapterTerritorio().obtenerPerfil(CUE_ESTE_LEJOS)

    expect(perfil).not.toBeNull()
    expect(perfil?.puntoRioId).toBeNull()
  })

  it('asocia una escuela a ~20 km del punto de río dentro del radio de 40 km', async () => {
    const { crearAdapterTerritorio } = await import('./territorio')
    const perfil = await crearAdapterTerritorio().obtenerPerfil(CUE_ESTE_CERCA)

    expect(perfil).not.toBeNull()
    expect(perfil?.puntoRioId).toBe('parana-bella-vista')
  })

  it('coincide con elegirPuntoRioMasCercano(40 km) para las mismas coordenadas', async () => {
    const { crearAdapterTerritorio } = await import('./territorio')
    const { elegirPuntoRioMasCercano, RADIO_MAXIMO_KM_DEFAULT } = await import('../../rio-asociacion')
    const { obtenerPuntosRio } = await import('../../puntos-rio')

    for (const fila of FILAS) {
      if (fila.lat === null || fila.lon === null) continue
      const esperado =
        elegirPuntoRioMasCercano(fila.lat, fila.lon, RADIO_MAXIMO_KM_DEFAULT, obtenerPuntosRio())
          ?.puntoRioId ?? null
      const perfil = await crearAdapterTerritorio().obtenerPerfil(fila.cueAnexo)
      expect(perfil?.puntoRioId, fila.cueAnexo).toBe(esperado)
    }
  })

  it('devuelve null para un cueAnexo inexistente', async () => {
    const { crearAdapterTerritorio } = await import('./territorio')
    const perfil = await crearAdapterTerritorio().obtenerPerfil('9999999-00')
    expect(perfil).toBeNull()
  })

  it('lista sólo los CUE con perfil válido (motivoExclusion null)', async () => {
    const { crearAdapterTerritorio } = await import('./territorio')
    const cues = await crearAdapterTerritorio().listarCuesConPerfil()
    expect([...cues].sort()).toEqual(
      [CUE_CERCA, CUE_LEJOS, CUE_ESTE_CERCA, CUE_ESTE_LEJOS].sort(),
    )
    expect(cues).not.toContain(CUE_SIN_COORDENADAS)
  })
})
