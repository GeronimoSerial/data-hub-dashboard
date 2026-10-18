import { describe, expect, it } from 'vitest'
import {
  nivelEnSitio,
  tramoDeLocalidad,
  ubicarEscuelaEnRio,
  type EstacionTransferencia,
  type TramoAprobado,
} from './transferencia-nivel'

// Coordenadas declaradas por PNA (sin verificar) y km/cero del catálogo A5.
const CORRIENTES: EstacionTransferencia = { estacionId: 'pna-corrientes', rio: 'parana', ceroM: 42.39, kmRio: 1208, coordenadas: { lat: -27.46, lon: -58.84 } }
const EMPEDRADO: EstacionTransferencia = { estacionId: 'pna-empedrado', rio: 'parana', ceroM: 39.68, kmRio: 1140, coordenadas: { lat: -27.958948, lon: -58.820198 } }
const BELLA_VISTA: EstacionTransferencia = { estacionId: 'pna-bella-vista', rio: 'parana', ceroM: 34.74, kmRio: 1057, coordenadas: { lat: -28.505997, lon: -59.050133 } }
const PASO_PATRIA: EstacionTransferencia = { estacionId: 'pna-paso-de-la-patria', rio: 'parana', ceroM: null, kmRio: 1240, coordenadas: { lat: -27.315833, lon: -58.576944 } }
const ITATI: EstacionTransferencia = { estacionId: 'pna-itati', rio: 'parana', ceroM: 45.66, kmRio: null, coordenadas: { lat: -27.27, lon: -58.24 } }
const ITUZAINGO: EstacionTransferencia = { estacionId: 'pna-ituzaingo', rio: 'parana', ceroM: null, kmRio: null, coordenadas: { lat: -27.60825, lon: -56.834663 } }
const SANTO_TOME: EstacionTransferencia = { estacionId: 'pna-santo-tome', rio: 'uruguay', ceroM: null, kmRio: null, coordenadas: { lat: -28.545389, lon: -56.028472 } }
const ESTACIONES = [ITUZAINGO, ITATI, PASO_PATRIA, CORRIENTES, EMPEDRADO, BELLA_VISTA, SANTO_TOME]

const punto = (a: EstacionTransferencia, b: EstacionTransferencia, t: number) => ({
  lat: a.coordenadas!.lat + t * (b.coordenadas!.lat - a.coordenadas!.lat),
  lon: a.coordenadas!.lon + t * (b.coordenadas!.lon - a.coordenadas!.lon),
})

describe('ubicarEscuelaEnRio', () => {
  it('interpola el km en el punto medio entre las dos estaciones que encierran la escuela', () => {
    const u = ubicarEscuelaEnRio({ punto: punto(CORRIENTES, EMPEDRADO, 0.5), estacionTramoId: 'pna-empedrado', estaciones: ESTACIONES })
    expect(u.estado).toBe('ubicada')
    if (u.estado !== 'ubicada') return
    expect(u.aguasArriba.estacionId).toBe('pna-corrientes')
    expect(u.aguasAbajo.estacionId).toBe('pna-empedrado')
    expect(u.t).toBeCloseTo(0.5, 6)
    expect(u.kmRio).toBeCloseTo(1174, 6)
    expect(u.distanciaEjeKm).toBeCloseTo(0, 6)
  })

  it('en ambos extremos el km y la cota del agua coinciden con la estación', () => {
    const arriba = ubicarEscuelaEnRio({ punto: CORRIENTES.coordenadas!, estacionTramoId: 'pna-corrientes', estaciones: ESTACIONES })
    const abajo = ubicarEscuelaEnRio({ punto: EMPEDRADO.coordenadas!, estacionTramoId: 'pna-empedrado', estaciones: ESTACIONES })
    if (arriba.estado !== 'ubicada' || abajo.estado !== 'ubicada') throw new Error('se esperaban ubicadas')
    expect(arriba.kmRio).toBeCloseTo(1208, 6)
    expect(nivelEnSitio(arriba, { aguasArribaM: 5, aguasAbajoM: 4 })).toBeCloseTo(42.39 + 5, 6)
    // Empedrado es el extremo de aguas abajo de Corrientes–Empedrado o el de aguas arriba de Empedrado–Bella Vista: mismo nivel.
    const nivelAbajo = abajo.aguasArriba.estacionId === 'pna-empedrado'
      ? nivelEnSitio(abajo, { aguasArribaM: 4, aguasAbajoM: 9 })
      : nivelEnSitio(abajo, { aguasArribaM: 9, aguasAbajoM: 4 })
    expect(nivelAbajo).toBeCloseTo(39.68 + 4, 6)
  })

  it('el nivel en el sitio es la interpolación por km de cero + h de ambas estaciones', () => {
    const u = ubicarEscuelaEnRio({ punto: punto(CORRIENTES, EMPEDRADO, 0.25), estacionTramoId: 'pna-corrientes', estaciones: ESTACIONES })
    if (u.estado !== 'ubicada') throw new Error('se esperaba ubicada')
    expect(nivelEnSitio(u, { aguasArribaM: 6, aguasAbajoM: 5 })).toBeCloseTo(0.75 * (42.39 + 6) + 0.25 * (39.68 + 5), 6)
  })

  it('aguas arriba del primer hidrómetro interpolable queda fuera de tramo', () => {
    const u = ubicarEscuelaEnRio({ punto: punto(CORRIENTES, EMPEDRADO, -0.3), estacionTramoId: 'pna-corrientes', estaciones: ESTACIONES })
    expect(u).toEqual({ estado: 'no_estimable', motivo: 'fuera_de_tramo_interpolable' })
  })

  it('estaciones sin cero o sin km y otros ríos dan motivos específicos', () => {
    const p = PASO_PATRIA.coordenadas!
    expect(ubicarEscuelaEnRio({ punto: p, estacionTramoId: 'pna-paso-de-la-patria', estaciones: ESTACIONES })).toEqual({ estado: 'no_estimable', motivo: 'sin_cero_escala' })
    expect(ubicarEscuelaEnRio({ punto: p, estacionTramoId: 'pna-itati', estaciones: ESTACIONES })).toEqual({ estado: 'no_estimable', motivo: 'sin_km_rio' })
    expect(ubicarEscuelaEnRio({ punto: p, estacionTramoId: 'pna-ituzaingo', estaciones: ESTACIONES })).toEqual({ estado: 'no_estimable', motivo: 'sin_cero_escala' })
    expect(ubicarEscuelaEnRio({ punto: p, estacionTramoId: 'pna-santo-tome', estaciones: ESTACIONES })).toEqual({ estado: 'no_estimable', motivo: 'rio_sin_transferencia' })
  })

  it('sin tramo aprobado nunca se asigna por cercanía', () => {
    const u = ubicarEscuelaEnRio({ punto: punto(CORRIENTES, EMPEDRADO, 0.5), estacionTramoId: null, estaciones: ESTACIONES })
    expect(u).toEqual({ estado: 'no_estimable', motivo: 'sin_tramo_aprobado' })
  })

  it('una escuela del tramo de Bella Vista nunca se ubica entre Corrientes y Empedrado', () => {
    const u = ubicarEscuelaEnRio({ punto: punto(CORRIENTES, EMPEDRADO, 0.3), estacionTramoId: 'pna-bella-vista', estaciones: ESTACIONES })
    if (u.estado === 'ubicada') expect([u.aguasArriba.estacionId, u.aguasAbajo.estacionId]).toContain('pna-bella-vista')
    else expect(u.motivo).toBe('fuera_de_tramo_interpolable')
  })
})

describe('tramoDeLocalidad', () => {
  const tramos: TramoAprobado[] = [{ estacionId: 'pna-corrientes', localidades: ['CORRIENTES', 'RIACHUELO'] }]
  it('normaliza acentos y mayúsculas y devuelve null si la localidad no tiene tramo', () => {
    expect(tramoDeLocalidad('Riachuelo ', tramos)).toBe('pna-corrientes')
    expect(tramoDeLocalidad('Mburucuyá', tramos)).toBeNull()
    expect(tramoDeLocalidad(null, tramos)).toBeNull()
  })
})
