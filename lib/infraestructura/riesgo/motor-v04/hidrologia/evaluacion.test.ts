import { describe, expect, it } from 'vitest'
import { type FilaDiaria, PARAMETROS_ANALOGOS_V1, crearSerieDiaria } from './analogos'
import { type RegistroEvaluacion, agruparEpisodios, evaluarEstacion, metricasBrier } from './evaluacion'

function sinusoide(desde: string, hasta: string, futuro?: (fecha: string) => number | null): FilaDiaria[] {
  const filas: FilaDiaria[] = []
  for (let t = Date.parse(desde), i = 0; t <= Date.parse(hasta); t += 86_400_000, i++) {
    const fecha = new Date(t).toISOString().slice(0, 10)
    const alterado = futuro?.(fecha)
    const valorM = alterado ?? 3 + 2 * Math.sin((2 * Math.PI * i) / 365.25) + 0.3 * Math.sin(i / 7)
    filas.push({ fecha, valorM })
  }
  return filas
}

describe('metricasBrier', () => {
  it('Brier y skill contra referencias en un caso calculado a mano', () => {
    const r: RegistroEvaluacion[] = [
      { fecha: '2000-01-01', p: 1, pClimatologia: 0.5, pPersistencia: 1, observado: 1 },
      { fecha: '2000-01-08', p: 0, pClimatologia: 0.5, pPersistencia: 1, observado: 0 },
      { fecha: '2000-01-15', p: 0.5, pClimatologia: 0.5, pPersistencia: 0, observado: 1 },
    ]
    const m = metricasBrier(r)
    expect(m.brier).toBeCloseTo(0.25 / 3)
    expect(m.bssClimatologia).toBeCloseTo(1 - 0.25 / 3 / 0.25)
    expect(m.bssPersistencia).toBeCloseTo(1 - 0.25 / 3 / (2 / 3))
    expect(m.n).toBe(3)
    expect(m.positivos).toBe(2)
  })

  it('skill nulo si la referencia es perfecta (nunca 0 ni infinito)', () => {
    const m = metricasBrier([{ fecha: '2000-01-01', p: 0.2, pClimatologia: 0, pPersistencia: 0, observado: 0 }])
    expect(m.bssClimatologia).toBeNull()
  })
})

describe('agruparEpisodios', () => {
  it('agrupa positivos separados por menos de la separación en un episodio', () => {
    expect(agruparEpisodios(['2000-01-01', '2000-01-08', '2000-01-15', '2000-03-01', '2000-03-08', '2001-01-01'], 14)).toBe(3)
    expect(agruparEpisodios([], 14)).toBe(0)
  })
})

describe('evaluarEstacion', () => {
  const umbrales = { alerta: 4.5, evacuacion: 5 }
  const fechas = ['1999-03-01', '1999-06-01', '1999-09-01', '1999-12-01']

  it('el pronóstico en t no depende de datos posteriores a t (sin fuga)', () => {
    const limpia = crearSerieDiaria(sinusoide('1950-01-01', '2000-12-31'))
    const alterada = crearSerieDiaria(sinusoide('1950-01-01', '2000-12-31', (f) => (f >= '1999-03-02' ? 9 : null)))
    const a = evaluarEstacion(limpia, fechas, umbrales, PARAMETROS_ANALOGOS_V1)
    const b = evaluarEstacion(alterada, fechas, umbrales, PARAMETROS_ANALOGOS_V1)
    const pa = a.registros.alerta[240].map((x) => [x.p, x.pClimatologia])
    const pb = b.registros.alerta[240].map((x) => [x.p, x.pClimatologia])
    expect(pb[0]).toEqual(pa[0])
    expect(b.registros.alerta[240][0].observado).toBe(1)
  })

  it('reporta abstención y muestra por horizonte', () => {
    const serie = crearSerieDiaria(sinusoide('1990-01-01', '2000-12-31'))
    const e = evaluarEstacion(serie, ['1990-06-01', ...fechas], umbrales, PARAMETROS_ANALOGOS_V1)
    expect(e.abstenciones).toBe(1)
    expect(e.fechasConObservacion).toBe(5)
    expect(e.registros.alerta[24].length).toBe(4)
  })
})
