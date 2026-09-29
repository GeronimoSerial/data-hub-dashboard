import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { importarAislamiento, importarSusceptibilidad, importarGeometria, importarExposicionRuta } from './importar-geo-static.mjs'

function crearDbFalsa() {
  const llamadas: Array<{ tabla: string; valores: unknown }> = []
  const db = {
    insert(tabla: { _: { name?: string } } & Record<string, unknown>) {
      return {
        values(valores: unknown) {
          llamadas.push({ tabla: String((tabla as { _?: { name?: string } })._?.name ?? 'tabla'), valores })
          return {
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          }
        },
      }
    },
  }
  return { db, llamadas }
}

const tablaFalsa = {
  _: { name: 'infra_aislamiento_osm' },
  cueAnexo: 'cue_anexo',
  versionJob: 'version_job',
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'geo-static-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('importarAislamiento', () => {
  it('parsea una fila valida y llama al upsert con los valores esperados', async () => {
    const csv = [
      'cue_anexo,distancia_via_pavimentada_m,distancia_cabecera_departamental_m,tramos_sin_pavimentar_count,cruces_agua_count,cruces_agua_con_puente_count,cruces_agua_con_vado_count,tiene_alternativa_sin_cruce,indice_aislamiento,motivo_sin_datos,snap_distancia_m,version_job,fecha_extracto_osm,licencia',
      '1801605-04,1500.5,1500.5,2,0,0,0,1,1,,42.5,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
    ].join('\n')
    const path = join(dir, 'aislamiento.csv')
    writeFileSync(path, csv)

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarAislamiento(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 1, ok: 1, fallidas: 0 })
    expect(llamadas).toHaveLength(1)
    const fila = llamadas[0].valores as Record<string, unknown>
    expect(fila.cueAnexo).toBe('1801605-04')
    expect(fila.tieneAlternativaSinCruce).toBe(true)
    expect(fila.motivoSinDatos).toBeNull()
    expect(fila.distanciaViaPavimentadaM).toBe(1500.5)
    expect(fila.indiceAislamiento).toBe(1)
    expect(typeof fila.importadoEn).toBe('string')
  })

  it('convierte campos vacios a null y booleano en 0', async () => {
    const csv = [
      'cue_anexo,distancia_via_pavimentada_m,distancia_cabecera_departamental_m,tramos_sin_pavimentar_count,cruces_agua_count,cruces_agua_con_puente_count,cruces_agua_con_vado_count,tiene_alternativa_sin_cruce,indice_aislamiento,motivo_sin_datos,snap_distancia_m,version_job,fecha_extracto_osm,licencia',
      '1801605-05,,,,,,,0,,sin_conexion_red,9000,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
    ].join('\n')
    const path = join(dir, 'aislamiento2.csv')
    writeFileSync(path, csv)

    const { db, llamadas } = crearDbFalsa()
    await importarAislamiento(path, { db: db as never, tabla: tablaFalsa as never })

    const fila = llamadas[0].valores as Record<string, unknown>
    expect(fila.distanciaViaPavimentadaM).toBeNull()
    expect(fila.tieneAlternativaSinCruce).toBe(false)
    expect(fila.indiceAislamiento).toBeNull()
    expect(fila.motivoSinDatos).toBe('sin_conexion_red')
  })

  it('reporta una fila invalida sin abortar el resto del archivo', async () => {
    const csv = [
      'cue_anexo,distancia_via_pavimentada_m,distancia_cabecera_departamental_m,tramos_sin_pavimentar_count,cruces_agua_count,cruces_agua_con_puente_count,cruces_agua_con_vado_count,tiene_alternativa_sin_cruce,indice_aislamiento,motivo_sin_datos,snap_distancia_m,version_job,fecha_extracto_osm,licencia',
      ',1500.5,1500.5,2,0,0,0,1,1,,42.5,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
      '1801605-06,1500.5,1500.5,2,0,0,0,1,1,,42.5,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
    ].join('\n')
    const path = join(dir, 'aislamiento3.csv')
    writeFileSync(path, csv)

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarAislamiento(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 2, ok: 1, fallidas: 1 })
    expect(llamadas).toHaveLength(1)
  })

  it('rechaza indice_aislamiento no numerico sin llamar a la db', async () => {
    const csv = [
      'cue_anexo,distancia_via_pavimentada_m,distancia_cabecera_departamental_m,tramos_sin_pavimentar_count,cruces_agua_count,cruces_agua_con_puente_count,cruces_agua_con_vado_count,tiene_alternativa_sin_cruce,indice_aislamiento,motivo_sin_datos,snap_distancia_m,version_job,fecha_extracto_osm,licencia',
      '1801605-07,1500.5,1500.5,2,0,0,0,1,no-es-numero,,42.5,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
    ].join('\n')
    const path = join(dir, 'aislamiento-indice-invalido.csv')
    writeFileSync(path, csv)

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarAislamiento(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 1, ok: 0, fallidas: 1 })
    expect(llamadas).toHaveLength(0)
  })

  it('rechaza cue_anexo vacio sin llamar a la db', async () => {
    const csv = [
      'cue_anexo,distancia_via_pavimentada_m,distancia_cabecera_departamental_m,tramos_sin_pavimentar_count,cruces_agua_count,cruces_agua_con_puente_count,cruces_agua_con_vado_count,tiene_alternativa_sin_cruce,indice_aislamiento,motivo_sin_datos,snap_distancia_m,version_job,fecha_extracto_osm,licencia',
      ',1500.5,1500.5,2,0,0,0,1,1,,42.5,1,2026-09-26,"© OpenStreetMap contributors, ODbL"',
    ].join('\n')
    const path = join(dir, 'aislamiento-cue-vacio.csv')
    writeFileSync(path, csv)

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarAislamiento(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 1, ok: 0, fallidas: 1 })
    expect(llamadas).toHaveLength(0)
  })

  it('rechaza fecha_extracto_osm con formato no ISO sin llamar a la db', async () => {
    const csv = [
      'cue_anexo,distancia_via_pavimentada_m,distancia_cabecera_departamental_m,tramos_sin_pavimentar_count,cruces_agua_count,cruces_agua_con_puente_count,cruces_agua_con_vado_count,tiene_alternativa_sin_cruce,indice_aislamiento,motivo_sin_datos,snap_distancia_m,version_job,fecha_extracto_osm,licencia',
      '1801605-08,1500.5,1500.5,2,0,0,0,1,1,,42.5,1,26-09-2026,"© OpenStreetMap contributors, ODbL"',
    ].join('\n')
    const path = join(dir, 'aislamiento-fecha-invalida.csv')
    writeFileSync(path, csv)

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarAislamiento(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 1, ok: 0, fallidas: 1 })
    expect(llamadas).toHaveLength(0)
  })
})

describe('importarSusceptibilidad', () => {
  it('parsea una fila valida con fuente no_disponible', async () => {
    const csv = [
      'cue_anexo,peligro_inundacion_fluvial,peligro_inundacion_pluvial,peligro_viento,peligro_calor,periodo_retorno_anios,fuente,version_job,fecha_corrida,licencia',
      '1801605-04,,,,,100,no_disponible,1,2026-09-26,"Apache-2.0, OS-Climate physrisk"',
    ].join('\n')
    const path = join(dir, 'susceptibilidad.csv')
    writeFileSync(path, csv)

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarSusceptibilidad(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 1, ok: 1, fallidas: 0 })
    const fila = llamadas[0].valores as Record<string, unknown>
    expect(fila.peligroInundacionFluvial).toBeNull()
    expect(fila.fuente).toBe('no_disponible')
    expect(fila.periodoRetornoAnios).toBe(100)
  })

  it('rechaza periodo_retorno_anios no numerico sin llamar a la db', async () => {
    const csv = [
      'cue_anexo,peligro_inundacion_fluvial,peligro_inundacion_pluvial,peligro_viento,peligro_calor,periodo_retorno_anios,fuente,version_job,fecha_corrida,licencia',
      '1801605-09,,,,,abc,no_disponible,1,2026-09-26,"Apache-2.0, OS-Climate physrisk"',
    ].join('\n')
    const path = join(dir, 'susceptibilidad-periodo-invalido.csv')
    writeFileSync(path, csv)

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarSusceptibilidad(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 1, ok: 0, fallidas: 1 })
    expect(llamadas).toHaveLength(0)
  })

  it('rechaza periodo_retorno_anios vacio (null) sin llamar a la db', async () => {
    const csv = [
      'cue_anexo,peligro_inundacion_fluvial,peligro_inundacion_pluvial,peligro_viento,peligro_calor,periodo_retorno_anios,fuente,version_job,fecha_corrida,licencia',
      '1801605-10,,,,,,no_disponible,1,2026-09-26,"Apache-2.0, OS-Climate physrisk"',
    ].join('\n')
    const path = join(dir, 'susceptibilidad-periodo-vacio.csv')
    writeFileSync(path, csv)

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarSusceptibilidad(path, { db: db as never, tabla: tablaFalsa as never })

    expect(resultado).toEqual({ procesadas: 1, ok: 0, fallidas: 1 })
    expect(llamadas).toHaveLength(0)
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
    expect(typeof fila.importadoEn).toBe('string')
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

  it('rechaza ruta null sin motivo_sin_geometria', async () => {
    const path = escribirNdjsonGz('geometria-motivo-null.ndjson.gz', [
      filaGeometriaBase({ ruta: null, motivo_sin_geometria: null }),
    ])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarGeometria(path, {
      db: db as never,
      tabla: tablaGeometriaFalsa as never,
    })

    expect(resultado).toEqual({ procesadas: 1, ok: 0, fallidas: 1 })
    expect(llamadas).toHaveLength(0)
  })

  it('rechaza una clasificacion de cruce desconocida', async () => {
    const path = escribirNdjsonGz('geometria-clasificacion.ndjson.gz', [
      filaGeometriaBase({ cruces: [{ lon: -58.8, lat: -27.4, clasificacion: 'tunel' }] }),
    ])

    const { db, llamadas } = crearDbFalsa()
    const resultado = await importarGeometria(path, {
      db: db as never,
      tabla: tablaGeometriaFalsa as never,
    })

    expect(resultado).toEqual({ procesadas: 1, ok: 0, fallidas: 1 })
    expect(llamadas).toHaveLength(0)
  })

  it('rechaza una coordenada fuera de rango', async () => {
    const path = escribirNdjsonGz('geometria-coordenada.ndjson.gz', [
      filaGeometriaBase({
        ruta: {
          type: 'LineString',
          coordinates: [
            [-58.8, 100],
            [-58.81, -27.41],
          ],
        },
      }),
    ])

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
