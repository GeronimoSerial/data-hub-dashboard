import { describe, expect, it } from 'vitest'
import { presentarCrecida, presentarReferenciaEstudio } from './presentacion-crecida'
import { CUE_CRECIDA, INFO_CRECIDA, PRESENTACION_CRECIDA, factorCrecida } from './__fixtures__/crecida-rio'
import { DEFENSAS_COSTERAS_V04 } from './motor/altura-critica'
import { evidenciaSecoS2 } from './motor/evidencia-seco-s2'
import escenas from './antecedentes-crecida-s2.json'

const FECHA = '2026-10-18T10:00:00Z'

describe('referencia del estudio independiente del riesgo operativo', () => {
  it('muestra la escuela 1800818-00 con una corrida v0.3 y distingue la referencia del estudio', () => {
    const factor = { ...factorCrecida(), fuente: 'rio-prefectura', variable: 'altura_rio', valor: 4.8, explicacion: 'Rio parana en pna-ituzaingo: 4.8m, estado evacuacion' }
    expect(presentarReferenciaEstudio('1800818-00', [factor])).toMatchObject({
      estacion: 'Ituzaingó', alturaActualM: 4.8, alturaCriticaM: 15.47, subidaDesdeActualM: 10.67,
      antecedente: { nivelM: 3.6, distanciaAguaM: 283, subidaHastaUmbralM: 11.87 },
      origen: 'estudio_v04',
    })
  })

  it('no mezcla una lectura de otra estación ni inventa una altura sin calibración utilizable', () => {
    expect(presentarReferenciaEstudio('1800818-00', [factorCrecida()])?.alturaActualM).toBeNull()
    expect(presentarReferenciaEstudio('1800133-00', [])).toMatchObject({ alturaCriticaM: null, antecedente: { nivelM: 7.38 } })
    expect(presentarReferenciaEstudio('sin-escena', [])).toBeNull()
  })
})

describe('presentarCrecida', () => {
  it('presenta la altura crítica persistida sin restar otro margen y une la distancia de la misma escena', () => {
    expect(presentarCrecida(CUE_CRECIDA, [factorCrecida()], FECHA)).toEqual(PRESENTACION_CRECIDA)
  })

  it('lee las probabilidades del umbral graficado y conserva los horizontes sin datos', () => {
    const info = { ...INFO_CRECIDA, pAlcanzarPorHorizonte: { 24: 0.12, 72: null, 240: 0.67 } }
    expect(presentarCrecida(CUE_CRECIDA, [factorCrecida(info)], FECHA)?.probabilidadesPorHorizonte)
      .toEqual({ 24: 12, 72: null, 240: 67 })
    const sinProbabilidad = { ...factorCrecida(), explicacion: factorCrecida().explicacion.replace(/probabilidad 1 día[^;]+;/, '') }
    expect(presentarCrecida(CUE_CRECIDA, [sinProbabilidad], FECHA)?.probabilidadesPorHorizonte).toBeUndefined()
  })

  it.each(['dem', 'cero+km'] as const)('también presenta la fuente %s aunque no contribuya al riesgo', (fuente) => {
    const factor = { ...factorCrecida({ ...INFO_CRECIDA, fuente }), fuente: 'rio-prefectura', variable: 'altura_rio', unidad: 'no_alcanzable' }
    expect(presentarCrecida(CUE_CRECIDA, [factor], FECHA)?.alturaCriticaM).toBe(14.66)
  })

  it('no inventa distancias para otra escuela o una fecha distinta', () => {
    expect(presentarCrecida('sin-escena', [factorCrecida()], FECHA)?.antecedente?.distanciaAguaM).toBeNull()
    const otroDia = { ...INFO_CRECIDA, evidenciaSecoS2: { ...INFO_CRECIDA.evidenciaSecoS2!, fecha: '2023-11-28' } }
    expect(presentarCrecida(CUE_CRECIDA, [factorCrecida(otroDia)], FECHA)?.antecedente?.distanciaAguaM).toBeNull()
  })

  it('omite antecedentes posteriores al cálculo y permite alturas sin lectura actual', () => {
    expect(presentarCrecida(CUE_CRECIDA, [factorCrecida()], '2023-11-01T00:00:00Z')?.antecedente).toBeNull()
    const sinLectura = presentarCrecida(CUE_CRECIDA, [factorCrecida({ ...INFO_CRECIDA, h0M: null })], FECHA)
    expect(sinLectura?.alturaActualM).toBeNull()
    expect(sinLectura?.subidaDesdeActualM).toBeNull()
  })

  it('conserva el signo si la lectura ya superó el umbral e informa la defensa costera', () => {
    const info = { ...INFO_CRECIDA, h0M: 15, defensa: DEFENSAS_COSTERAS_V04[0] }
    expect(presentarCrecida(CUE_CRECIDA, [factorCrecida(info)], FECHA)).toMatchObject({ subidaDesdeActualM: -0.34, defensaCostera: true })
  })

  it('omite el bloque si el cálculo no publica una altura crítica reconocible', () => {
    expect(presentarCrecida(CUE_CRECIDA, [], FECHA)).toBeNull()
    expect(presentarCrecida(CUE_CRECIDA, [{ ...factorCrecida(), explicacion: 'Rio sin dato' }], FECHA)).toBeNull()
  })

  it('cada distancia exportada corresponde a la estación, altura y fecha de la evidencia seca de v0.4', () => {
    for (const escena of escenas) {
      for (const [cue, distancia] of Object.entries(escena.distanciasM)) {
        expect(evidenciaSecoS2(cue)).toEqual({ estacionId: escena.estacionId, hSecoM: escena.nivelM, fecha: escena.fecha })
        expect(distancia).toBeGreaterThanOrEqual(30)
      }
    }
  })
})
