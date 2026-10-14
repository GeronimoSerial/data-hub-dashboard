import { describe, expect, it } from 'vitest'
import { valorLluviaObservada, type ClimatologiaObservada } from './lluvia-observada'

const CLIMATOLOGIA: ClimatologiaObservada = { p90: 20, p95: 30, p99: 50, version: 'imerg-v1' }

describe('valorLluviaObservada', () => {
  it('usa umbral absoluto 72 h para Puerto Valle sin climatología', () => {
    const r = valorLluviaObservada(31.9, 72, null)
    expect(r.valor).toBe(13.2)
    expect(r.metodo).toBe('umbral_absoluto')
    expect(r.referencia).toContain('80/120/180 mm')
    expect(r.referencia).toContain('sin climatología de la celda')
  })

  it('mapea exactamente los umbrales 72 h a 33, 66 y 100', () => {
    expect(valorLluviaObservada(80, 72, null).valor).toBe(33)
    expect(valorLluviaObservada(120, 72, null).valor).toBe(66)
    expect(valorLluviaObservada(180, 72, null).valor).toBe(100)
  })

  it('interpola 24 h con umbrales absolutos', () => {
    const r = valorLluviaObservada(65, 24, null)
    expect(r.valor).toBe(49.5)
    expect(r.metodo).toBe('umbral_absoluto')
  })

  it('usa climatología P90/P95/P99 cuando es válida', () => {
    const r = valorLluviaObservada(31.9, 72, CLIMATOLOGIA)
    expect(r.valor).toBe(69.2)
    expect(r.metodo).toBe('climatologia')
    expect(r.referencia).toBe('climatologia imerg-v1 P90/P95/P99 = 20/30/50 mm')
  })

  it('cae a umbrales absolutos cuando la climatología no es estrictamente creciente', () => {
    const invalida: ClimatologiaObservada = { p90: 30, p95: 30, p99: 50, version: 'imerg-v1' }
    const r = valorLluviaObservada(80, 72, invalida)
    expect(r.metodo).toBe('umbral_absoluto')
    expect(r.valor).toBe(33)
  })

  it('cae a umbrales absolutos cuando p90 no es positivo', () => {
    const cero: ClimatologiaObservada = { p90: 0, p95: 10, p99: 20, version: 'imerg-v1' }
    expect(valorLluviaObservada(31.9, 72, cero).metodo).toBe('umbral_absoluto')
  })

  it('devuelve 0 para lluvia nula o negativa', () => {
    expect(valorLluviaObservada(0, 72, null).valor).toBe(0)
    expect(valorLluviaObservada(-5, 24, CLIMATOLOGIA).valor).toBe(0)
  })
})
