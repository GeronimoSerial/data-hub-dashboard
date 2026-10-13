import { describe, expect, it } from 'vitest'

import type { CasoReferencia } from './conjunto-referencia'
import {
  calcularCobertura,
  calcularDemoras,
  calcularDuplicados,
  calcularPrecision,
  type EventoSistema,
} from './metricas'

const caso = (overrides: Partial<CasoReferencia>): CasoReferencia => ({
  id: 'EV-TEST-001',
  clase: 'positivo',
  inicio: null,
  primeraPublicacion: null,
  territorio: 'Localidad de prueba',
  nivelTerritorial: 'localidad',
  confianza: 'alta',
  descripcion: 'Caso sintético',
  ...overrides,
})

const evento = (overrides: Partial<EventoSistema>): EventoSistema => ({
  casoId: null,
  publicadoEn: '2026-10-10T12:00:00.000Z',
  respaldado: true,
  nivelTerritorial: 'localidad',
  ...overrides,
})

const conjunto: CasoReferencia[] = [
  caso({ id: 'A', inicio: '2026-10-10T00:00:00.000Z', primeraPublicacion: '2026-10-10T06:00:00.000Z' }),
  caso({ id: 'B', inicio: null, primeraPublicacion: '2026-10-11T00:00:00.000Z' }),
  caso({ id: 'C', inicio: null, primeraPublicacion: null }),
  caso({ id: 'N', clase: 'negativo' }),
]

describe('calcularCobertura', () => {
  it('es 0 cuando el sistema no tiene eventos', () => {
    expect(calcularCobertura(conjunto, [])).toBe(0)
  })

  it('cuenta positivos presentes sobre positivos del conjunto, sin contar negativos', () => {
    const eventos = [evento({ casoId: 'A' }), evento({ casoId: 'N' })]
    expect(calcularCobertura(conjunto, eventos)).toBeCloseTo(1 / 3)
  })

  it('no cuenta dos veces un positivo con varios eventos', () => {
    const eventos = [evento({ casoId: 'A' }), evento({ casoId: 'A' })]
    expect(calcularCobertura(conjunto, eventos)).toBeCloseTo(1 / 3)
  })
})

describe('calcularPrecision', () => {
  it('es null cuando no hay eventos publicados', () => {
    expect(calcularPrecision([])).toBeNull()
  })

  it('es la proporción de eventos respaldados sobre publicados', () => {
    const eventos = [evento({ respaldado: true }), evento({ respaldado: false }), evento({})]
    expect(calcularPrecision(eventos)).toBeCloseTo(2 / 3)
  })
})

describe('calcularDemoras', () => {
  it('no reporta positivos que el sistema no tiene', () => {
    expect(calcularDemoras(conjunto, [])).toEqual([])
  })

  it('calcula en horas la demora desde inicio y desde primera publicación', () => {
    const eventos = [evento({ casoId: 'A', publicadoEn: '2026-10-10T09:00:00.000Z' })]

    expect(calcularDemoras(conjunto, eventos)).toEqual([
      { casoId: 'A', desdeInicioHoras: 9, desdePrimeraPublicacionHoras: 3 },
    ])
  })

  it('usa la primera publicación del sistema cuando hay varios eventos del mismo caso', () => {
    const eventos = [
      evento({ casoId: 'A', publicadoEn: '2026-10-10T12:00:00.000Z' }),
      evento({ casoId: 'A', publicadoEn: '2026-10-10T09:00:00.000Z' }),
    ]

    expect(calcularDemoras(conjunto, eventos)[0]?.desdeInicioHoras).toBe(9)
  })

  it('devuelve null cuando el tiempo de referencia es desconocido', () => {
    const eventos = [evento({ casoId: 'C', publicadoEn: '2026-10-10T09:00:00.000Z' })]

    expect(calcularDemoras(conjunto, eventos)).toEqual([
      { casoId: 'C', desdeInicioHoras: null, desdePrimeraPublicacionHoras: null },
    ])
  })
})

describe('calcularDuplicados', () => {
  it('es 0 sin eventos', () => {
    expect(calcularDuplicados([])).toBe(0)
  })

  it('cuenta los eventos a partir del segundo por caso', () => {
    const eventos = [
      evento({ casoId: 'A' }),
      evento({ casoId: 'A' }),
      evento({ casoId: 'A' }),
      evento({ casoId: 'B' }),
    ]
    expect(calcularDuplicados(eventos)).toBe(2)
  })

  it('no cuenta eventos sin caso asociado', () => {
    expect(calcularDuplicados([evento({ casoId: null }), evento({ casoId: null })])).toBe(0)
  })
})
