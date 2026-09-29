// Tests del adapter real de PuertoAislamiento (G1, infra_aislamiento_osm).
// Se sigue el patrón de historial.test.ts / lluvia.test.ts: DATA_DIR temporal
// + ensureSeeded, borrado de la tabla entre tests. La prueba de carga batch
// usa el punto de inyección `cargarFilas` para contar que UNA sola llamada a
// la "db" resuelve N cueAnexos distintos (tarea 3d).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type { getDb as GetDb } from '@/lib/db'
import type { infraAislamientoOsm } from '@/lib/db/schema'
import type { FilaAislamientoOsm, crearAdapterAislamiento as CrearAdapterAislamiento } from './aislamiento'

type FilaInsert = typeof infraAislamientoOsm.$inferInsert

usarDbTemporal('adapter-aislamiento-')

beforeAll(async () => {
  const { getDb } = await import('@/lib/db')
  const schema = await import('@/lib/db/schema')
  db = getDb()
  tabla = schema.infraAislamientoOsm
  ;({ crearAdapterAislamiento } = await import('./aislamiento'))
})

let db: ReturnType<typeof GetDb>
let tabla: typeof infraAislamientoOsm
let crearAdapterAislamiento: typeof CrearAdapterAislamiento

function fila(cueAnexo: string, over: Partial<FilaInsert> = {}): FilaInsert {
  return {
    cueAnexo,
    versionJob: '1',
    distanciaViaPavimentadaM: null,
    distanciaCabeceraDepartamentalM: null,
    tramosSinPavimentarCount: null,
    crucesAguaCount: null,
    crucesAguaConPuenteCount: null,
    crucesAguaConVadoCount: null,
    tieneAlternativaSinCruce: null,
    indiceAislamiento: null,
    motivoSinDatos: null,
    snapDistanciaM: null,
    fechaExtractoOsm: '2026-09-01',
    licencia: 'ODbL',
    importadoEn: '2026-09-02T00:00:00.000Z',
    ...over,
  }
}

async function cargarFilasDb(): Promise<FilaAislamientoOsm[]> {
  return db.select().from(tabla)
}

beforeEach(async () => {
  await db.delete(tabla)
})

describe('crearAdapterAislamiento.obtenerIndice', () => {
  it('con datos mapea el índice y los conteos de cruces de la fila', async () => {
    await db.insert(tabla).values(
      fila('CUE-1', {
        crucesAguaCount: 4,
        crucesAguaConPuenteCount: 1,
        crucesAguaConVadoCount: 2,
        tieneAlternativaSinCruce: false,
        indiceAislamiento: 2,
        versionJob: 'v7',
        fechaExtractoOsm: '2026-08-15',
        licencia: 'ODbL-1.0',
      }),
    )

    const indice = await crearAdapterAislamiento().obtenerIndice('CUE-1')

    expect(indice).toEqual({
      cueAnexo: 'CUE-1',
      nivel: 2,
      crucesAguaCount: 4,
      crucesAguaConPuenteCount: 1,
      crucesAguaConVadoCount: 2,
      tieneAlternativaSinCruce: false,
      versionJob: 'v7',
      fechaExtractoOsm: '2026-08-15',
      licencia: 'ODbL-1.0',
    })
  })

  it('fila con índice nulo y motivo "sin_conexion_red" => nivel sin_datos_red (nunca 0)', async () => {
    await db
      .insert(tabla)
      .values(fila('CUE-1', { indiceAislamiento: null, motivoSinDatos: 'sin_conexion_red' }))

    const indice = await crearAdapterAislamiento().obtenerIndice('CUE-1')

    expect(indice?.nivel).toBe('sin_datos_red')
    expect(indice?.nivel).not.toBe(0)
  })

  it('cualquier motivo no vacío con índice nulo también da sin_datos_red', async () => {
    await db
      .insert(tabla)
      .values(fila('CUE-1', { indiceAislamiento: null, motivoSinDatos: 'extracto_incompleto' }))

    const indice = await crearAdapterAislamiento().obtenerIndice('CUE-1')

    expect(indice?.nivel).toBe('sin_datos_red')
  })

  it('índice fuera de rango (4, dato corrupto) => sin_datos_red, nunca 4 ni throw', async () => {
    await db.insert(tabla).values(fila('CUE-1', { indiceAislamiento: 4 }))

    const indice = await crearAdapterAislamiento().obtenerIndice('CUE-1')

    expect(indice?.nivel).toBe('sin_datos_red')
    expect(indice?.nivel).not.toBe(4)
  })

  it('sin cobertura del dataset (ninguna fila) => null, nunca 0', async () => {
    const indice = await crearAdapterAislamiento().obtenerIndice('CUE-INEXISTENTE')

    expect(indice).toBeNull()
  })

  it('elige la última versión por importadoEn', async () => {
    await db.insert(tabla).values([
      fila('CUE-1', {
        versionJob: 'v1',
        indiceAislamiento: 1,
        importadoEn: '2026-01-01T00:00:00.000Z',
      }),
      fila('CUE-1', {
        versionJob: 'v2',
        indiceAislamiento: 3,
        importadoEn: '2026-06-01T00:00:00.000Z',
      }),
    ])

    const indice = await crearAdapterAislamiento().obtenerIndice('CUE-1')

    expect(indice?.nivel).toBe(3)
    expect(indice?.versionJob).toBe('v2')
  })

  it('ante empate de importadoEn desempata por mayor versionJob (numérico: 10 > 9)', async () => {
    await db.insert(tabla).values([
      fila('CUE-1', {
        versionJob: '9',
        indiceAislamiento: 1,
        importadoEn: '2026-06-01T00:00:00.000Z',
      }),
      fila('CUE-1', {
        versionJob: '10',
        indiceAislamiento: 2,
        importadoEn: '2026-06-01T00:00:00.000Z',
      }),
    ])

    const indice = await crearAdapterAislamiento().obtenerIndice('CUE-1')

    expect(indice?.nivel).toBe(2)
    expect(indice?.versionJob).toBe('10')
  })

  it('carga batch: una sola llamada a la db resuelve N cueAnexos distintos', async () => {
    let llamadas = 0
    const adapter = crearAdapterAislamiento({
      cargarFilas: async () => {
        llamadas += 1
        return cargarFilasDb()
      },
    })

    await db.insert(tabla).values(
      Array.from({ length: 5 }, (_, i) => fila(`CUE-${i}`, { indiceAislamiento: 1 })),
    )

    const resultados = await Promise.all(
      ['CUE-0', 'CUE-1', 'CUE-2', 'CUE-3', 'CUE-4'].map((cue) => adapter.obtenerIndice(cue)),
    )

    expect(resultados.every((r) => r !== null)).toBe(true)
    // Un cue sin fila tampoco dispara otra query: se resuelve del Map cacheado.
    expect(await adapter.obtenerIndice('CUE-AUSENTE')).toBeNull()
    expect(llamadas).toBe(1)
  })

  it('si la carga falla (tabla inexistente) degrada a sin cobertura y nunca lanza', async () => {
    const adapter = crearAdapterAislamiento({
      cargarFilas: async () => {
        throw new Error('tabla inexistente')
      },
    })

    await expect(adapter.obtenerIndice('CUE-1')).resolves.toBeNull()
  })
})
