import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { importarAislamiento, importarSusceptibilidad } from './importar-geo-static.mjs'

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
})
