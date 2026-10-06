import { describe, expect, it } from 'vitest'
import { etiquetaApoyoMapa, valorApoyoMapa } from './etiqueta-apoyo'

describe('etiquetaApoyoMapa', () => {
  it.each([
    ['sin_dato', 'Asistencia pedagógica sin dato'],
    ['no', 'No se brinda asistencia pedagógica'],
    ['brinda', 'Se brinda asistencia pedagógica'],
    ['virtual', 'Asistencia pedagógica: clase virtual'],
    ['cuadernillo', 'Asistencia pedagógica: cuadernillo'],
    ['ambos', 'Asistencia pedagógica: clase virtual y cuadernillo'],
  ] as const)('traduce %s con el vocabulario visible canónico', (estado, etiqueta) => {
    expect(etiquetaApoyoMapa('sin', estado)).toBe(etiqueta)
  })

  it('no muestra estado pedagógico para clases normales ni estado null', () => {
    expect(etiquetaApoyoMapa('normal', 'sin_dato')).toBeNull()
    expect(etiquetaApoyoMapa('sin', null)).toBeNull()
  })
})

describe('valorApoyoMapa', () => {
  it.each([
    ['sin_dato', 'Sin dato'],
    ['no', 'No se brinda'],
    ['brinda', 'Se brinda'],
    ['virtual', 'Se brinda (virtual)'],
    ['cuadernillo', 'Se brinda (cuadernillo)'],
    ['ambos', 'Se brinda (virtual y cuadernillo)'],
  ] as const)('traduce %s como valor bajo su rótulo', (estado, valor) => {
    expect(valorApoyoMapa('sin', estado)).toBe(valor)
  })

  it('no muestra valor pedagógico para clases normales ni estado null', () => {
    expect(valorApoyoMapa('normal', 'sin_dato')).toBeNull()
    expect(valorApoyoMapa('sin', null)).toBeNull()
  })
})
