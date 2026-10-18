import { describe, expect, it } from 'vitest'
import { compararNivelesV03V04, type SnapshotComparable } from './comparacion'

const rioV04 = (piso: string) => ({ fuente: 'rio-v04', explicacion: `Rio v0.4: P superacion del terreno 0.6 a 72h; conservador 0.7; metodo m version v; mapeo x; piso ${piso}` })

function s(cueAnexo: string, horizonteHoras: number, nivelRiesgo: SnapshotComparable['nivelRiesgo'], factores: SnapshotComparable['factores'] = []): SnapshotComparable {
  return { cueAnexo, horizonteHoras, nivelRiesgo, factores }
}

describe('compararNivelesV03V04', () => {
  it('cuenta niveles y transiciones por horizonte y explica la causa de cada cambio', () => {
    const v03 = [s('A', 72, 'bajo'), s('B', 72, 'moderado'), s('C', 72, 'alto'), s('D', 72, 'bajo'), s('E', 24, 'bajo')]
    const v04 = [
      s('A', 72, 'alto', [rioV04('probabilistico_alto')]),
      s('B', 72, 'bajo', [rioV04('ninguno')]),
      s('C', 72, 'alto', [rioV04('observado_evacuacion')]),
      s('D', 72, 'moderado', [rioV04('observado_alerta')]),
      s('E', 24, 'bajo'),
      s('F', 24, null),
    ]
    const r = compararNivelesV03V04(v03, v04)
    const h72 = r.porHorizonte.find((h) => h.horizonteHoras === 72)!
    expect(h72.conteoV03).toEqual({ bajo: 2, moderado: 1, alto: 1, muy_alto: 0, sin_nivel: 0 })
    expect(h72.conteoV04).toEqual({ bajo: 1, moderado: 1, alto: 2, muy_alto: 0, sin_nivel: 0 })
    expect(h72.transiciones).toEqual({ sube: 2, baja: 1, igual: 1 })
    const h24 = r.porHorizonte.find((h) => h.horizonteHoras === 24)!
    expect(h24.conteoV04.sin_nivel).toBe(1)
    expect(h24.transiciones).toEqual({ sube: 0, baja: 0, igual: 1 })
    expect(r.cambios).toEqual([
      { cueAnexo: 'A', horizonteHoras: 72, desde: 'bajo', hasta: 'alto', causa: 'piso_probabilistico' },
      { cueAnexo: 'B', horizonteHoras: 72, desde: 'moderado', hasta: 'bajo', causa: 'componente_probabilistico' },
      { cueAnexo: 'D', horizonteHoras: 72, desde: 'bajo', hasta: 'moderado', causa: 'piso_observado' },
    ])
  })
})
