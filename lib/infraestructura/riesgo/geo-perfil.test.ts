import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let dir: string
let prevDataDir: string | undefined

// Padrón de prueba: 3 con coordenadas válidas (en celdas distintas), 1 sin
// coordenadas y 1 con coordenada fuera del rango de Corrientes. Uno de los
// válidos trae el departamento con tilde para probar la normalización.
const FILAS = [
  {
    cueAnexo: '1800001-00',
    nombre: 'Escuela Capital',
    departamento: 'CAPITAL',
    localidad: 'CORRIENTES',
    lat: -27.45,
    lon: -58.83,
  },
  {
    cueAnexo: '1800002-00',
    nombre: 'Escuela Concepcion',
    departamento: 'CONCEPCIÓN',
    localidad: 'CONCEPCIÓN',
    lat: -27.5,
    lon: -58.9,
  },
  {
    cueAnexo: '1800003-00',
    nombre: 'Escuela General Paz',
    departamento: 'GENERAL PAZ',
    localidad: 'ITA IBATE',
    lat: -28.0,
    lon: -56.5,
  },
  {
    cueAnexo: '1800004-00',
    nombre: 'Escuela Sin Coordenadas',
    departamento: 'GOYA',
    localidad: 'GOYA',
    lat: null,
    lon: null,
  },
  {
    cueAnexo: '1800005-00',
    nombre: 'Escuela Fuera de Rango',
    departamento: 'CURUZU CUATIA',
    localidad: 'CURUZU CUATIA',
    lat: 0,
    lon: 0,
  },
]

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'geo-perfil-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  // ge.sqlite se puebla ANTES de ensureSeeded(): ensureLocalizacionesSeeded()
  // siembra el padrón real desde public/data/localizaciones.json sólo si la
  // tabla está vacía, así que cargar las filas de prueba primero lo hace no-op.
  const { ensureGeSchema, openGeDb } = await import('@/lib/infraestructura/ge-db')
  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    for (const fila of FILAS) {
      await ge.execute({
        sql: 'INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon, geo_calidad) VALUES (?,?,?,?,?,?,?,?)',
        args: [
          fila.cueAnexo,
          null,
          fila.nombre,
          fila.departamento,
          fila.localidad,
          fila.lat,
          fila.lon,
          null,
        ],
      })
    }
  } finally {
    ge.close()
  }

  // Crea hub.sqlite (incluida infra_geo_profile) e idempotentemente evita
  // sembrar ge_localizacion desde el JSON.
  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('calcularGeoPerfiles', () => {
  it('procesa el padrón completo, normaliza departamentos, clasifica exclusiones y es idempotente', async () => {
    const { calcularGeoPerfiles } = await import('./geo-perfil')
    const ahora = new Date('2026-09-01T00:00:00.000Z')

    const resultado = await calcularGeoPerfiles({ ahora })
    expect(resultado).toEqual({
      procesados: 5,
      conPerfilValido: 3,
      excluidos: 2,
      perfilVersion: 'geo-perfil-v1',
    })

    const { getDb } = await import('@/lib/db')
    const { infraGeoProfile } = await import('@/lib/db/schema')
    const db = getDb()

    const filas = await db.select().from(infraGeoProfile)
    expect(filas).toHaveLength(5)

    const valida = filas.find((f) => f.cueAnexo === '1800001-00')
    expect(valida?.motivoExclusion).toBeNull()
    expect(valida?.geometryRef).toBe('-27.4_-58.8')
    expect(valida?.departamento).toBe('CAPITAL')
    expect(valida?.calculadoEn).toBe('2026-09-01T00:00:00.000Z')
    expect(valida?.perfilVersion).toBe('geo-perfil-v1')

    // "CONCEPCIÓN" se guarda como "CONCEPCION": no conviven las dos variantes.
    const conTilde = filas.find((f) => f.cueAnexo === '1800002-00')
    expect(conTilde?.departamento).toBe('CONCEPCION')
    expect(conTilde?.motivoExclusion).toBeNull()
    expect(filas.some((f) => f.departamento === 'CONCEPCIÓN')).toBe(false)

    const sinCoordenadas = filas.find((f) => f.cueAnexo === '1800004-00')
    expect(sinCoordenadas?.motivoExclusion).toBe('sin_coordenadas')
    expect(sinCoordenadas?.geometryRef).toBeNull()

    const fueraDeRango = filas.find((f) => f.cueAnexo === '1800005-00')
    expect(fueraDeRango?.motivoExclusion).toBe('coordenada_invalida')
    expect(fueraDeRango?.geometryRef).toBeNull()

    // Segunda corrida: el upsert actualiza, no duplica.
    const segunda = await calcularGeoPerfiles({ ahora })
    expect(segunda.procesados).toBe(5)
    const filasTrasSegunda = await db.select().from(infraGeoProfile)
    expect(filasTrasSegunda).toHaveLength(5)
  })
})
