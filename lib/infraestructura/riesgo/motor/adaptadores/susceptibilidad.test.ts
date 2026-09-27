// Tests del adapter real de PuertoSusceptibilidad (G1,
// infra_susceptibilidad_estatica). Mismo patrón que aislamiento.test.ts:
// DATA_DIR temporal + ensureSeeded y borrado entre tests. La prueba de carga
// batch usa el punto de inyección `cargarFilas` para contar que UNA sola
// llamada a la "db" resuelve N cueAnexos distintos (tarea 3d).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { getDb as GetDb } from '@/lib/db'
import type { infraSusceptibilidadEstatica } from '@/lib/db/schema'
import type {
  FilaSusceptibilidadEstatica,
  crearAdapterSusceptibilidad as CrearAdapterSusceptibilidad,
} from './susceptibilidad'
import { ultimaFilaConservadoraPorCue } from './susceptibilidad'

type FilaInsert = typeof infraSusceptibilidadEstatica.$inferInsert

let dir: string
let prevDataDir: string | undefined

let db: ReturnType<typeof GetDb>
let tabla: typeof infraSusceptibilidadEstatica
let crearAdapterSusceptibilidad: typeof CrearAdapterSusceptibilidad

function fila(cueAnexo: string, over: Partial<FilaInsert> = {}): FilaInsert {
  return {
    cueAnexo,
    versionJob: '1',
    peligroInundacionFluvial: null,
    peligroInundacionPluvial: null,
    peligroViento: null,
    peligroCalor: null,
    periodoRetornoAnios: 100,
    fuente: 'physrisk',
    fechaCorrida: '2026-01-01',
    licencia: 'Apache-2.0, OS-Climate physrisk',
    importadoEn: '2026-01-02T00:00:00.000Z',
    ...over,
  }
}

async function cargarFilasDb(): Promise<FilaSusceptibilidadEstatica[]> {
  return db.select().from(tabla)
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'adapter-susceptibilidad-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  const { getDb } = await import('@/lib/db')
  const schema = await import('@/lib/db/schema')
  db = getDb()
  tabla = schema.infraSusceptibilidadEstatica
  ;({ crearAdapterSusceptibilidad } = await import('./susceptibilidad'))
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db.delete(tabla)
})

describe('crearAdapterSusceptibilidad.obtenerIndicadores', () => {
  it('con datos arma el Record sólo con los peligros presentes', async () => {
    await db.insert(tabla).values(
      fila('CUE-1', {
        peligroInundacionFluvial: 0.5,
        peligroInundacionPluvial: 0.25,
        peligroViento: 0.1,
        peligroCalor: 0.9,
        versionJob: 'v3',
      }),
    )

    const indicadores = await crearAdapterSusceptibilidad().obtenerIndicadores('CUE-1')

    expect(indicadores).toEqual({
      cueAnexo: 'CUE-1',
      indicadores: {
        peligro_inundacion_fluvial: 0.5,
        peligro_inundacion_pluvial: 0.25,
        peligro_viento: 0.1,
        peligro_calor: 0.9,
      },
      version: 'v3',
    })
  })

  it('omite los peligros null y conserva el 0 como valor medido', async () => {
    await db.insert(tabla).values(
      fila('CUE-1', {
        peligroInundacionFluvial: 0,
        peligroInundacionPluvial: null,
        peligroViento: 0.4,
        peligroCalor: null,
      }),
    )

    const indicadores = await crearAdapterSusceptibilidad().obtenerIndicadores('CUE-1')

    expect(indicadores?.indicadores).toEqual({
      peligro_inundacion_fluvial: 0,
      peligro_viento: 0.4,
    })
  })

  it('si los cuatro peligros son null devuelve null (catálogo vacío = sin evidencia)', async () => {
    await db.insert(tabla).values(fila('CUE-1'))

    const indicadores = await crearAdapterSusceptibilidad().obtenerIndicadores('CUE-1')

    expect(indicadores).toBeNull()
  })

  it('sin cobertura del dataset (ninguna fila) => null', async () => {
    const indicadores = await crearAdapterSusceptibilidad().obtenerIndicadores('CUE-INEXISTENTE')

    expect(indicadores).toBeNull()
  })

  it('elige la última versión por importadoEn', async () => {
    await db.insert(tabla).values([
      fila('CUE-1', {
        versionJob: 'v1',
        peligroInundacionFluvial: 0.1,
        importadoEn: '2026-01-01T00:00:00.000Z',
      }),
      fila('CUE-1', {
        versionJob: 'v2',
        peligroInundacionFluvial: 0.8,
        importadoEn: '2026-06-01T00:00:00.000Z',
      }),
    ])

    const indicadores = await crearAdapterSusceptibilidad().obtenerIndicadores('CUE-1')

    expect(indicadores?.version).toBe('v2')
    expect(indicadores?.indicadores.peligro_inundacion_fluvial).toBe(0.8)
  })

  it('carga batch: una sola llamada a la db resuelve N cueAnexos distintos', async () => {
    let llamadas = 0
    const adapter = crearAdapterSusceptibilidad({
      cargarFilas: async () => {
        llamadas += 1
        return cargarFilasDb()
      },
    })

    await db
      .insert(tabla)
      .values(
        Array.from({ length: 5 }, (_, i) =>
          fila(`CUE-${i}`, { peligroInundacionFluvial: 0.3 }),
        ),
      )

    const resultados = await Promise.all(
      ['CUE-0', 'CUE-1', 'CUE-2', 'CUE-3', 'CUE-4'].map((cue) =>
        adapter.obtenerIndicadores(cue),
      ),
    )

    expect(resultados.every((r) => r !== null)).toBe(true)
    expect(await adapter.obtenerIndicadores('CUE-AUSENTE')).toBeNull()
    expect(llamadas).toBe(1)
  })

  it('si la carga falla (tabla inexistente) degrada a sin cobertura y nunca lanza', async () => {
    const adapter = crearAdapterSusceptibilidad({
      cargarFilas: async () => {
        throw new Error('tabla inexistente')
      },
    })

    await expect(adapter.obtenerIndicadores('CUE-1')).resolves.toBeNull()
  })
})

describe('ultimaFilaConservadoraPorCue', () => {
  it('dentro de la misma versión prioriza el mayor período de retorno', () => {
    const base = {
      cueAnexo: 'CUE-1',
      versionJob: 'v1',
      fuente: 'physrisk',
      fechaCorrida: '2026-01-01',
      licencia: 'Apache-2.0, OS-Climate physrisk',
      importadoEn: '2026-01-02T00:00:00.000Z',
    }
    const seleccion = ultimaFilaConservadoraPorCue([
      {
        ...base,
        peligroInundacionFluvial: 0.1,
        peligroInundacionPluvial: null,
        peligroViento: null,
        peligroCalor: null,
        periodoRetornoAnios: 10,
      },
      {
        ...base,
        peligroInundacionFluvial: 0.7,
        peligroInundacionPluvial: null,
        peligroViento: null,
        peligroCalor: null,
        periodoRetornoAnios: 500,
      },
    ])

    expect(seleccion.get('CUE-1')?.periodoRetornoAnios).toBe(500)
    expect(seleccion.get('CUE-1')?.peligroInundacionFluvial).toBe(0.7)
  })
})
