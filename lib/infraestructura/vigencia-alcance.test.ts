import { describe, expect, it } from 'vitest'
import { claveServicioAlcance, resolverAlcanceVigente } from './vigencia-alcance'

interface Fila {
  id: string
  rigeDesde: string
  creadaEn: string
  retiradaEn: string | null
}

const REF = new Date('2026-09-18T12:00:00.000Z')

describe('resolverAlcanceVigente', () => {
  it('incluye una fila sin retiradaEn cuyo rigeDesde ya pasó', () => {
    const filas: Fila[] = [{ id: 'a', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: null }]
    expect(resolverAlcanceVigente(filas, { referencia: REF })).toEqual(filas)
  })

  it('excluye una fila con rigeDesde futuro respecto de la referencia', () => {
    const filas: Fila[] = [{ id: 'a', rigeDesde: '2026-10-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: null }]
    expect(resolverAlcanceVigente(filas, { referencia: REF })).toEqual([])
  })

  it('excluye una fila retirada antes o en la referencia', () => {
    const filas: Fila[] = [
      { id: 'a', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: '2026-09-10T00:00:00.000Z' },
    ]
    expect(resolverAlcanceVigente(filas, { referencia: REF })).toEqual([])
  })

  it('incluye una fila cuyo retiradaEn es posterior a la referencia', () => {
    const filas: Fila[] = [
      { id: 'a', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: '2026-09-20T00:00:00.000Z' },
    ]
    expect(resolverAlcanceVigente(filas, { referencia: REF })).toEqual(filas)
  })

  it('resuelve el reemplazo: la fila vieja sigue vigente hasta que empieza la nueva, aunque esa fecha sea futura', () => {
    const vieja: Fila = {
      id: 'vieja',
      rigeDesde: '2026-09-01T00:00:00.000Z',
      creadaEn: '2026-09-01T00:00:00.000Z',
      // Cerrada donde empieza la nueva, aunque esa fecha sea futura respecto de REF.
      retiradaEn: '2026-10-01T00:00:00.000Z',
    }
    const nueva: Fila = { id: 'nueva', rigeDesde: '2026-10-01T00:00:00.000Z', creadaEn: '2026-10-01T00:00:00.000Z', retiradaEn: null }
    const resultado = resolverAlcanceVigente([vieja, nueva], { referencia: REF })
    expect(resultado).toEqual([vieja])
  })

  it('array vacío da resultado vacío', () => {
    expect(resolverAlcanceVigente([], { referencia: REF })).toEqual([])
  })

  it('con clave de agrupación, conserva sólo la fila vigente más reciente por clave', () => {
    const filas: Fila[] = [
      { id: 'vieja', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: null },
      { id: 'mas-vieja', rigeDesde: '2026-08-01T00:00:00.000Z', creadaEn: '2026-08-01T00:00:00.000Z', retiradaEn: null },
    ]
    const resultado = resolverAlcanceVigente(filas, { referencia: REF, clave: () => 'misma-clave' })
    expect(resultado).toEqual([filas[0]])
  })

  it('usa Date.now() como referencia por defecto', () => {
    const futura: Fila = { id: 'futura', rigeDesde: '2999-01-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: null }
    expect(resolverAlcanceVigente([futura])).toEqual([])
  })
})

describe('claveServicioAlcance', () => {
  it('combina tipo y referenciaId', () => {
    expect(claveServicioAlcance({ tipo: 'seccion', referenciaId: '10' })).toBe('seccion:10')
  })

  it('usa string vacío cuando referenciaId es null (establecimiento)', () => {
    expect(claveServicioAlcance({ tipo: 'establecimiento', referenciaId: null })).toBe('establecimiento:')
  })
})
