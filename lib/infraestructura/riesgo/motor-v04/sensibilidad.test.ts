import { describe, expect, it } from 'vitest'
import { nivelConUmbrales, sensibilidadUmbrales, type FilaSensibilidad } from './sensibilidad'

function f(over: Partial<FilaSensibilidad>): FilaSensibilidad {
  return { cueAnexo: 'A', horizonteHoras: 72, nivelV03: 'bajo', scoreBase: 10, pPrincipal: null, pConservador: null, ...over }
}

describe('nivelConUmbrales', () => {
  it('sin P estimable clasifica el score base (no hay piso probabilístico)', () => {
    expect(nivelConUmbrales(f({ scoreBase: 30 }), { pAlto: 0.5, pModerado: 0.2 })).toBe('moderado')
  })

  it('P principal ≥ umbral alto fija piso alto; si no, P conservadora ≥ umbral moderado fija piso moderado', () => {
    const u = { pAlto: 0.5, pModerado: 0.2 }
    expect(nivelConUmbrales(f({ pPrincipal: 0.5, pConservador: 0.9 }), u)).toBe('alto')
    expect(nivelConUmbrales(f({ pPrincipal: 0.4, pConservador: 0.2 }), u)).toBe('moderado')
    expect(nivelConUmbrales(f({ pPrincipal: 0.1, pConservador: 0.19 }), u)).toBe('bajo')
  })

  it('los pisos sólo suben: un score base mayor se conserva', () => {
    expect(nivelConUmbrales(f({ scoreBase: 80, pPrincipal: 0.9 }), { pAlto: 0.5, pModerado: 0.2 })).toBe('muy_alto')
  })

  it('score base null (sin evidencia válida) da nivel null, nunca bajo', () => {
    expect(nivelConUmbrales(f({ scoreBase: null, pPrincipal: 0.9 }), { pAlto: 0.5, pModerado: 0.2 })).toBeNull()
  })
})

describe('sensibilidadUmbrales', () => {
  it('cuenta cambios frente a v0.3 por combinación de umbrales y horizonte', () => {
    const filas = [
      f({ cueAnexo: 'A', horizonteHoras: 24, pPrincipal: 0.6, pConservador: 0.8 }),
      f({ cueAnexo: 'B', horizonteHoras: 24, pPrincipal: 0.05, pConservador: 0.25 }),
      f({ cueAnexo: 'C', horizonteHoras: 240, nivelV03: 'moderado', scoreBase: 10, pPrincipal: 0 }),
      f({ cueAnexo: 'D', horizonteHoras: 240, nivelV03: null, scoreBase: 10 }),
    ]
    const [estricto, laxo] = sensibilidadUmbrales(filas, [
      { pAlto: 0.7, pModerado: 0.3 },
      { pAlto: 0.5, pModerado: 0.2 },
    ])
    expect(estricto).toMatchObject({ pAlto: 0.7, pModerado: 0.3, cambian: 2 })
    expect(estricto.porHorizonte).toEqual([
      { horizonteHoras: 24, sube: 1, baja: 0, igual: 1 },
      { horizonteHoras: 240, sube: 0, baja: 1, igual: 0 },
    ])
    expect(laxo.cambian).toBe(3)
    expect(laxo.porHorizonte[0]).toEqual({ horizonteHoras: 24, sube: 2, baja: 0, igual: 0 })
  })
})
