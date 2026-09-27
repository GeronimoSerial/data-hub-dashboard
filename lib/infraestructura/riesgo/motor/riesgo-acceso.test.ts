import { describe, expect, it } from 'vitest'
import type { IndiceAislamiento, NivelAislamiento } from './puertos'
import { calcularRiesgoAcceso } from './riesgo-acceso'

function indice(nivel: NivelAislamiento, over: Partial<IndiceAislamiento> = {}): IndiceAislamiento {
  return {
    cueAnexo: 'CUE-1',
    nivel,
    crucesAguaCount: null,
    crucesAguaConPuenteCount: null,
    crucesAguaConVadoCount: null,
    tieneAlternativaSinCruce: null,
    versionJob: 'v1',
    fechaExtractoOsm: '2026-09-01',
    licencia: 'ODbL',
    ...over,
  }
}

// Caso de aceptación central: un cruce sin puente/vado CONOCIDO + peligro del
// horizonte 'rojo' debe elevar el riesgo de acceso por encima del mismo
// aislamiento solo (sin peligro alto).
describe('calcularRiesgoAcceso', () => {
  it('cruce sin puente + peligro alto sube el riesgo sobre el mismo aislamiento sin peligro', () => {
    const base = { crucesAguaCount: 1, crucesAguaConPuenteCount: 0, crucesAguaConVadoCount: 0, tieneAlternativaSinCruce: true }

    const conPeligro = calcularRiesgoAcceso({
      indice: indice(1, base),
      nivelPeligroCelda: 'rojo',
      nivelPeligroCaudal: null,
      accesoInterrumpidoCantidad: 0,
    })
    const sinPeligro = calcularRiesgoAcceso({
      indice: indice(1, base),
      nivelPeligroCelda: 'verde',
      nivelPeligroCaudal: null,
      accesoInterrumpidoCantidad: 0,
    })

    expect(conPeligro.score).not.toBeNull()
    expect(sinPeligro.score).not.toBeNull()
    expect(conPeligro.score as number).toBeGreaterThan(sinPeligro.score as number)
    expect(conPeligro.nivel).toBe('alto')
    expect(sinPeligro.nivel).toBe('moderado')
  })

  it('alternativa desconocida (null) nunca da menos riesgo que alternativa ausente (false)', () => {
    const desconocida = calcularRiesgoAcceso({
      indice: indice(1, { tieneAlternativaSinCruce: null }),
      nivelPeligroCelda: 'verde',
      nivelPeligroCaudal: null,
      accesoInterrumpidoCantidad: 0,
    })
    const ausente = calcularRiesgoAcceso({
      indice: indice(1, { tieneAlternativaSinCruce: false }),
      nivelPeligroCelda: 'verde',
      nivelPeligroCaudal: null,
      accesoInterrumpidoCantidad: 0,
    })

    expect(desconocida.score).not.toBeNull()
    expect(ausente.score).not.toBeNull()
    expect(desconocida.score as number).toBeGreaterThanOrEqual(ausente.score as number)
  })

  it('un cauce cercano con puente para todos y alternativa conocida NO sube el nivel por si solo', () => {
    for (const alternativa of [true, false]) {
      const resultado = calcularRiesgoAcceso({
        indice: indice(0, {
          crucesAguaCount: 2,
          crucesAguaConPuenteCount: 2,
          crucesAguaConVadoCount: 0,
          tieneAlternativaSinCruce: alternativa,
        }),
        nivelPeligroCelda: 'verde',
        nivelPeligroCaudal: 'amarillo',
        accesoInterrumpidoCantidad: 0,
      })

      expect(resultado.nivel).toBe('bajo')
      expect(resultado.confianza).toBe('alta')
    }
  })

  it('sin IndiceAislamiento (null) => confianza baja y nivel null, nunca "bajo"', () => {
    const resultado = calcularRiesgoAcceso({
      indice: null,
      nivelPeligroCelda: 'rojo',
      nivelPeligroCaudal: 'rojo',
      accesoInterrumpidoCantidad: 3,
    })

    expect(resultado.score).toBeNull()
    expect(resultado.nivel).toBeNull()
    expect(resultado.nivel).not.toBe('bajo')
    expect(resultado.confianza).toBe('baja')
  })

  it("'sin_datos_red' se trata igual que la ausencia: confianza baja y nivel null", () => {
    const resultado = calcularRiesgoAcceso({
      indice: indice('sin_datos_red'),
      nivelPeligroCelda: 'rojo',
      nivelPeligroCaudal: null,
      accesoInterrumpidoCantidad: 0,
    })

    expect(resultado.score).toBeNull()
    expect(resultado.nivel).toBeNull()
    expect(resultado.confianza).toBe('baja')
  })

  it('un vado o un conteo de puentes desconocido tambien cuentan como cruce de riesgo', () => {
    const conVado = calcularRiesgoAcceso({
      indice: indice(0, { crucesAguaCount: 1, crucesAguaConPuenteCount: 1, crucesAguaConVadoCount: 1, tieneAlternativaSinCruce: true }),
      nivelPeligroCelda: null,
      nivelPeligroCaudal: null,
      accesoInterrumpidoCantidad: 0,
    })
    const puenteDesconocido = calcularRiesgoAcceso({
      indice: indice(0, { crucesAguaCount: 1, crucesAguaConPuenteCount: null, crucesAguaConVadoCount: 0, tieneAlternativaSinCruce: true }),
      nivelPeligroCelda: null,
      nivelPeligroCaudal: null,
      accesoInterrumpidoCantidad: 0,
    })

    expect(conVado.nivel).toBe('moderado')
    expect(conVado.score).toBe(25)
    expect(puenteDesconocido.score).toBe(25)
  })

  it('acceso interrumpido confirmado suma como agravante adicional', () => {
    const sinAcceso = calcularRiesgoAcceso({
      indice: indice(0, { crucesAguaCount: 0, crucesAguaConPuenteCount: 0, crucesAguaConVadoCount: 0, tieneAlternativaSinCruce: true }),
      nivelPeligroCelda: 'verde',
      nivelPeligroCaudal: null,
      accesoInterrumpidoCantidad: 0,
    })
    const conAcceso = calcularRiesgoAcceso({
      indice: indice(0, { crucesAguaCount: 0, crucesAguaConPuenteCount: 0, crucesAguaConVadoCount: 0, tieneAlternativaSinCruce: true }),
      nivelPeligroCelda: 'verde',
      nivelPeligroCaudal: null,
      accesoInterrumpidoCantidad: 2,
    })

    expect(conAcceso.score as number).toBeGreaterThan(sinAcceso.score as number)
  })
})
