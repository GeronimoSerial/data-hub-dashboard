// Tests de la lectura de salud de las fuentes del veredicto. Se prueban contra la
// base real aislada en un tmpdir (mismo patrón que rios.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import {
  hazardEnsembleProb,
  hazardForecast,
  hazardObservation,
  hazardSourceHealth,
  hidroLectura,
} from '@/lib/db/schema'
import { PROVIDER_OBSERVADO, VARIABLE_OBSERVADA } from '@/lib/infraestructura/riesgo/peligro/observado'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { leerSaludFuentes } from './salud-fuentes'

usarDbTemporal('veredicto-salud-fuentes')

const AHORA = new Date('2026-10-13T12:00:00.000Z')

async function sembrar(
  provider: string,
  fila: { estado: string; ultimoExitoEn: string | null; ttlMinutos?: number },
): Promise<void> {
  await getDb()
    .insert(hazardSourceHealth)
    .values({
      provider,
      ultimoExitoEn: fila.ultimoExitoEn,
      ultimoIntentoEn: AHORA.toISOString(),
      estado: fila.estado,
      ultimoErrorSaneado: null,
      ttlMinutos: fila.ttlMinutos ?? 60,
      licencia: 'prueba',
      actualizadaEn: AHORA.toISOString(),
    })
}

async function sembrarObservacionImerg(validoHasta: string): Promise<void> {
  await getDb()
    .insert(hazardObservation)
    .values({
      id: `obs-${validoHasta}`,
      provider: PROVIDER_OBSERVADO,
      variable: VARIABLE_OBSERVADA,
      geometryRef: 'cuenca-test',
      valor: 1,
      unidad: 'mm',
      observadoEn: validoHasta,
      validoDesde: validoHasta,
      validoHasta,
      ingeridoEn: validoHasta,
    })
}

async function sembrarCaudal(corridaEn: string): Promise<void> {
  await getDb()
    .insert(hazardForecast)
    .values({
      id: `caudal-${corridaEn}`,
      provider: 'open-meteo-flood',
      variable: 'caudal',
      geometryRef: 'rio-test',
      corridaEn,
      validoEn: corridaEn,
      horizonteHoras: 24,
      valor: 10,
      unidad: 'm3/s',
      pasoHoras: 1,
      ingeridoEn: corridaEn,
    })
}

async function sembrarEnsamble(corridaEn: string): Promise<void> {
  await getDb()
    .insert(hazardEnsembleProb)
    .values({
      id: `ensamble-${corridaEn}`,
      geometryRef: 'rio-test',
      variable: 'caudal',
      corridaEn,
      validoEn: corridaEn,
      horizonteHoras: 24,
      miembrosTotal: 50,
      miembrosValidos: 50,
      probabilidadP95: 0.1,
      probabilidadP99: 0.05,
      dispersion: 0.2,
      version: 'test',
      ingeridoEn: corridaEn,
    })
}

async function sembrarLectura(medidaEn: string): Promise<void> {
  await getDb()
    .insert(hidroLectura)
    .values({
      id: `lectura-${medidaEn}`,
      estacionId: 'estacion-test',
      medidaEn,
      estadoPublicado: 'normal',
      motivosInconsistencia: [],
      hashOriginal: `hash-${medidaEn}`,
      catalogoVersion: 'test',
      capturadaEn: medidaEn,
    })
}

describe('leerSaludFuentes', () => {
  beforeEach(async () => {
    await getDb().delete(hazardSourceHealth)
    await getDb().delete(hazardObservation)
    await getDb().delete(hazardForecast)
    await getDb().delete(hazardEnsembleProb)
    await getDb().delete(hidroLectura)
  })

  it('sin registro ni datos la fuente no está disponible', async () => {
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.glofas).toEqual({
      disponible: false,
      motivo: 'sin_registro',
      ultimoExitoEn: null,
      ultimoDato: null,
    })
  })

  it('estado no_disponible no está disponible aunque tenga un éxito reciente', async () => {
    await sembrar('smn-alertas', {
      estado: 'no_disponible',
      ultimoExitoEn: '2026-10-13T11:50:00.000Z',
    })
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.smn).toEqual({
      disponible: false,
      motivo: 'no_disponible',
      ultimoExitoEn: '2026-10-13T11:50:00.000Z',
      ultimoDato: null,
    })
  })

  it('sin ultimoExitoEn no está disponible', async () => {
    await sembrar('nasa-imerg', { estado: 'degradado', ultimoExitoEn: null })
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.imerg).toEqual({
      disponible: false,
      motivo: 'no_disponible',
      ultimoExitoEn: null,
      ultimoDato: null,
    })
  })

  it('imerg: éxito dentro de la tolerancia de 12 h está disponible', async () => {
    await sembrar('nasa-imerg', { estado: 'ok', ultimoExitoEn: '2026-10-13T00:00:00.000Z' })
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.imerg).toEqual({
      disponible: true,
      motivo: 'ok',
      ultimoExitoEn: '2026-10-13T00:00:00.000Z',
      ultimoDato: null,
    })
  })

  it('smn: salud de 3 h está disponible y de 7 h no (tolerancia 6 h)', async () => {
    await sembrar('smn-alertas', { estado: 'ok', ultimoExitoEn: '2026-10-13T09:00:00.000Z' })
    expect((await leerSaludFuentes(getDb(), AHORA)).smn.disponible).toBe(true)

    await getDb().delete(hazardSourceHealth)
    await sembrar('smn-alertas', { estado: 'ok', ultimoExitoEn: '2026-10-13T05:00:00.000Z' })
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.smn.disponible).toBe(false)
    expect(salud.smn.motivo).toBe('vencida')
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

  it('health ausente pero datos frescos: la fuente está disponible', async () => {
    await sembrarCaudal('2026-10-13T00:00:00.000Z')
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.glofas).toEqual({
      disponible: true,
      motivo: 'ok',
      ultimoExitoEn: null,
      ultimoDato: '2026-10-13T00:00:00.000Z',
    })
  })

  it('ensamble con datos frescos y sin health está disponible', async () => {
    await sembrarEnsamble('2026-10-13T00:00:00.000Z')
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.ensamble.disponible).toBe(true)
    expect(salud.ensamble.ultimoDato).toBe('2026-10-13T00:00:00.000Z')
  })

  it('health vencida pero datos frescos: la fuente está disponible', async () => {
    await sembrar('nasa-imerg', { estado: 'ok', ultimoExitoEn: '2026-10-12T23:00:00.000Z' })
    await sembrarObservacionImerg('2026-10-13T10:00:00.000Z')
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.imerg.disponible).toBe(true)
    expect(salud.imerg.motivo).toBe('ok')
    expect(salud.imerg.ultimoDato).toBe('2026-10-13T10:00:00.000Z')
  })

  it('health y datos vencidos: la fuente está vencida', async () => {
    await sembrar('nasa-imerg', { estado: 'ok', ultimoExitoEn: '2026-10-12T23:00:00.000Z' })
    await sembrarObservacionImerg('2026-10-12T20:00:00.000Z')
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.imerg).toEqual({
      disponible: false,
      motivo: 'vencida',
      ultimoExitoEn: '2026-10-12T23:00:00.000Z',
      ultimoDato: '2026-10-12T20:00:00.000Z',
    })
  })

  it('prefectura: el dato más reciente de hidro_lectura cuenta dentro de 36 h', async () => {
    await sembrarLectura('2026-10-12T05:00:00.000Z')
    await sembrarLectura('2026-10-12T20:00:00.000Z')
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.prefectura.disponible).toBe(true)
    expect(salud.prefectura.ultimoDato).toBe('2026-10-12T20:00:00.000Z')
  })

  it('smn no usa datos como respaldo: sin health queda sin_registro', async () => {
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(salud.smn).toEqual({
      disponible: false,
      motivo: 'sin_registro',
      ultimoExitoEn: null,
      ultimoDato: null,
    })
  })

  it('devuelve una entrada por cada fuente del veredicto con su proveedor', async () => {
    const salud = await leerSaludFuentes(getDb(), AHORA)
    expect(Object.keys(salud).sort()).toEqual(['ensamble', 'glofas', 'imerg', 'prefectura', 'smn'])
  })
})
