import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let dir: string
let prevDataDir: string | undefined

// Escuela cerca del punto de río "parana-corrientes-paso-patria"
// (-27.4692, -58.9306): coordenada elegida a <0.05° del punto.
const CUE_CERCA = '1800001-00'
// Escuela a >2° de todos los PUNTOS_RIO (el más próximo, uruguay-santo-tome,
// está a ~2.9°): supera el umbral de 0.75° y queda sin punto.
const CUE_LEJOS = '1800002-00'
// Perfil sin coordenadas: motivoExclusion no nulo, queda fuera de
// listarCuesConPerfil.
const CUE_SIN_COORDENADAS = '1800003-00'

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
]

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'motor-territorio-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

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

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

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

  it('deja puntoRioId en null cuando la escuela supera el umbral de 0.75°', async () => {
    const { crearAdapterTerritorio } = await import('./territorio')
    const perfil = await crearAdapterTerritorio().obtenerPerfil(CUE_LEJOS)

    expect(perfil).not.toBeNull()
    expect(perfil?.motivoExclusion).toBeNull()
    expect(perfil?.puntoRioId).toBeNull()
  })

  it('devuelve null para un cueAnexo inexistente', async () => {
    const { crearAdapterTerritorio } = await import('./territorio')
    const perfil = await crearAdapterTerritorio().obtenerPerfil('9999999-00')
    expect(perfil).toBeNull()
  })

  it('lista sólo los CUE con perfil válido (motivoExclusion null)', async () => {
    const { crearAdapterTerritorio } = await import('./territorio')
    const cues = await crearAdapterTerritorio().listarCuesConPerfil()
    expect([...cues].sort()).toEqual([CUE_CERCA, CUE_LEJOS].sort())
    expect(cues).not.toContain(CUE_SIN_COORDENADAS)
  })
})
