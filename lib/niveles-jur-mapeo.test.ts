import { describe, expect, it } from 'vitest'
import {
  MAPEO_NIVEL_A_JUR,
  mapearNivelesAJur,
  nivelesDesconocidos,
} from './niveles-jur-mapeo'

describe('MAPEO_NIVEL_A_JUR', () => {
  it('mapea según la decisión aprobada (2026-10-15)', () => {
    expect(MAPEO_NIVEL_A_JUR).toEqual({
      secundario: [1, 5],
      superior: [4],
      inicial: [9],
      primario: [9],
      transversal: [],
    })
  })
})

describe('mapearNivelesAJur', () => {
  it('traduce cada nivel legado a sus ids jurisdiccionales', () => {
    expect(mapearNivelesAJur(['secundario'])).toEqual([1, 5])
    expect(mapearNivelesAJur(['superior'])).toEqual([4])
    expect(mapearNivelesAJur(['inicial'])).toEqual([9])
  })

  it('deduplica cuando inicial y primario apuntan al mismo nivel', () => {
    expect(mapearNivelesAJur(['inicial', 'primario'])).toEqual([9])
    expect(mapearNivelesAJur(['primario', 'inicial', 'primario'])).toEqual([9])
  })

  it('devuelve lista vacía para transversal (sin restricción)', () => {
    expect(mapearNivelesAJur(['transversal'])).toEqual([])
  })

  it('ignora ids desconocidos sin romper el resto', () => {
    expect(mapearNivelesAJur(['no-existe', 'superior'])).toEqual([4])
  })

  it('ordena el resultado de forma determinística', () => {
    expect(mapearNivelesAJur(['superior', 'secundario'])).toEqual([1, 4, 5])
  })
})

describe('nivelesDesconocidos', () => {
  it('reporta sólo los ids sin equivalencia, sin repetir', () => {
    expect(
      nivelesDesconocidos(['secundario', 'raro', 'raro', 'transversal']),
    ).toEqual(['raro'])
  })

  it('no reporta transversal, que sí está mapeado', () => {
    expect(nivelesDesconocidos(['transversal'])).toEqual([])
  })
})
