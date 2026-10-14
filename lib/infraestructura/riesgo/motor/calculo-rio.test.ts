import { describe, expect, it } from 'vitest'
import { crearPuertosFake } from './__fixtures__/puertos-fake'
import { calcularRiesgoEscuela } from './calculo'
import { MOTOR_VERSION, UMBRAL_ALTO, UMBRAL_MODERADO } from './config'
import type { EvidenciaRioPrefectura, PuertosMotor } from './puertos'

const CUE = 'cue-rio'
const GEOM = 'celda-rio'
const AS_OF = '2026-10-13T23:00:00.000Z'

function evidencia(over: Partial<EvidenciaRioPrefectura> = {}): EvidenciaRioPrefectura {
  return {
    cueAnexo: CUE,
    estacionId: 'pna-paso-de-los-libres',
    rio: 'uruguay',
    lecturaM: 9.33,
    alertaM: 7,
    evacuacionM: 8.5,
    variacionM: 0.2,
    medidaEn: '2026-10-13T17:00:00.000Z',
    estado: 'evacuacion',
    criterioExposicion: 'clase_rio=alto',
    ...over,
  }
}

// Escuela con celda verde, sin caudal, poca lluvia y vulnerabilidad baja: el
// caso real de prod en el que todo daba "bajo".
function puertos(ev: EvidenciaRioPrefectura | null | 'sin_puerto'): PuertosMotor {
  const base = crearPuertosFake({
    territorio: {
      [CUE]: {
        cueAnexo: CUE,
        geometryRef: GEOM,
        departamento: 'PASO DE LOS LIBRES',
        puntoRioId: null,
        motivoExclusion: null,
      },
    },
    peligro: {
      [GEOM]: [
        {
          geometryRef: GEOM,
          horizonteHoras: 24,
          nivel: 'verde',
          base: 'ensemble',
          probabilidadP95: null,
          probabilidadP99: null,
          precipitacionMm: null,
          percentilReferencia: null,
          emitidoEn: AS_OF,
          validoHasta: '2026-10-14T23:00:00.000Z',
          versionRegla: 'regla-v1',
        },
      ],
    },
    lluvia24h: { [GEOM]: 2 },
    lluvia72h: { [GEOM]: 5 },
    historial: {
      [CUE]: {
        cueAnexo: CUE,
        cantidadConfirmadas: 0,
        duracionTotalHoras: 0,
        accesoInterrumpidoCantidad: 0,
        antecedentes: [],
      },
    },
  })
  if (ev === 'sin_puerto') return base
  return { ...base, rioPrefectura: { obtenerEvidencia: async () => ev } }
}

function calcular(p: PuertosMotor) {
  return calcularRiesgoEscuela({ cueAnexo: CUE, horizonte: 24, asOf: AS_OF, puertos: p })
}

describe('calcularRiesgoEscuela — evidencia de río (Prefectura)', () => {
  it('sube la versión del motor', () => {
    expect(MOTOR_VERSION).toBe('motor-v0.3')
  })

  it('evacuación en escuela expuesta: factor rio-prefectura y piso alto', async () => {
    const r = await calcular(puertos(evidencia()))
    const factor = r.factores.find((f) => f.fuente === 'rio-prefectura')
    expect(factor).toBeDefined()
    expect(factor?.valor).toBe(9.33)
    expect(factor?.explicacion).toContain('evacuacion')
    expect(factor?.explicacion).toContain('clase_rio=alto')
    expect(r.scoreRiesgo).toBeGreaterThanOrEqual(UMBRAL_ALTO)
    expect(r.nivelRiesgo === 'alto' || r.nivelRiesgo === 'muy_alto').toBe(true)
    expect(r.nivelAmenaza).toBe('muy_alto')
  })

  it('alerta en escuela expuesta: piso moderado', async () => {
    const r = await calcular(puertos(evidencia({ lecturaM: 7.5, estado: 'alerta', variacionM: 0 })))
    expect(r.scoreRiesgo).toBeGreaterThanOrEqual(UMBRAL_MODERADO)
    expect(r.nivelRiesgo).not.toBe('bajo')
    expect(r.nivelAmenaza === 'alto' || r.nivelAmenaza === 'muy_alto').toBe(true)
  })

  it('normal: entra como componente pero sin piso', async () => {
    const r = await calcular(puertos(evidencia({ lecturaM: 5.43, alertaM: 6.5, evacuacionM: 7, estado: 'normal' })))
    expect(r.factores.some((f) => f.fuente === 'rio-prefectura')).toBe(true)
    expect(r.nivelRiesgo).toBe('bajo')
  })

  it('sin evidencia (no expuesta) no cambia el resultado ni penaliza confianza', async () => {
    const sinPuerto = await calcular(puertos('sin_puerto'))
    const nula = await calcular(puertos(null))
    expect(nula.scoreRiesgo).toBe(sinPuerto.scoreRiesgo)
    expect(nula.confianza).toBe(sinPuerto.confianza)
    expect(nula.factores.some((f) => f.fuente === 'rio-prefectura')).toBe(false)
  })
})
