import { describe, expect, it } from 'vitest'
import { compararRelevancia, situacionPrincipal, type SituacionRelevancia } from './relevancia'

const s = (o: Partial<SituacionRelevancia>): SituacionRelevancia => ({
  severidad: 'Media', estadoEstablecimiento: 'habitual',
  rigeDesde: '2026-10-01T10:00:00.000Z', creadaEn: '2026-10-01T10:00:00.000Z', ...o,
})

describe('compararRelevancia', () => {
  it('ordena primero por gravedad', () => {
    expect([s({ severidad: 'Media' }), s({ severidad: 'Crítica' })].sort(compararRelevancia)[0].severidad).toBe('Crítica')
  })
  it('a igual gravedad, pesa el estado del edificio', () => {
    const orden = [s({ estadoEstablecimiento: 'parcial' }), s({ estadoEstablecimiento: 'evacuado' }), s({ estadoEstablecimiento: 'centro_evacuados' })]
      .sort(compararRelevancia).map((x) => x.estadoEstablecimiento)
    expect(orden).toEqual(['evacuado', 'centro_evacuados', 'parcial'])
  })
  it('a igual en todo, la más reciente primero, y desempata por creadaEn', () => {
    const vieja = s({ rigeDesde: '2026-09-30T10:00:00.000Z' })
    const nueva = s({ rigeDesde: '2026-10-02T10:00:00.000Z' })
    expect([vieja, nueva].sort(compararRelevancia)[0]).toBe(nueva)
    const a = s({ creadaEn: '2026-10-01T10:00:00.000Z' })
    const b = s({ creadaEn: '2026-10-01T11:00:00.000Z' })
    expect([a, b].sort(compararRelevancia)[0]).toBe(b)
  })
  it('situacionPrincipal devuelve null sin situaciones', () => {
    expect(situacionPrincipal([])).toBeNull()
  })
})
