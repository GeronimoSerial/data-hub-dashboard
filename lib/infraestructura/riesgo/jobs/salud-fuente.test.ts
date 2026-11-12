import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardSourceHealth } from '@/lib/db/schema'
import { actualizarSaludFuente } from './salud-fuente'

usarDbTemporal('salud-fuente-')

const PROVIDER = 'fuente-de-prueba'
const AHORA = '2026-10-13T12:00:00.000Z'

const base = {
  provider: PROVIDER,
  ttlMinutos: 60,
  licencia: 'test',
  ahoraIso: AHORA,
  reintentarSiBloqueado: false,
}

async function saludDePrueba() {
  const filas = await getDb()
    .select()
    .from(hazardSourceHealth)
    .where(eq(hazardSourceHealth.provider, PROVIDER))
  return filas[0]
}

describe('actualizarSaludFuente: ok exige filas recibidas', () => {
  beforeEach(async () => {
    await getDb().delete(hazardSourceHealth).where(eq(hazardSourceHealth.provider, PROVIDER))
  })

  it('ok con 0 filas recibidas se guarda como degradado y no registra un éxito', async () => {
    await actualizarSaludFuente(getDb(), {
      ...base,
      estado: 'ok',
      ultimoErrorSaneado: null,
      filasRecibidas: 0,
    })

    const salud = await saludDePrueba()
    expect(salud?.estado).toBe('degradado')
    expect(salud?.ultimoExitoEn).toBeNull()
    expect(salud?.ultimoErrorSaneado).toBe('no rows received from source')
  })

  it('ok con filas recibidas mayores que cero queda ok y registra el éxito', async () => {
    await actualizarSaludFuente(getDb(), {
      ...base,
      estado: 'ok',
      ultimoErrorSaneado: null,
      filasRecibidas: 3,
    })

    const salud = await saludDePrueba()
    expect(salud?.estado).toBe('ok')
    expect(salud?.ultimoExitoEn).toBe(AHORA)
    expect(salud?.ultimoErrorSaneado).toBeNull()
  })

  it('ok con 0 filas recibidas pero señal de ya sincronizado queda ok', async () => {
    await actualizarSaludFuente(getDb(), {
      ...base,
      estado: 'ok',
      ultimoErrorSaneado: null,
      filasRecibidas: 0,
      yaSincronizado: true,
    })

    const salud = await saludDePrueba()
    expect(salud?.estado).toBe('ok')
    expect(salud?.ultimoExitoEn).toBe(AHORA)
  })

  it('ok sin conteo informado conserva el comportamiento previo (queda ok)', async () => {
    await actualizarSaludFuente(getDb(), {
      ...base,
      estado: 'ok',
      ultimoErrorSaneado: null,
    })

    const salud = await saludDePrueba()
    expect(salud?.estado).toBe('ok')
  })

  it('degradado con 0 filas recibidas conserva su error original', async () => {
    await actualizarSaludFuente(getDb(), {
      ...base,
      estado: 'degradado',
      ultimoErrorSaneado: 'timeout del proveedor',
      filasRecibidas: 0,
    })

    const salud = await saludDePrueba()
    expect(salud?.estado).toBe('degradado')
    expect(salud?.ultimoErrorSaneado).toBe('timeout del proveedor')
  })
})
