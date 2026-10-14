// Tests de la composición de insumos del veredicto diario. `fechasVentana` es pura;
// `calcularDia` se prueba contra la base real aislada en un tmpdir (mismo patrón
// que rios.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { hazardObservation, hidroLectura } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { calcularDia, fechasVentana, finUltimoGranulo } from './entradas'
import type { SaludFuentes } from './salud-fuentes'

usarDbTemporal('veredicto-entradas')

describe('fechasVentana', () => {
  it('devuelve 11 días: 7 observados, hoy y 3 de pronóstico, en orden ascendente', () => {
    const ventana = fechasVentana(new Date('2026-10-13T15:00:00.000Z'))
    expect(ventana).toHaveLength(11)
    // 2026-10-13T15:00Z es 12:00 ART del 13: hoy = 2026-10-13.
    expect(ventana[0]).toEqual({ fecha: '2026-10-06', tipoDia: 'observado' })
    expect(ventana[6]).toEqual({ fecha: '2026-10-12', tipoDia: 'observado' })
    expect(ventana[7]).toEqual({ fecha: '2026-10-13', tipoDia: 'hoy' })
    expect(ventana[8]).toEqual({ fecha: '2026-10-14', tipoDia: 'pronostico' })
    expect(ventana[10]).toEqual({ fecha: '2026-10-16', tipoDia: 'pronostico' })
  })

  it('usa el día civil ART: 2026-10-13T02:30Z todavía es 2026-10-12', () => {
    const ventana = fechasVentana(new Date('2026-10-13T02:30:00.000Z'))
    expect(ventana.find((d) => d.tipoDia === 'hoy')?.fecha).toBe('2026-10-12')
  })
})

describe('calcularDia', () => {
  beforeEach(async () => {
    await getDb().delete(hidroLectura)
  })

  it('sin datos devuelve sólo la provincia con nivel sin_dato', async () => {
    const items = await calcularDia(getDb(), { fecha: '2026-10-12', tipoDia: 'hoy' })
    expect(items.map((i) => i.ambito)).toEqual(['provincia'])
    expect(items[0]?.nivel).toBe('sin_dato')
    expect(items[0]?.conSenal).toBe(false)
    expect(items[0]?.inputsHash).toMatch(/^[0-9a-f]+$/)
  })

  it('una lectura de Prefectura en evacuación en Corrientes capital da severo y el departamento', async () => {
    await getDb()
      .insert(hidroLectura)
      .values({
        id: 'pna-corrientes-2026-10-12T12:00:00.000Z',
        estacionId: 'pna-corrientes',
        fuente: 'prefectura',
        lecturaM: 6.5,
        variacionM: null,
        periodoHoras: null,
        medidaEn: '2026-10-12T12:00:00.000Z',
        estadoPublicado: 'evacuacion',
        lecturaAnteriorM: null,
        medidaAnteriorEn: null,
        alertaM: 5,
        evacuacionM: 6,
        inconsistente: false,
        motivosInconsistencia: [],
        hashOriginal: 'hash-prueba-evacuacion',
        catalogoVersion: 'estaciones-prefectura-v2',
        capturadaEn: '2026-10-13T00:00:00.000Z',
      })

    const items = await calcularDia(getDb(), { fecha: '2026-10-12', tipoDia: 'hoy' })
    const provincia = items.find((i) => i.ambito === 'provincia')
    const capital = items.find((i) => i.ambito === 'departamento:CAPITAL')
    expect(provincia?.nivel).toBe('severo')
    expect(provincia?.conSenal).toBe(true)
    expect(capital?.nivel).toBe('severo')
    expect(capital?.metricas.length).toBeGreaterThan(0)
  })
})

describe('calcularDia con salud de fuentes', () => {
  const todoDisponible = (): SaludFuentes => ({
    imerg: { disponible: true, motivo: 'ok', ultimoExitoEn: null, ultimoDato: null },
    prefectura: { disponible: true, motivo: 'ok', ultimoExitoEn: null, ultimoDato: null },
    smn: { disponible: true, motivo: 'ok', ultimoExitoEn: null, ultimoDato: null },
    glofas: { disponible: true, motivo: 'ok', ultimoExitoEn: null, ultimoDato: null },
    ensamble: { disponible: true, motivo: 'ok', ultimoExitoEn: null, ultimoDato: null },
    ecmwf: { disponible: true, motivo: 'ok', ultimoExitoEn: null, ultimoDato: null },
  })

  beforeEach(async () => {
    await getDb().delete(hidroLectura)
  })

  it('SMN no disponible: aparece en fuentesAusentes y un día sólo con SMN queda sin_dato', async () => {
    const salud = todoDisponible()
    salud.smn = { disponible: false, motivo: 'no_disponible', ultimoExitoEn: null, ultimoDato: null }
    const items = await calcularDia(getDb(), { fecha: '2026-10-14', tipoDia: 'pronostico' }, salud)
    const provincia = items.find((i) => i.ambito === 'provincia')
    expect(provincia?.fuentesAusentes).toContain('smn')
    expect(provincia?.nivel).toBe('sin_dato')
    expect(provincia?.cobertura.saludFuentes?.smn).toBe('no_disponible')
  })

  it('SMN disponible sin avisos no cuenta como ausente', async () => {
    const items = await calcularDia(getDb(), { fecha: '2026-10-14', tipoDia: 'pronostico' }, todoDisponible())
    const provincia = items.find((i) => i.ambito === 'provincia')
    expect(provincia?.fuentesAusentes).not.toContain('smn')
  })

  it('GloFAS vencido en un día de pronóstico queda ausente y no se lee', async () => {
    const salud = todoDisponible()
    salud.glofas = { disponible: false, motivo: 'vencida', ultimoExitoEn: '2026-10-01T00:00:00.000Z', ultimoDato: null }
    const items = await calcularDia(getDb(), { fecha: '2026-10-14', tipoDia: 'pronostico' }, salud)
    const provincia = items.find((i) => i.ambito === 'provincia')
    expect(provincia?.fuentesAusentes).toContain('glofas')
    expect(provincia?.cobertura.saludFuentes?.glofas).toBe('vencida')
  })

  it('IMERG no disponible no afecta un día observado (sólo aplica a hoy)', async () => {
    const salud = todoDisponible()
    salud.imerg = { disponible: false, motivo: 'vencida', ultimoExitoEn: null, ultimoDato: null }
    const conSalud = await calcularDia(getDb(), { fecha: '2026-10-12', tipoDia: 'observado' }, salud)
    const sinSalud = await calcularDia(getDb(), { fecha: '2026-10-12', tipoDia: 'observado' })
    expect(conSalud.find((i) => i.ambito === 'provincia')?.fuentesAusentes).toEqual(
      sinSalud.find((i) => i.ambito === 'provincia')?.fuentesAusentes,
    )
  })

  it('IMERG no disponible en hoy queda ausente', async () => {
    const salud = todoDisponible()
    salud.imerg = { disponible: false, motivo: 'vencida', ultimoExitoEn: null, ultimoDato: null }
    const items = await calcularDia(getDb(), { fecha: '2026-10-13', tipoDia: 'hoy' }, salud)
    const provincia = items.find((i) => i.ambito === 'provincia')
    expect(provincia?.fuentesAusentes).toContain('imerg')
  })
})

describe('calcularDia hoy con lluvia IMERG parcial', () => {
  const CELDA_CAPITAL = '-27.5_-58.8'

  beforeEach(async () => {
    await getDb().delete(hazardObservation)
  })

  it('cuenta la cobertura hasta el último gránulo y expone imergHasta', async () => {
    // Día ART 2026-10-13 empieza 03:00Z; los gránulos llegan hasta 20:30Z (fin 21:00Z).
    const inicio = Date.parse('2026-10-13T03:00:00.000Z')
    const filas = Array.from({ length: 36 }, (_, i) => {
      const desde = new Date(inicio + i * 30 * 60_000).toISOString()
      const hasta = new Date(inicio + (i + 1) * 30 * 60_000).toISOString()
      return {
        id: `imerg-hoy-${desde}`,
        provider: 'nasa-imerg',
        variable: 'precipitacion_observada_satelital',
        geometryRef: CELDA_CAPITAL,
        valor: 1,
        unidad: 'mm/30min',
        observadoEn: desde,
        validoDesde: desde,
        validoHasta: hasta,
        ingeridoEn: desde,
      }
    })
    await getDb().insert(hazardObservation).values(filas)

    const items = await calcularDia(getDb(), { fecha: '2026-10-13', tipoDia: 'hoy' })
    const provincia = items.find((i) => i.ambito === 'provincia')
    expect(provincia?.cobertura.imerg24).toBeGreaterThanOrEqual(0.8)
    expect(provincia?.cobertura.imergHasta).toBe('2026-10-13T21:00:00.000Z')
    expect(provincia?.metricas.length).toBeGreaterThan(0)
  })

  it('sin gránulos del día la lluvia de hoy queda ausente y no hay imergHasta', async () => {
    const items = await calcularDia(getDb(), { fecha: '2026-10-13', tipoDia: 'hoy' })
    const provincia = items.find((i) => i.ambito === 'provincia')
    expect(provincia?.cobertura.imerg24).toBeNull()
    expect(provincia?.cobertura.imergHasta).toBeNull()
  })
})

describe('finUltimoGranulo', () => {
  it('soporta un volumen real de gránulos sin desbordar la pila', () => {
    const granulos = Array.from({ length: 200_000 }, (_, i) => ({
      geometryRef: `c${i % 500}`,
      validoDesde: new Date(Date.UTC(2026, 9, 13, 3) + (i % 36) * 30 * 60 * 1000).toISOString(),
      valor: 0,
    }))
    expect(finUltimoGranulo(granulos)).toBe('2026-10-13T21:00:00.000Z')
  })
})
