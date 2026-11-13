import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { infraJobRun } from '@/lib/db/schema'
import { obtenerEstadoDatos } from './consulta'

// seed: false; migrations are applied explicitly in beforeAll.
usarDbTemporal('estado-datos-sonda-sin-testigos-', { seed: false })

const AHORA = new Date('2026-11-12T20:00:00.000Z')
const MOTIVO_SIN_TESTIGOS = 'Sin testigos configurados para esta región: la cadena de datos no se verificó.'

const itemSonda = (estado: Awaited<ReturnType<typeof obtenerEstadoDatos>>) =>
  estado.items.find((item) => item.id === 'sonda:cadena')

async function registrarCorridaSonda(contadores: Record<string, number>) {
  await getDb().insert(infraJobRun).values({
    id: 'sonda-cadena-datos-prueba',
    tipo: 'sonda-cadena-datos',
    claveIdempotente: 'sonda-cadena-datos-prueba',
    intento: 1,
    iniciadoEn: AHORA.toISOString(),
    finalizadoEn: AHORA.toISOString(),
    estado: 'completado',
    contadores,
    errorSaneado: null,
    version: 'test',
    leaseOwner: null,
    leaseExpiraEn: null,
    creadaEn: AHORA.toISOString(),
    actualizadaEn: AHORA.toISOString(),
  })
}

describe('obtenerEstadoDatos: sonda sin testigos configurados', () => {
  beforeAll(async () => {
    await migrarDb()
  })

  beforeEach(async () => {
    await getDb().delete(infraJobRun)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await getDb().delete(infraJobRun)
  })

  it('sin_datos con el motivo de testigos cuando la última corrida tiene sinTestigos', async () => {
    await registrarCorridaSonda({ sinTestigos: 1 })

    const item = itemSonda(await obtenerEstadoDatos())

    expect(item?.estado).toBe('sin_datos')
    expect(item?.motivo).toBe(MOTIVO_SIN_TESTIGOS)
  })

  it('Corrientes: sin corridas de la sonda el item no se muestra en el Centro', async () => {
    const estado = await obtenerEstadoDatos()

    expect(itemSonda(estado)).toBeUndefined()
  })
})
