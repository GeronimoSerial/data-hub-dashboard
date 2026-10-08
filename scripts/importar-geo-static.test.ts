import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  descubrirArchivosGeoStatic,
  importarAislamiento,
  importarSusceptibilidad,
  importarGeometria,
  importarExposicionRuta,
} from './importar-geo-static.mjs'

describe('descubrirArchivosGeoStatic', () => {
  it('resuelve los nombres de archivo versionados de geo-static', () => {
    const archivos = [
      'aislamiento_osm-v2-2026-09-26.csv',
      'susceptibilidad_estatica-v1-2026.csv',
      'accesos_osm_geometria-v2-2026-09-26.ndjson.gz',
      'exposicion_ruta_inundacion-v1-2026-09-29.ndjson.gz',
    ]

    expect(descubrirArchivosGeoStatic(archivos, '/salida')).toEqual({
      aislamiento: '/salida/aislamiento_osm-v2-2026-09-26.csv',
      susceptibilidad: '/salida/susceptibilidad_estatica-v1-2026.csv',
      geometria: '/salida/accesos_osm_geometria-v2-2026-09-26.ndjson.gz',
      exposicionRuta: '/salida/exposicion_ruta_inundacion-v1-2026-09-29.ndjson.gz',
    })
  })

  it('no confunde el archivo de auditoria sin ruta con aislamiento', () => {
    expect(descubrirArchivosGeoStatic(['aislamiento_osm_sin_ruta-v2-2026-09-26.csv'], '/salida')).toEqual({})
  })

  it('devuelve un objeto vacio cuando no hay archivos', () => {
    expect(descubrirArchivosGeoStatic([], '/salida')).toEqual({})
  })

  it('elige la versión lexicográficamente más reciente de cada capa', () => {
    expect(descubrirArchivosGeoStatic([
      'aislamiento_osm-v1-2026-09-26.csv',
      'aislamiento_osm-v2-2026-09-26.csv',
      'susceptibilidad_estatica-v1-2026.csv',
      'susceptibilidad_estatica-v2-2026.csv',
    ], '/salida')).toEqual({
      aislamiento: '/salida/aislamiento_osm-v2-2026-09-26.csv',
      susceptibilidad: '/salida/susceptibilidad_estatica-v2-2026.csv',
    })
  })
})

function crearDbFalsa() {
  const llamadas: Array<{ tabla: string; valores: unknown }> = []
  const conflictos: Array<Record<string, unknown>> = []
  const db = {
    insert(tabla: { _: { name?: string } } & Record<string, unknown>) {
      return {
        values(valores: unknown) {
          llamadas.push({ tabla: String((tabla as { _?: { name?: string } })._?.name ?? 'tabla'), valores })
          return {
            onConflictDoUpdate: vi.fn((configuracion: Record<string, unknown>) => {
              conflictos.push(configuracion)
              return Promise.resolve(undefined)
            }),
          }
        },
      }
    },
  }
  return { db, llamadas, conflictos }
}

const tablaFalsa = {
  _: { name: 'infra_aislamiento_osm' },
  cueAnexo: 'cue_anexo',
  versionJob: 'version_job',
}

const CABECERA_AISLAMIENTO = 'cue_anexo,distancia_via_pavimentada_m,distancia_cabecera_departamental_m,tramos_sin_pavimentar_count,tramos_sin_pavimentar_km,cruces_agua_count,cruces_agua_con_puente_count,cruces_agua_con_vado_count,tiene_alternativa_sin_cruce,tiene_alternativa_pavimentada,indice_aislamiento,motivo_sin_datos,snap_distancia_m,version_job,fecha_extracto_osm,licencia'
const CABECERA_SUSCEPTIBILIDAD = 'cue_anexo,peligro_inundacion_fluvial,peligro_inundacion_pluvial,peligro_viento,peligro_calor,periodo_retorno_anios,fuente,version_job,fecha_corrida,licencia'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'geo-static-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function escribirCsv(nombre: string, cabecera: string, filas: string[]) {
  const path = join(dir, nombre)
  writeFileSync(path, [cabecera, ...filas].join('\n'))
  return path
}

async function rechazaCsv(
  importador: typeof importarAislamiento | typeof importarSusceptibilidad,
  archivo: string,
  filas: string[],
) {
  const cabecera = importador === importarAislamiento
    ? CABECERA_AISLAMIENTO
    : CABECERA_SUSCEPTIBILIDAD
  const path = escribirCsv(archivo, cabecera, filas)
  const { db, llamadas } = crearDbFalsa()
  const resultado = await importador(path, { db: db as never, tabla: tablaFalsa as never })
  expect(resultado).toEqual({ procesadas: 1, ok: 0, fallidas: 1 })
  expect(llamadas).toHaveLength(0)
}

describe('importarAislamiento', () => {
  it('parsea una fila valida y llama al upsert con los valores esperados', async () => {
    const path = escribirCsv('aislamiento.csv', CABECERA_AISLAMIENTO, [
      '1801605-04,1500.5,1500.5,2,3.0,0,0,0,1,1,1,,42.5,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
    ])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarAislamiento(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 1, ok: 1, fallidas: 0 })
    expect(llamadas).toHaveLength(1)
    const fila = llamadas[0].valores as Record<string, unknown>
    expect(fila.cueAnexo).toBe('1801605-04')
    expect(fila.tieneAlternativaSinCruce).toBe(true)
    expect(fila.tieneAlternativaPavimentada).toBe(true)
    expect(fila.tramosSinPavimentarKm).toBe(3)
    expect(fila.motivoSinDatos).toBeNull()
    expect(fila.distanciaViaPavimentadaM).toBe(1500.5)
    expect(fila.indiceAislamiento).toBe(1)
    expect(typeof fila.importadoEn).toBe('string')
  })

  it('convierte campos vacios a null y booleano en 0', async () => {
    const path = escribirCsv('aislamiento2.csv', CABECERA_AISLAMIENTO, [
      '1801605-05,,,,,,,,0,,,sin_conexion_red,9000,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
    ])

    const { db, llamadas } = crearDbFalsa()
    await importarAislamiento(path, { db: db as never, tabla: tablaFalsa as never })

    const fila = llamadas[0].valores as Record<string, unknown>
    expect(fila.distanciaViaPavimentadaM).toBeNull()
    expect(fila.tieneAlternativaSinCruce).toBe(false)
    expect(fila.indiceAislamiento).toBeNull()
    expect(fila.motivoSinDatos).toBe('sin_conexion_red')
  })

  it('reporta una fila invalida sin abortar el resto del archivo', async () => {
    const path = escribirCsv('aislamiento3.csv', CABECERA_AISLAMIENTO, [
      ',1500.5,1500.5,2,3.0,0,0,0,1,1,1,,42.5,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
      '1801605-06,1500.5,1500.5,2,3.0,0,0,0,1,1,1,,42.5,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
    ])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarAislamiento(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 2, ok: 1, fallidas: 1 })
    expect(llamadas).toHaveLength(1)
  })

  it.each([
    {
      titulo: 'rechaza indice_aislamiento no numerico sin llamar a la db',
      archivo: 'aislamiento-indice-invalido.csv',
      fila: '1801605-07,1500.5,1500.5,2,3.0,0,0,0,1,1,no-es-numero,,42.5,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
    },
    {
      titulo: 'rechaza cue_anexo vacio sin llamar a la db',
      archivo: 'aislamiento-cue-vacio.csv',
      fila: ',1500.5,1500.5,2,3.0,0,0,0,1,1,1,,42.5,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
    },
    {
      titulo: 'rechaza fecha_extracto_osm con formato no ISO sin llamar a la db',
      archivo: 'aislamiento-fecha-invalida.csv',
      fila: '1801605-08,1500.5,1500.5,2,3.0,0,0,0,1,1,1,,42.5,1,26-09-2026,"© OpenStreetMap contributors, ODbL"',
    },
  ])('$titulo', async ({ archivo, fila }) => {
    await rechazaCsv(importarAislamiento, archivo, [fila])
  })
})

describe('importarSusceptibilidad', () => {
  it('parsea una fila valida con fuente no_disponible', async () => {
    const path = escribirCsv('susceptibilidad.csv', CABECERA_SUSCEPTIBILIDAD, [
      '1801605-04,,,,,100,no_disponible,1,2026-09-26,"Apache-2.0, OS-Climate physrisk"',
    ])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarSusceptibilidad(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 1, ok: 1, fallidas: 0 })
    const fila = llamadas[0].valores as Record<string, unknown>
    expect(fila.peligroInundacionFluvial).toBeNull()
    expect(fila.fuente).toBe('no_disponible')
    expect(fila.periodoRetornoAnios).toBe(100)
  })

  it.each([
    {
      titulo: 'rechaza periodo_retorno_anios no numerico sin llamar a la db',
      archivo: 'susceptibilidad-periodo-invalido.csv',
      fila: '1801605-09,,,,,abc,no_disponible,1,2026-09-26,"Apache-2.0, OS-Climate physrisk"',
    },
    {
      titulo: 'rechaza periodo_retorno_anios vacio (null) sin llamar a la db',
      archivo: 'susceptibilidad-periodo-vacio.csv',
      fila: '1801605-10,,,,,,no_disponible,1,2026-09-26,"Apache-2.0, OS-Climate physrisk"',
    },
  ])('$titulo', async ({ archivo, fila }) => {
    await rechazaCsv(importarSusceptibilidad, archivo, [fila])
  })
})

const tablaGeometriaFalsa = {
  _: { name: 'infra_acceso_osm_geometria' },
  cueAnexo: 'cue_anexo',
  versionJob: 'version_job',
}

function filaGeometriaBase(overrides: Record<string, unknown> = {}) {
  return {
    cue_anexo: '1801605-04',
    version_job: '1',
    fecha_extracto_osm: '2026-09-26',
    licencia: '© OpenStreetMap contributors, ODbL',
    ruta: {
      type: 'LineString',
      coordinates: [
        [-58.8, -27.4],
        [-58.81, -27.41],
      ],
    },
    cruces: [{ lon: -58.8, lat: -27.4, clasificacion: 'puente' }],
    motivo_sin_geometria: null,
    ...overrides,
  }
}

function escribirNdjsonGz(nombre: string, objetos: unknown[]): string {
  const path = join(dir, nombre)
  const texto = objetos
    .map((objeto) => (typeof objeto === 'string' ? objeto : JSON.stringify(objeto)))
    .join('\n')
  writeFileSync(path, gzipSync(texto))
  return path
}

describe('importarGeometria', () => {
  it('inserta una fila valida con ruta y cruces en camelCase', async () => {
    const path = escribirNdjsonGz('geometria.ndjson.gz', [filaGeometriaBase()])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarGeometria(path, {
      db: db as never,
      tabla: tablaGeometriaFalsa as never,
    })

    expect(resultado).toEqual({ procesadas: 1, ok: 1, fallidas: 0 })
    expect(llamadas).toHaveLength(1)
    const lote = llamadas[0].valores as Array<Record<string, unknown>>
    expect(Array.isArray(lote)).toBe(true)
    expect(lote).toHaveLength(1)
    const fila = lote[0]
    expect(fila.cueAnexo).toBe('1801605-04')
    expect(fila.versionJob).toBe('1')
    expect(fila.motivoSinGeometria).toBeNull()
    expect(fila.fechaExtractoOsm).toBe('2026-09-26')
    expect(fila.ruta).toEqual(filaGeometriaBase().ruta)
    expect(fila.cruces).toEqual(filaGeometriaBase().cruces)
    expect(fila.viaPrincipal).toBeNull()
    expect(fila.destinoNombre).toBeNull()
    expect(fila.distanciaDestinoM).toBeNull()
    expect(typeof fila.importadoEn).toBe('string')
  })

  it('inserta los campos de destino y via principal del registro v3', async () => {
    const viaPrincipal = { nombre: 'Ruta Provincial 27', tipo: 'primary', pavimentada: true }
    const path = escribirNdjsonGz('geometria-v3.ndjson.gz', [filaGeometriaBase({
      via_principal: viaPrincipal,
      destino: { nombre: 'Saladas' },
      distancia_destino_m: 35677.17,
    })])

    const { db, llamadas, conflictos } = crearDbFalsa()
    const resultado = await importarGeometria(path, {
      db: db as never,
      tabla: tablaGeometriaFalsa as never,
    })

    expect(resultado).toEqual({ procesadas: 1, ok: 1, fallidas: 0 })
    const fila = (llamadas[0].valores as Array<Record<string, unknown>>)[0]
    expect(JSON.parse(fila.viaPrincipal as string)).toEqual(viaPrincipal)
    expect(fila.destinoNombre).toBe('Saladas')
    expect(fila.distanciaDestinoM).toBe(35677.17)
    expect(Object.keys(conflictos[0].set as object)).toEqual(expect.arrayContaining([
      'viaPrincipal', 'destinoNombre', 'distanciaDestinoM',
    ]))
  })

  it('acepta campos nuevos explicitamente nulos', async () => {
    const path = escribirNdjsonGz('geometria-campos-nulos.ndjson.gz', [filaGeometriaBase({
      via_principal: null,
      destino: null,
      distancia_destino_m: null,
    })])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarGeometria(path, {
      db: db as never,
      tabla: tablaGeometriaFalsa as never,
    })

    expect(resultado).toEqual({ procesadas: 1, ok: 1, fallidas: 0 })
    const fila = (llamadas[0].valores as Array<Record<string, unknown>>)[0]
    expect(fila.viaPrincipal).toBeNull()
    expect(fila.destinoNombre).toBeNull()
    expect(fila.distanciaDestinoM).toBeNull()
  })

  it('rechaza via_principal invalida sin llamar a la db', async () => {
    const path = escribirNdjsonGz('geometria-via-invalida.ndjson.gz', [filaGeometriaBase({
      via_principal: { nombre: 'Ruta', tipo: 'primary', pavimentada: 'si' },
    })])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarGeometria(path, {
      db: db as never,
      tabla: tablaGeometriaFalsa as never,
    })

    expect(resultado).toEqual({ procesadas: 1, ok: 0, fallidas: 1 })
    expect(llamadas).toHaveLength(0)
  })

  it('acepta ruta null cuando se declara motivo_sin_geometria', async () => {
    const path = escribirNdjsonGz('geometria-sin-conexion.ndjson.gz', [
      filaGeometriaBase({ ruta: null, cruces: [], motivo_sin_geometria: 'sin_conexion_red' }),
    ])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarGeometria(path, {
      db: db as never,
      tabla: tablaGeometriaFalsa as never,
    })

    expect(resultado).toEqual({ procesadas: 1, ok: 1, fallidas: 0 })
    const fila = (llamadas[0].valores as Array<Record<string, unknown>>)[0]
    expect(fila.ruta).toBeNull()
    expect(fila.motivoSinGeometria).toBe('sin_conexion_red')
  })

  it.each([
    {
      titulo: 'rechaza ruta null sin motivo_sin_geometria',
      archivo: 'geometria-motivo-null.ndjson.gz',
      overrides: { ruta: null, motivo_sin_geometria: null },
    },
    {
      titulo: 'rechaza una clasificacion de cruce desconocida',
      archivo: 'geometria-clasificacion.ndjson.gz',
      overrides: { cruces: [{ lon: -58.8, lat: -27.4, clasificacion: 'tunel' }] },
    },
    {
      titulo: 'rechaza una coordenada fuera de rango',
      archivo: 'geometria-coordenada.ndjson.gz',
      overrides: {
        ruta: {
          type: 'LineString',
          coordinates: [
            [-58.8, 100],
            [-58.81, -27.41],
          ],
        },
      },
    },
  ])('$titulo', async ({ archivo, overrides }) => {
    const path = escribirNdjsonGz(archivo, [filaGeometriaBase(overrides)])
    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarGeometria(path, {
      db: db as never,
      tabla: tablaGeometriaFalsa as never,
    })

    expect(resultado).toEqual({ procesadas: 1, ok: 0, fallidas: 1 })
    expect(llamadas).toHaveLength(0)
  })

  it('cuenta una linea con JSON malformado como fallida sin abortar el resto', async () => {
    const path = escribirNdjsonGz('geometria-json-roto.ndjson.gz', [
      '{no-es-json',
      filaGeometriaBase(),
    ])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarGeometria(path, {
      db: db as never,
      tabla: tablaGeometriaFalsa as never,
    })

    expect(resultado).toEqual({ procesadas: 2, ok: 1, fallidas: 1 })
    expect(llamadas).toHaveLength(1)
    expect((llamadas[0].valores as unknown[])).toHaveLength(1)
  })

  it('ignora lineas vacias', async () => {
    const path = escribirNdjsonGz('geometria-vacias.ndjson.gz', [
      '',
      filaGeometriaBase(),
      '   ',
    ])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarGeometria(path, {
      db: db as never,
      tabla: tablaGeometriaFalsa as never,
    })

    expect(resultado).toEqual({ procesadas: 1, ok: 1, fallidas: 0 })
    expect(llamadas).toHaveLength(1)
  })
})

const tablaExposicionRutaFalsa = {
  _: { name: 'infra_exposicion_ruta_inundacion' }, cueAnexo: 'cue_anexo', versionJob: 'version_job',
}

function filaExposicionRuta(overrides: Record<string, unknown> = {}) {
  return {
    cue_anexo: '1801605-04', version_job: 'v1', estado: 'con_profundidad', motivo_sin_dato: null,
    celdas_total: 2, celdas_con_dato: 2, celdas_con_profundidad: 1, profundidad_max_m: 0.7,
    cobertura: 1, periodo_retorno_anios: 100, resolucion_arcsec: 30, escenario: 'historico',
    fuente: 'WRI Aqueduct v2', fecha_corrida: '2026-09-29', licencia: 'Apache-2.0',
    celdas: [{ lon: -58.8, lat: -27.4, profundidad_m: 0.7 }, { lon: -58.81, lat: -27.41, profundidad_m: null }],
    ...overrides,
  }
}

describe('importarExposicionRuta', () => {
  it('mapea y conserva estados, celdas y null; upsert repetido es idempotente por clave', async () => {
    const path = escribirNdjsonGz('exposicion.ndjson.gz', [
      filaExposicionRuta(),
      filaExposicionRuta({ cue_anexo: '1801605-05', estado: 'sin_profundidad', profundidad_max_m: null, celdas: [{ lon: 1, lat: 2, profundidad_m: null }] }),
      filaExposicionRuta({ cue_anexo: '1801605-06', estado: 'sin_ruta', celdas_total: 0, celdas_con_dato: 0, celdas_con_profundidad: 0, profundidad_max_m: null, cobertura: 0, celdas: [] }),
    ])
    const { db, llamadas } = crearDbFalsa()
    const primera = await importarExposicionRuta(path, { db: db as never, tabla: tablaExposicionRutaFalsa as never })
    const segunda = await importarExposicionRuta(path, { db: db as never, tabla: tablaExposicionRutaFalsa as never })
    expect(primera).toEqual({ procesadas: 3, ok: 3, fallidas: 0 })
    expect(segunda).toEqual(primera)
    expect(llamadas).toHaveLength(2)
    expect(llamadas[0].valores).toHaveLength(3)
    const lote = llamadas[0].valores as Array<Record<string, unknown>>
    expect(lote[0].estado).toBe('con_profundidad')
    expect(lote[0].celdas).toEqual([{ lon: -58.8, lat: -27.4, profundidadM: 0.7 }, { lon: -58.81, lat: -27.41, profundidadM: null }])
    expect(lote[1].profundidadMaxM).toBeNull()
    expect(lote[2].estado).toBe('sin_ruta')
    expect(lote[2].profundidadMaxM).toBeNull()
    expect(lote[2].celdas).toEqual([])
  })

  it('cuenta cobertura fuera de rango y estado desconocido como filas fallidas', async () => {
    const path = escribirNdjsonGz('exposicion-invalida.ndjson.gz', [
      filaExposicionRuta({ cobertura: 2 }),
      filaExposicionRuta({ estado: 'inundada' }),
    ])
    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarExposicionRuta(path, { db: db as never, tabla: tablaExposicionRutaFalsa as never })
    expect(resultado).toEqual({ procesadas: 2, ok: 0, fallidas: 2 })
    expect(llamadas).toHaveLength(0)
  })
})
