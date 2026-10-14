// Tests de la lectura de salud de las fuentes del veredicto. Se prueban contra la
// base real aislada en un tmpdir (mismo patrón que rios.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { hazardSourceHealth } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { leerSaludFuentes } from './salud-fuentes'

usarDbTemporal('veredicto-salud-fuentes')

const AHORA = new Date('2026-10-13T12:00:00.000Z')

async function sembrar(
  provider: string,
  fila: { estado: string; ultimoExitoEn: string | null; ttlMinutos: number },
): Promise<void> {
  await getDb()
    .insert(hazardSourceHealth)
    .values({
      provider,
      ultimoExitoEn: fila.ultimoExitoEn,
      ultimoIntentoEn: AHORA.toISOString(),
      estado: fila.estado,
      ultimoErrorSaneado: null,
      ttlMinutos: fila.ttlMinutos,
      licencia: 'prueba',
      actualizadaEn: AHORA.toISOString(),
    })
}

describe('leerSaludFuentes', () => {
  beforeEach(async () => {
    await getDb().delete(hazardSourceHealth)
  })

  it('sin registro la fuente no está disponible', async () => {
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.glofas).toEqual({ disponible: false, motivo: 'sin_registro', ultimoExitoEn: null })
  })

  it('estado no_disponible no está disponible aunque tenga un éxito reciente', async () => {
    await sembrar('smn-alertas', {
      estado: 'no_disponible',
      ultimoExitoEn: '2026-10-13T11:50:00.000Z',
      ttlMinutos: 60,
    })
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.smn).toEqual({
      disponible: false,
      motivo: 'no_disponible',
      ultimoExitoEn: '2026-10-13T11:50:00.000Z',
    })
  })

  it('sin ultimoExitoEn no está disponible', async () => {
    await sembrar('nasa-imerg', { estado: 'degradado', ultimoExitoEn: null, ttlMinutos: 60 })
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.imerg).toEqual({ disponible: false, motivo: 'no_disponible', ultimoExitoEn: null })
  })

  it('éxito dentro de ttl × tolerancia (2) está disponible', async () => {
    // imerg: ttl 60 → límite 120 min; el éxito hace 120 min exactos todavía vale.
    await sembrar('nasa-imerg', {
      estado: 'ok',
      ultimoExitoEn: '2026-10-13T10:00:00.000Z',
      ttlMinutos: 60,
    })
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.imerg).toEqual({
      disponible: true,
      motivo: 'ok',
      ultimoExitoEn: '2026-10-13T10:00:00.000Z',
    })
  })

  it('éxito más viejo que ttl × tolerancia está vencido', async () => {
    await sembrar('nasa-imerg', {
      estado: 'ok',
      ultimoExitoEn: '2026-10-13T09:59:00.000Z',
      ttlMinutos: 60,
    })
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.imerg.disponible).toBe(false)
    expect(salud.imerg.motivo).toBe('vencida')
  })

  it('degradado con éxito reciente cuenta como disponible', async () => {
    await sembrar('open-meteo-flood', {
      estado: 'degradado',
      ultimoExitoEn: '2026-10-13T06:00:00.000Z',
      ttlMinutos: 360,
    })
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.glofas.disponible).toBe(true)
    expect(salud.glofas.motivo).toBe('ok')
  })

  it('devuelve una entrada por cada fuente del veredicto con su proveedor', async () => {
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(Object.keys(salud).sort()).toEqual(['ensamble', 'glofas', 'imerg', 'prefectura', 'smn'])
  })
})
