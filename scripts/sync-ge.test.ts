import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureGeSchema, openGeDb } from '../lib/infraestructura/ge-db'
import {
  buildFixtureSecciones,
  insertFixtureCorte,
  parseGeojsonLocalizaciones,
  parseLocalizacionesJson,
  reconciliarLocalizaciones,
  upsertLocalizaciones,
} from './sync-ge.mjs'

let dir: string
let prevDataDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sync-ge-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('parseLocalizacionesJson', () => {
  it('extrae registros validos y descarta cues invalidos', () => {
    const json = JSON.stringify([
      {
        cueAnexo: '1801605-04',
        nombre: 'Escuela 415',
        departamento: 'GENERAL PAZ',
        localidad: 'ITA IBATE',
        lat: -27.42,
        lon: -57.33,
        geoCalidad: 'excelente',
      },
      { cueAnexo: 'SINCUE', nombre: 'Sin CUE' },
    ])

    const { registros, descartados } = parseLocalizacionesJson(json)

    expect(registros).toHaveLength(1)
    expect(registros[0]).toEqual({
      cueAnexo: '1801605-04',
      cui: null,
      nombre: 'Escuela 415',
      departamento: 'GENERAL PAZ',
      localidad: 'ITA IBATE',
      lat: -27.42,
      lon: -57.33,
      geoCalidad: 'excelente',
    })
    expect(descartados).toEqual(['SINCUE'])
  })

  it('un registro sin lat/lon queda con lat:null y lon:null', () => {
    const json = JSON.stringify([
      { cueAnexo: '1801605-04', nombre: 'Escuela', departamento: 'D', localidad: 'L' },
    ])

    const { registros } = parseLocalizacionesJson(json)

    expect(registros).toHaveLength(1)
    expect(registros[0].lat).toBeNull()
    expect(registros[0].lon).toBeNull()
    expect(registros[0].geoCalidad).toBeNull()
  })

  it('descarta un CUE base sin anexo', () => {
    const json = JSON.stringify([
      { cueAnexo: '1801605', nombre: 'CUE base', departamento: 'D', localidad: 'L' },
      { cueAnexo: '1801605-04', nombre: 'CUE anexo', departamento: 'D', localidad: 'L' },
    ])

    const { registros, descartados } = parseLocalizacionesJson(json)

    expect(registros).toHaveLength(1)
    expect(registros[0].cueAnexo).toBe('1801605-04')
    expect(descartados).toEqual(['1801605'])
  })

  it('JSON malformado devuelve arreglos vacios sin tirar error', () => {
    const { registros, descartados } = parseLocalizacionesJson('{not valid')
    expect(registros).toEqual([])
    expect(descartados).toEqual([])
  })

  it('JSON que parsea pero no es un array devuelve arreglos vacios', () => {
    const { registros, descartados } = parseLocalizacionesJson('{"foo":"bar"}')
    expect(registros).toEqual([])
    expect(descartados).toEqual([])
  })
})

describe('parseGeojsonLocalizaciones', () => {
  it('mapea lat/lon desde coordinates [lon, lat] y descarta la feature invalida', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-57.33806, -27.4251329] },
          properties: {
            cue: '1801605-04',
            name: 'Escuela 415',
            locality: 'ITA IBATE',
            department: 'GENERAL PAZ',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-58.7, -28.3] },
          properties: { cue: 'MAL', name: 'Roto', locality: 'X', department: 'Y' },
        },
      ],
    })

    const { registros, descartados } = parseGeojsonLocalizaciones(geojson)

    expect(registros).toHaveLength(1)
    expect(registros[0]).toEqual({
      cueAnexo: '1801605-04',
      cui: null,
      nombre: 'Escuela 415',
      departamento: 'GENERAL PAZ',
      localidad: 'ITA IBATE',
      lat: -27.4251329,
      lon: -57.33806,
      geoCalidad: null,
    })
    expect(descartados).toEqual(['MAL'])
  })
})

describe('reconciliarLocalizaciones', () => {
  it('el geojson pisa nombre/ubicacion pero conserva geoCalidad del index.html', () => {
    const indexHtmlResult = {
      registros: [
        {
          cueAnexo: '1801605-04',
          cui: null,
          nombre: 'Viejo',
          departamento: 'D1',
          localidad: 'L1',
          lat: 1,
          lon: 2,
          geoCalidad: 'excelente',
        },
      ],
      descartados: ['SINCUE'],
    }
    const geojsonResult = {
      registros: [
        {
          cueAnexo: '1801605-04',
          cui: null,
          nombre: 'Nuevo',
          departamento: 'D2',
          localidad: 'L2',
          lat: 3,
          lon: 4,
          geoCalidad: null,
        },
      ],
      descartados: ['OTRO-CUE'],
    }

    const { registros, descartados } = reconciliarLocalizaciones(indexHtmlResult, geojsonResult)

    expect(registros).toHaveLength(1)
    expect(registros[0].nombre).toBe('Nuevo')
    expect(registros[0].departamento).toBe('D2')
    expect(registros[0].lat).toBe(3)
    expect(registros[0].lon).toBe(4)
    expect(registros[0].geoCalidad).toBe('excelente')
    expect(descartados).toEqual(['SINCUE', 'OTRO-CUE'])
  })

  it('un registro que solo esta en geojson se agrega igual', () => {
    const indexHtmlResult = { registros: [], descartados: [] }
    const geojsonResult = {
      registros: [
        {
          cueAnexo: '1800001-00',
          cui: null,
          nombre: 'Solo Geo',
          departamento: 'D',
          localidad: 'L',
          lat: 5,
          lon: 6,
          geoCalidad: null,
        },
      ],
      descartados: ['A'],
    }

    const { registros, descartados } = reconciliarLocalizaciones(indexHtmlResult, geojsonResult)

    expect(registros).toHaveLength(1)
    expect(registros[0]).toEqual(geojsonResult.registros[0])
    expect(descartados).toEqual(['A'])
  })
})

describe('upsertLocalizaciones', () => {
  it('inserta registros y es idempotente (ON CONFLICT no duplica)', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)

      const registros = [
        {
          cueAnexo: '1801605-04',
          cui: null,
          nombre: 'Escuela 415',
          departamento: 'GENERAL PAZ',
          localidad: 'ITA IBATE',
          lat: -27.42,
          lon: -57.33,
          geoCalidad: 'excelente',
        },
        {
          cueAnexo: '1800001-00',
          cui: null,
          nombre: 'Escuela 793',
          departamento: 'BELLA VISTA',
          localidad: 'MUCHAS ISLAS',
          lat: -28.38,
          lon: -58.79,
          geoCalidad: null,
        },
      ]
      await upsertLocalizaciones(client, registros)

      let res = await client.execute('SELECT COUNT(*) AS n FROM ge_localizacion')
      expect(Number(res.rows[0].n)).toBe(2)

      res = await client.execute(
        "SELECT cue_anexo, nombre, lat, lon FROM ge_localizacion WHERE cue_anexo = '1801605-04'",
      )
      expect(res.rows[0].nombre).toBe('Escuela 415')

      const registrosRepetidos = [
        {
          cueAnexo: '1801605-04',
          cui: null,
          nombre: 'Escuela 415 RENOMBRADA',
          departamento: 'GENERAL PAZ',
          localidad: 'ITA IBATE NORTE',
          lat: -27.5,
          lon: -57.4,
          geoCalidad: null,
        },
        registros[1],
        {
          cueAnexo: '1800020-00',
          cui: null,
          nombre: 'Tercera',
          departamento: 'D',
          localidad: 'L',
          lat: null,
          lon: null,
          geoCalidad: null,
        },
      ]
      await upsertLocalizaciones(client, registrosRepetidos)

      res = await client.execute('SELECT COUNT(*) AS n FROM ge_localizacion')
      expect(Number(res.rows[0].n)).toBe(3)

      res = await client.execute(
        "SELECT nombre, localidad, lat FROM ge_localizacion WHERE cue_anexo = '1801605-04'",
      )
      expect(res.rows[0].nombre).toBe('Escuela 415 RENOMBRADA')
      expect(res.rows[0].localidad).toBe('ITA IBATE NORTE')
      expect(res.rows[0].lat).toBe(-27.5)
    } finally {
      client.close()
    }
  })
})

describe('buildFixtureSecciones', () => {
  it('armar un corte con dos niveles en un CUE y un alumno en dos secciones', () => {
    const { secciones, membresias } = buildFixtureSecciones(1, ['1801020-00', '1800001-00'])

    expect(secciones.map((s) => s.geSectionId)).toEqual([1, 2, 3])

    const porCue = new Map()
    for (const s of secciones) {
      if (!porCue.has(s.cueAnexo)) porCue.set(s.cueAnexo, [])
      porCue.get(s.cueAnexo).push(s.nivel)
    }
    const conDosNiveles = [...porCue.values()].some((niveles) => new Set(niveles).size >= 2)
    expect(conDosNiveles).toBe(true)

    const personaEnDosSecciones = membresias
      .filter((m) => m.gePersonId === 1002)
      .map((m) => m.geSectionId)
    expect(personaEnDosSecciones.sort()).toEqual([1, 2])

    for (const s of secciones) {
      expect(s).toMatchObject({ corteId: 1 })
      expect(typeof s.geSectionId).toBe('number')
      expect(typeof s.cueAnexo).toBe('string')
      expect(typeof s.curso).toBe('string')
      expect(typeof s.division).toBe('string')
      expect(typeof s.nivel).toBe('string')
      expect(typeof s.turno).toBe('string')
    }
    for (const m of membresias) {
      expect(m).toMatchObject({ corteId: 1 })
      expect(typeof m.geSectionId).toBe('number')
      expect(typeof m.gePersonId).toBe('number')
    }
  })
})

describe('insertFixtureCorte', () => {
  it('crea el corte, lo activa y queda vigente', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('1801020-00', 'CUI1', 'Escuela 20', 'Corrientes', 'Capital', -27.47, -58.84)",
      )

      const corteId = await insertFixtureCorte(client, ['1801020-00'])
      expect(typeof corteId).toBe('number')

      const corte = await client.execute(
        'SELECT id, estado, ciclo_lectivo FROM ge_corte WHERE id = ?',
        [corteId],
      )
      expect(corte.rows[0].estado).toBe('vigente')
      expect(Number(corte.rows[0].ciclo_lectivo)).toBe(2026)

      const secciones = await client.execute(
        'SELECT COUNT(*) AS n FROM ge_seccion WHERE corte_id = ?',
        [corteId],
      )
      expect(Number(secciones.rows[0].n)).toBe(3)

      const membresias = await client.execute(
        'SELECT COUNT(*) AS n FROM ge_alumno_seccion WHERE corte_id = ?',
        [corteId],
      )
      expect(Number(membresias.rows[0].n)).toBe(4)
    } finally {
      client.close()
    }
  })
})