import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardObservation, hidroLectura, infraDataset, infraDatasetPublicacion, infraDatasetVersion } from '@/lib/db/schema'
import { obtenerEstacionesPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { obtenerEstadoDatos } from './consulta'

// seed: false; migrations are applied explicitly in beforeAll.
usarDbTemporal('estado-datos-consulta-', { seed: false })

const estacion = obtenerEstacionesPrefectura()[0]!

// Lecturas horarias: la de índice 0 es la más antigua y la de índice 12 la más reciente.
function lectura(indice: number, lecturaM: number) {
  return {
    id: `lect-${estacion.estacionId}-${indice}`,
    estacionId: estacion.estacionId,
    fuente: 'prefectura',
    lecturaM,
    medidaEn: new Date(Date.UTC(2026, 9, 17, indice)).toISOString(),
    estadoPublicado: 'publicado',
    motivosInconsistencia: [],
    hashOriginal: `hash-${indice}`,
    catalogoVersion: 'test',
    capturadaEn: '2026-10-17T20:00:00.000Z',
  }
}

const itemPlausibilidad = (estado: Awaited<ReturnType<typeof obtenerEstadoDatos>>) =>
  estado.items.find((item) => item.id === 'dato:plausibilidad')

const itemHuecosImerg = (estado: Awaited<ReturnType<typeof obtenerEstadoDatos>>) =>
  estado.items.find((item) => item.id === 'dato:imerg-huecos')

// Granulos IMERG (una celda) en el día 12/11/2026 (Buenos Aires = UTC-3).
const AHORA_DIA = new Date('2026-11-12T20:00:00.000Z')
function granulo(iso: string) {
  return {
    id: `imerg-${iso}`,
    provider: 'nasa-imerg',
    variable: 'precipitacion_observada_satelital',
    geometryRef: 'celda-test',
    valor: 0.5,
    unidad: 'mm/h',
    observadoEn: iso,
    validoDesde: iso,
    validoHasta: iso,
    calidad: null,
    rawRef: null,
    ingeridoEn: AHORA_DIA.toISOString(),
  }
}
function cadaMediaHora(desde: string, hasta: string): string[] {
  const salida: string[] = []
  for (let ms = Date.parse(desde); ms <= Date.parse(hasta); ms += 30 * 60_000) salida.push(new Date(ms).toISOString())
  return salida
}

describe('obtenerEstadoDatos: plausibilidad de lecturas (I4)', () => {
  beforeAll(async () => {
    await migrarDb()
  })

  beforeEach(async () => {
    await getDb().delete(hidroLectura)
  })

  it('sin_datos con "Posible sensor trabado" cuando las 12 lecturas más recientes son idénticas', async () => {
    const filas = [lectura(0, 1.9), ...Array.from({ length: 12 }, (_, i) => lectura(i + 1, 2.31))]
    await getDb().insert(hidroLectura).values(filas)

    const item = itemPlausibilidad(await obtenerEstadoDatos())

    expect(item?.estado).toBe('sin_datos')
    expect(item?.motivo).toContain('Posible sensor trabado en')
    expect(item?.motivo).toContain(estacion.nombrePna)
  })

  it('ok con lecturas que varían: control sano sin aviso', async () => {
    const valores = [2.4, 2.1, 2.3, 2.0, 1.9, 2.2, 2.5, 2.4, 2.3, 2.1, 2.0, 1.8, 1.7]
    await getDb().insert(hidroLectura).values(valores.map((valor, i) => lectura(i, valor)))

    const item = itemPlausibilidad(await obtenerEstadoDatos())

    expect(item?.estado).toBe('ok')
    expect(item?.motivo).not.toContain('sensor trabado')
  })
})

describe('obtenerEstadoDatos: huecos en la serie IMERG del día (I5)', () => {
  beforeAll(async () => {
    await migrarDb()
  })

  beforeEach(async () => {
    await getDb().delete(hazardObservation)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA_DIA)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('atrasado con motivo de hueco cuando hay 3 h sin gránulos hoy', async () => {
    const isos = [
      ...cadaMediaHora('2026-11-12T03:00:00.000Z', '2026-11-12T12:00:00.000Z'),
      ...cadaMediaHora('2026-11-12T15:00:00.000Z', '2026-11-12T16:30:00.000Z'),
    ]
    await getDb().insert(hazardObservation).values(isos.map(granulo))

    const item = itemHuecosImerg(await obtenerEstadoDatos())

    expect(item?.estado).toBe('atrasado')
    expect(item?.motivo).toBe('Huecos en la serie IMERG de hoy: 3 h sin gránulos entre 09:00 y 12:00.')
  })

  it('ok sin aviso de huecos con serie continua cada 30 min (control sano)', async () => {
    await getDb().insert(hazardObservation).values(cadaMediaHora('2026-11-12T03:00:00.000Z', '2026-11-12T16:30:00.000Z').map(granulo))

    const item = itemHuecosImerg(await obtenerEstadoDatos())

    expect(item?.estado).toBe('ok')
    expect(item?.motivo).toBe('Serie IMERG de hoy sin huecos.')
  })

  it('sin aviso de huecos cuando no hay gránulos hoy (lo cubre la frescura)', async () => {
    const estado = await obtenerEstadoDatos()
    expect(itemHuecosImerg(estado)).toBeUndefined()
    expect(estado.items.find((item) => item.id === 'dato:imerg')?.estado).toBe('sin_datos')
  })
})

describe('obtenerEstadoDatos: vigencia de datasets publicados (I11)', () => {
  const AHORA_DATASETS = new Date('2026-11-12T20:00:00.000Z')
  const hace = (dias: number) => new Date(AHORA_DATASETS.getTime() - dias * 86_400_000).toISOString()
  const itemDataset = (estado: Awaited<ReturnType<typeof obtenerEstadoDatos>>) =>
    estado.items.find((item) => item.id === 'dataset:departamentos')

  // Las versiones son inmutables (trigger): cada publicación de prueba usa su propia versión.
  async function publicarDataset(dias: number) {
    const db = getDb()
    const versionId = `departamentos-hace-${dias}`
    await db.insert(infraDataset).values({ id: 'departamentos', nombre: 'Departamentos de Corrientes' }).onConflictDoNothing()
    await db.insert(infraDatasetVersion).values({
      id: versionId, datasetId: 'departamentos', revision: versionId, checksum: 'checksum-test', fuente: 'test',
      formato: 'features', estructura: {}, metadatos: {}, filas: 0,
    })
    await db.delete(infraDatasetPublicacion)
    await db.insert(infraDatasetPublicacion).values({ datasetId: 'departamentos', versionId, publicadaEn: new Date(hace(dias)) })
  }

  beforeAll(async () => {
    await migrarDb()
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA_DATASETS)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('atrasado con motivo de antigüedad cuando el dataset supera su vigencia', async () => {
    await publicarDataset(800)

    const item = itemDataset(await obtenerEstadoDatos())

    expect(item?.estado).toBe('atrasado')
    expect(item?.motivo).toBe('Publicado hace 800 días (vigencia esperada: 730 días).')
  })

  it('ok con el texto de siempre cuando el dataset está dentro de su vigencia (control sano)', async () => {
    await publicarDataset(10)

    const item = itemDataset(await obtenerEstadoDatos())

    expect(item?.estado).toBe('ok')
    expect(item?.motivo).toBe('Dato estático publicado; se actualiza por importación.')
  })
})
