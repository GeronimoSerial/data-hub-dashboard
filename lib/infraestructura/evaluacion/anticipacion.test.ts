import { describe, expect, it } from 'vitest'
import {
  calcularAnticipacionEpisodio,
  calcularEscuelasSinAlerta,
  calcularTasaAnticipacion,
  type EntradaAnticipacionEpisodio,
} from './anticipacion'

const T_ALERTA = '2026-03-10T06:00:00.000Z' // riesgo 'alto' emitido
const T_AFECTACION = '2026-03-10T18:00:00.000Z' // primera afectación confirmada, 12 h después
const T_HISTORIA_DESDE = '2026-03-09T00:00:00.000Z'

function base(overrides: Partial<EntradaAnticipacionEpisodio>): EntradaAnticipacionEpisodio {
  return {
    episodioId: 'ep-1',
    departamento: 'Paraná',
    primeraAfectacionEn: T_AFECTACION,
    historiaDisponibleDesde: T_HISTORIA_DESDE,
    senalesRiesgo: [],
    senalesPeligro: [],
    ...overrides,
  }
}

describe('calcularAnticipacionEpisodio', () => {
  it('no evaluable cuando no hay historia previa conocida (historiaDisponibleDesde null)', () => {
    const r = calcularAnticipacionEpisodio(base({ historiaDisponibleDesde: null }))
    expect(r.evaluable).toBe(false)
    expect(r.motivoNoEvaluable).toBe('sin_historia_previa')
    expect(r.precedidoPorRiesgoAlto).toBeNull()
    expect(r.anticipacionHoras).toBeNull()
  })

  it('no evaluable cuando la historia conocida empieza en o después del evento (censura)', () => {
    const r = calcularAnticipacionEpisodio(
      base({ historiaDisponibleDesde: T_AFECTACION }),
    )
    expect(r.evaluable).toBe(false)
    expect(r.motivoNoEvaluable).toBe('sin_historia_previa')
  })

  it('evaluable y precedido: mide horas entre la señal de riesgo alto más temprana y la afectación', () => {
    const r = calcularAnticipacionEpisodio(
      base({ senalesRiesgo: [{ nivel: 'alto', emitidoEn: T_ALERTA }] }),
    )
    expect(r.evaluable).toBe(true)
    expect(r.motivoNoEvaluable).toBeNull()
    expect(r.precedidoPorRiesgoAlto).toBe(true)
    expect(r.anticipacionHoras).toBe(12)
  })

  it('toma la señal MÁS TEMPRANA entre varias (riesgo y peligro) dentro de la ventana', () => {
    const masTemprana = '2026-03-10T00:00:00.000Z'
    const r = calcularAnticipacionEpisodio(
      base({
        senalesRiesgo: [{ nivel: 'alto', emitidoEn: T_ALERTA }],
        senalesPeligro: [{ nivel: 'rojo', emitidoEn: masTemprana }],
      }),
    )
    expect(r.anticipacionHoras).toBe(18)
  })

  it('ignora señales fuera de la ventana observable (antes de historiaDisponibleDesde o después del evento)', () => {
    const r = calcularAnticipacionEpisodio(
      base({
        senalesRiesgo: [
          { nivel: 'alto', emitidoEn: '2026-01-01T00:00:00.000Z' }, // antes de la historia: no cuenta como censura, pero SÍ está fuera de ventana
          { nivel: 'alto', emitidoEn: '2026-03-11T00:00:00.000Z' }, // después del evento: no es "antecedente"
        ],
      }),
    )
    // Ninguna señal cae dentro de [historiaDisponibleDesde, primeraAfectacionEn].
    expect(r.evaluable).toBe(true)
    expect(r.precedidoPorRiesgoAlto).toBe(false)
    expect(r.anticipacionHoras).toBeNull()
  })

  it('evaluable pero NO precedido: sin alerta previa el resultado es null, nunca un número negativo', () => {
    const r = calcularAnticipacionEpisodio(base({}))
    expect(r.evaluable).toBe(true)
    expect(r.precedidoPorRiesgoAlto).toBe(false)
    expect(r.anticipacionHoras).toBeNull()
  })

  it('ignora niveles de riesgo/peligro que no son "alto" (verde/amarillo/bajo no cuentan como alerta)', () => {
    const r = calcularAnticipacionEpisodio(
      base({
        senalesRiesgo: [{ nivel: 'moderado', emitidoEn: T_ALERTA }],
        senalesPeligro: [{ nivel: 'amarillo', emitidoEn: T_ALERTA }],
      }),
    )
    expect(r.precedidoPorRiesgoAlto).toBe(false)
  })
})

describe('calcularTasaAnticipacion', () => {
  it('con datos de desarrollo (mayormente no evaluable): tasaPrecedidos y promedio son null si NINGÚN episodio es evaluable', () => {
    const resultados = [
      calcularAnticipacionEpisodio(base({ historiaDisponibleDesde: null })),
      calcularAnticipacionEpisodio(base({ episodioId: 'ep-2', historiaDisponibleDesde: null })),
    ]
    const tasa = calcularTasaAnticipacion(resultados)
    expect(tasa.episodiosEvaluables).toBe(0)
    expect(tasa.episodiosNoEvaluables).toBe(2)
    expect(tasa.tasaPrecedidos).toBeNull()
    expect(tasa.anticipacionPromedioHoras).toBeNull()
  })

  it('denominador de tasaPrecedidos es sólo evaluables, no evaluables no penalizan', () => {
    const resultados = [
      calcularAnticipacionEpisodio(base({ senalesRiesgo: [{ nivel: 'alto', emitidoEn: T_ALERTA }] })),
      calcularAnticipacionEpisodio(base({ episodioId: 'ep-2' })), // evaluable, no precedido
      calcularAnticipacionEpisodio(
        base({ episodioId: 'ep-3', historiaDisponibleDesde: null }), // no evaluable
      ),
    ]
    const tasa = calcularTasaAnticipacion(resultados)
    expect(tasa.episodiosEvaluables).toBe(2)
    expect(tasa.episodiosNoEvaluables).toBe(1)
    expect(tasa.episodiosPrecedidos).toBe(1)
    expect(tasa.tasaPrecedidos).toBe(0.5)
    expect(tasa.anticipacionPromedioHoras).toBe(12)
  })
})

describe('calcularEscuelasSinAlerta', () => {
  it('"sin reporte" (maxNivelRiesgoAlcanzado null) se excluye del denominador, nunca cuenta como negativo', () => {
    const r = calcularEscuelasSinAlerta([
      { cueAnexo: '001', maxNivelRiesgoAlcanzado: 'alto' },
      { cueAnexo: '002', maxNivelRiesgoAlcanzado: 'moderado' },
      { cueAnexo: '003', maxNivelRiesgoAlcanzado: null },
    ])
    expect(r.escuelasConDatoDeRiesgo).toBe(2)
    expect(r.escuelasSinDatoDeRiesgo).toBe(1)
    expect(r.escuelasNuncaAlerta).toBe(1)
    expect(r.cueAnexosNuncaAlerta).toEqual(['002'])
    expect(r.tasaNuncaAlerta).toBe(0.5)
  })

  it('tasaNuncaAlerta es null cuando ninguna escuela tiene dato de riesgo (no 0 disfrazado)', () => {
    const r = calcularEscuelasSinAlerta([
      { cueAnexo: '001', maxNivelRiesgoAlcanzado: null },
    ])
    expect(r.escuelasConDatoDeRiesgo).toBe(0)
    expect(r.tasaNuncaAlerta).toBeNull()
  })
})
