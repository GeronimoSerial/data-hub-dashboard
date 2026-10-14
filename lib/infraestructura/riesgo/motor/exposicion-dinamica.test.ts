import { describe, expect, it } from 'vitest'
import {
  anomaliaInterpolada,
  evaluarExposicionDinamica,
  nivelRioTramo,
} from './exposicion-dinamica'

describe('anomaliaInterpolada', () => {
  it('interpola a t≈0.5 en el punto medio de dos estaciones', () => {
    const resultado = anomaliaInterpolada({ lat: -29.5, lon: -56.5 }, [
      { estacionId: 'A', lat: -29, lon: -56.5, anomaliaM: 2 },
      { estacionId: 'B', lat: -30, lon: -56.5, anomaliaM: 4 },
    ])

    expect(resultado).not.toBeNull()
    expect(resultado!.t).toBeCloseTo(0.5, 2)
    expect(resultado!.anomaliaM).toBeCloseTo(3, 2)
    expect(resultado!.desde).toBe('A')
    expect(resultado!.hasta).toBe('B')
  })

  it('fija el punto más allá de la última estación en ella', () => {
    const resultado = anomaliaInterpolada({ lat: -31, lon: -56.5 }, [
      { estacionId: 'A', lat: -29, lon: -56.5, anomaliaM: 2 },
      { estacionId: 'B', lat: -30, lon: -56.5, anomaliaM: 4 },
    ])

    expect(resultado).toEqual({ anomaliaM: 4, desde: 'A', hasta: 'B', t: 1 })
  })

  it('usa la única estación válida cuando solo hay una', () => {
    const resultado = anomaliaInterpolada({ lat: -29, lon: -56.5 }, [
      { estacionId: 'A', lat: -29, lon: -56.5, anomaliaM: 5.004 },
    ])

    expect(resultado).toEqual({ anomaliaM: 5, desde: 'A', hasta: 'A', t: 0 })
  })

  it('devuelve null sin estaciones válidas', () => {
    expect(
      anomaliaInterpolada({ lat: -29, lon: -56.5 }, [
        { estacionId: 'A', lat: -29, lon: -56.5, anomaliaM: null },
      ]),
    ).toBeNull()
    expect(anomaliaInterpolada({ lat: -29, lon: -56.5 }, [])).toBeNull()
  })

  it('omite estaciones con anomalía null al formar los tramos', () => {
    const resultado = anomaliaInterpolada({ lat: -29.5, lon: -56.5 }, [
      { estacionId: 'A', lat: -29, lon: -56.5, anomaliaM: 2 },
      { estacionId: 'X', lat: -29.25, lon: -56.5, anomaliaM: null },
      { estacionId: 'B', lat: -30, lon: -56.5, anomaliaM: 4 },
    ])

    expect(resultado!.desde).toBe('A')
    expect(resultado!.hasta).toBe('B')
    expect(resultado!.anomaliaM).toBeCloseTo(3, 2)
  })
})

describe('nivelRioTramo', () => {
  it('devuelve la mediana de los niveles dentro de 500 m', () => {
    expect(
      nivelRioTramo([
        { sueloM: 40, nivelRioDemM: 42, distanciaRioM: 100 },
        { sueloM: 40, nivelRioDemM: 50, distanciaRioM: 300 },
        { sueloM: 40, nivelRioDemM: 1000, distanciaRioM: 900 },
        { sueloM: 40, nivelRioDemM: null, distanciaRioM: 100 },
      ]),
    ).toBe(46)
  })

  it('devuelve null si no hay niveles válidos', () => {
    expect(nivelRioTramo([])).toBeNull()
    expect(
      nivelRioTramo([{ sueloM: 40, nivelRioDemM: 42, distanciaRioM: 900 }]),
    ).toBeNull()
  })
})

describe('evaluarExposicionDinamica', () => {
  it('caso Paso de los Libres: expuesta', () => {
    const r = evaluarExposicionDinamica(
      { sueloM: 42.3, nivelRioDemM: 42, distanciaRioM: 120 },
      42,
      5,
    )

    expect(r.tipo).toBe('expuesta')
    if (r.tipo === 'expuesta') {
      expect(r.aguaEstimadaM).toBe(47)
      expect(r.sueloM).toBe(42.3)
      expect(r.detalle).toContain('(DEM; estimado)')
    }
  })

  it('escuela en pendiente: no expuesta', () => {
    const r = evaluarExposicionDinamica(
      { sueloM: 52, nivelRioDemM: 42, distanciaRioM: 120 },
      42,
      5,
    )

    expect(r.tipo).toBe('no_expuesta')
  })

  it('embalse: no aplica (tramo con represa aguas arriba)', () => {
    const r = evaluarExposicionDinamica(
      { sueloM: 60, nivelRioDemM: 80, distanciaRioM: 120 },
      54.5,
      5,
      true,
    )

    expect(r.tipo).toBe('no_aplica_embalse')
  })

  it('Puerto Valle (1801318-00): embalse a 1.2 km, no aplica aunque supere la distancia', () => {
    const r = evaluarExposicionDinamica(
      { sueloM: 89.33, nivelRioDemM: 80, distanciaRioM: 1165.85 },
      54.5,
      2.8,
      true,
    )

    expect(r.tipo).toBe('no_aplica_embalse')
  })

  it('agua colgada sin represa en el tramo (San Cosme): laguna, no embalse', () => {
    const r = evaluarExposicionDinamica(
      { sueloM: 60, nivelRioDemM: 58.5, distanciaRioM: 190 },
      47,
      2.6,
    )

    expect(r.tipo).toBe('no_expuesta')
    if (r.tipo === 'no_expuesta') expect(r.detalle).toContain('laguna')
  })

  it('laguna con diferencia dentro del umbral de embalse: no expuesta', () => {
    const r = evaluarExposicionDinamica(
      { sueloM: 50, nivelRioDemM: 52, distanciaRioM: 120 },
      47,
      5,
    )

    expect(r.tipo).toBe('no_expuesta')
    if (r.tipo === 'no_expuesta') {
      expect(r.detalle).toContain('laguna')
    }
  })

  it('sin DEM, sin suelo o sin distancia: no expuesta', () => {
    expect(evaluarExposicionDinamica(null, 42, 5).tipo).toBe('no_expuesta')
    expect(
      evaluarExposicionDinamica({ sueloM: null, nivelRioDemM: 42, distanciaRioM: 1 }, 42, 5).tipo,
    ).toBe('no_expuesta')
    expect(
      evaluarExposicionDinamica({ sueloM: 40, nivelRioDemM: 42, distanciaRioM: null }, 42, 5).tipo,
    ).toBe('no_expuesta')
  })

  it('río más lejano que 500 m: no expuesta', () => {
    const r = evaluarExposicionDinamica(
      { sueloM: 40, nivelRioDemM: 42, distanciaRioM: 600 },
      42,
      5,
    )

    expect(r.tipo).toBe('no_expuesta')
    if (r.tipo === 'no_expuesta') {
      expect(r.detalle).toContain('600')
    }
  })

  it('sin anomalía: sin dato', () => {
    const r = evaluarExposicionDinamica(
      { sueloM: 42.3, nivelRioDemM: 42, distanciaRioM: 120 },
      42,
      null,
    )

    expect(r.tipo).toBe('sin_dato')
  })

  it('sin nivel de tramo: omite las reglas de embalse y laguna', () => {
    const r = evaluarExposicionDinamica(
      { sueloM: 42.3, nivelRioDemM: 42, distanciaRioM: 120 },
      null,
      5,
    )

    expect(r.tipo).toBe('expuesta')
  })
})
