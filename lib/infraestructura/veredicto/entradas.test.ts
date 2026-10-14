// Tests de la composición de insumos del veredicto diario. `fechasVentana` es pura;
// `calcularDia` se prueba contra la base real aislada en un tmpdir (mismo patrón
// que rios.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { hidroLectura } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { calcularDia, fechasVentana } from './entradas'

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
