// Tests puros de los adapters de nivel de río ANA y SGB: sin red ni base de datos.
import { describe, expect, it } from 'vitest'
import type { EvidenciaRioPrefectura } from '../puertos'
import {
  crearAdapterRioAna,
  crearAdapterRioSgb,
  DISTANCIA_RIBERA_MAXIMA_KM,
  RADIO_MAXIMO_ESTACION_KM,
  resolverEvidenciaNivelRio,
  type DatosNivelRio,
  type EstacionNivel,
  type LecturaNivel,
} from './rio-ana-sgb'

const CUE = '13000001'
const ASOF = '2026-11-13T12:00:00.000Z'
const HACE_1H = '2026-11-13T11:00:00.000Z'
const HACE_19H = '2026-11-12T17:00:00.000Z'
const HACE_18H = '2026-11-12T18:00:00.000Z'
const EN_15_MIN = '2026-11-13T12:15:00.000Z'
const EN_16_MIN = '2026-11-13T12:16:00.000Z'

// 0,01 grado de latitud son unos 1,11 km; 0,2 grados son unos 22 km.
const CERCA: EstacionNivel = { estacionId: 'ana-cerca', rio: 'negro', lat: -3.01, lon: -60.0, alertaM: 27, evacuacionM: 29 }
const LEJOS: EstacionNivel = { estacionId: 'ana-lejos', rio: 'negro', lat: -3.2, lon: -60.0, alertaM: 27, evacuacionM: 29 }
// 0,6 grados de latitud son unos 66,7 km: fuera del radio de 60 km.
const MUY_LEJOS: EstacionNivel = { ...CERCA, estacionId: 'ana-muy-lejos', lat: -3.6 }

function lectura(over: Partial<LecturaNivel> = {}): LecturaNivel {
  return {
    estacionId: 'ana-cerca',
    lecturaM: 16.28,
    variacionM: 0.05,
    medidaEn: HACE_1H,
    inconsistente: false,
    ...over,
  }
}

function datos(over: Partial<DatosNivelRio> = {}): DatosNivelRio {
  return {
    estaciones: [CERCA, LEJOS],
    ultimaLecturaPorEstacion: new Map([['ana-cerca', lectura()]]),
    coordenadasPorCue: new Map([[CUE, { lat: -3.0, lon: -60.0 }]]),
    distanciaRioKmPorCue: new Map<string, number | string | null>([[CUE, 0.4]]),
    ...over,
  }
}

function evidencia(ev: ReturnType<typeof resolverEvidenciaNivelRio>): EvidenciaRioPrefectura | undefined {
  return ev && !('disponibilidad' in ev) ? ev : undefined
}

describe('resolverEvidenciaNivelRio: exposición por proximidad a la ribera', () => {
  it('escuela a 0,4 km del río con lectura de 16,28 m bajo umbrales 27/29 es normal', () => {
    expect(resolverEvidenciaNivelRio(datos(), CUE, ASOF)).toEqual({
      cueAnexo: CUE,
      estacionId: 'ana-cerca',
      rio: 'negro',
      lecturaM: 16.28,
      alertaM: 27,
      evacuacionM: 29,
      variacionM: 0.05,
      medidaEn: HACE_1H,
      estado: 'normal',
      criterioExposicion: 'proximidad_ribera',
    })
  })

  it('elige la estación más cercana aunque la otra tenga una lectura mayor', () => {
    const d = datos({
      ultimaLecturaPorEstacion: new Map([
        ['ana-cerca', lectura()],
        ['ana-lejos', lectura({ estacionId: 'ana-lejos', lecturaM: 30 })],
      ]),
    })
    expect(evidencia(resolverEvidenciaNivelRio(d, CUE, ASOF))?.estacionId).toBe('ana-cerca')
  })

  it('pasa la cuenca de la estación ("solimoes") a la evidencia', () => {
    const solimoes: EstacionNivel = { ...CERCA, estacionId: 'ana-solimoes', rio: 'solimoes' }
    const d = datos({
      estaciones: [solimoes],
      ultimaLecturaPorEstacion: new Map([['ana-solimoes', lectura({ estacionId: 'ana-solimoes' })]]),
    })
    expect(evidencia(resolverEvidenciaNivelRio(d, CUE, ASOF))?.rio).toBe('solimoes')
  })

  it('acepta la distancia al río como texto numérico', () => {
    const d = datos({ distanciaRioKmPorCue: new Map([[CUE, '0.4']]) })
    expect(evidencia(resolverEvidenciaNivelRio(d, CUE, ASOF))?.estado).toBe('normal')
  })

  it('acepta una escuela exactamente a 1,0 km del río', () => {
    const d = datos({ distanciaRioKmPorCue: new Map([[CUE, DISTANCIA_RIBERA_MAXIMA_KM]]) })
    expect(evidencia(resolverEvidenciaNivelRio(d, CUE, ASOF))?.estacionId).toBe('ana-cerca')
  })

  it('devuelve null para una escuela a 1,5 km del río (sin exposición inventada)', () => {
    const d = datos({ distanciaRioKmPorCue: new Map([[CUE, 1.5]]) })
    expect(resolverEvidenciaNivelRio(d, CUE, ASOF)).toBeNull()
  })

  it('devuelve null sin distancia al río (null o NaN)', () => {
    expect(resolverEvidenciaNivelRio(datos({ distanciaRioKmPorCue: new Map([[CUE, null]]) }), CUE, ASOF)).toBeNull()
    expect(resolverEvidenciaNivelRio(datos({ distanciaRioKmPorCue: new Map([[CUE, Number.NaN]]) }), CUE, ASOF)).toBeNull()
    expect(resolverEvidenciaNivelRio(datos({ distanciaRioKmPorCue: new Map() }), CUE, ASOF)).toBeNull()
  })

  it('devuelve null sin coordenadas de la escuela', () => {
    expect(resolverEvidenciaNivelRio(datos({ coordenadasPorCue: new Map() }), CUE, ASOF)).toBeNull()
  })

  it('devuelve null si la estación más cercana está a más de 60 km', () => {
    expect(RADIO_MAXIMO_ESTACION_KM).toBe(60)
    const d = datos({ estaciones: [MUY_LEJOS] })
    expect(resolverEvidenciaNivelRio(d, CUE, ASOF)).toBeNull()
  })

  it('devuelve null sin estaciones', () => {
    expect(resolverEvidenciaNivelRio(datos({ estaciones: [] }), CUE, ASOF)).toBeNull()
  })
})

describe('resolverEvidenciaNivelRio: estado por umbrales', () => {
  it.each([
    [27.0, 'alerta'],
    [27.4, 'alerta'],
    [28.99, 'alerta'],
    [29.0, 'evacuacion'],
    [31.2, 'evacuacion'],
  ])('lectura %s m con umbrales 27/29 da %s', (lecturaM, estado) => {
    const d = datos({ ultimaLecturaPorEstacion: new Map([['ana-cerca', lectura({ lecturaM })]]) })
    expect(evidencia(resolverEvidenciaNivelRio(d, CUE, ASOF))?.estado).toBe(estado)
  })
})

describe('resolverEvidenciaNivelRio: sin dato', () => {
  function sinDato(d: DatosNivelRio) {
    return resolverEvidenciaNivelRio(d, CUE, ASOF)
  }
  const base = { cueAnexo: CUE, estacionId: 'ana-cerca', rio: 'negro', disponibilidad: 'sin_dato' }

  it('estación sin umbrales de alerta o evacuación', () => {
    const sinAlerta = datos({ estaciones: [{ ...CERCA, alertaM: null }] })
    expect(sinDato(sinAlerta)).toEqual({ ...base, motivo: 'estación sin umbrales' })
    const sinEvacuacion = datos({ estaciones: [{ ...CERCA, evacuacionM: null }] })
    expect(sinDato(sinEvacuacion)).toEqual({ ...base, motivo: 'estación sin umbrales' })
  })

  it('sin última lectura de la estación', () => {
    expect(sinDato(datos({ ultimaLecturaPorEstacion: new Map() }))).toEqual({ ...base, motivo: 'sin lectura' })
  })

  it('lectura no numérica', () => {
    const d = datos({ ultimaLecturaPorEstacion: new Map([['ana-cerca', lectura({ lecturaM: null })]]) })
    expect(sinDato(d)).toEqual({ ...base, motivo: 'lectura no numérica' })
  })

  it('lectura marcada como inconsistente', () => {
    const d = datos({ ultimaLecturaPorEstacion: new Map([['ana-cerca', lectura({ inconsistente: true })]]) })
    expect(sinDato(d)).toEqual({ ...base, motivo: 'lectura inconsistente' })
  })

  it('lectura de 19 h de antigüedad es vencida (límite 18 h)', () => {
    const d = datos({ ultimaLecturaPorEstacion: new Map([['ana-cerca', lectura({ medidaEn: HACE_19H })]]) })
    expect(sinDato(d)).toEqual({ ...base, motivo: 'lectura vencida (> 18 h)' })
  })

  it('lectura de exactamente 18 h sigue vigente', () => {
    const d = datos({ ultimaLecturaPorEstacion: new Map([['ana-cerca', lectura({ medidaEn: HACE_18H })]]) })
    expect(evidencia(sinDato(d))?.estado).toBe('normal')
  })

  it('lectura con fecha no interpretable', () => {
    const d = datos({ ultimaLecturaPorEstacion: new Map([['ana-cerca', lectura({ medidaEn: 'ayer' })]]) })
    expect(sinDato(d)).toEqual({ ...base, motivo: 'fecha de lectura inválida' })
  })

  it('asOf no interpretable devuelve null', () => {
    expect(resolverEvidenciaNivelRio(datos(), CUE, 'hoy')).toBeNull()
  })

  it('lectura posterior a asOf en más de 15 min se descarta', () => {
    const d = datos({ ultimaLecturaPorEstacion: new Map([['ana-cerca', lectura({ medidaEn: EN_16_MIN })]]) })
    expect(sinDato(d)).toEqual({ ...base, motivo: 'lectura posterior a asOf' })
  })

  it('lectura hasta 15 min posterior a asOf se acepta', () => {
    const d = datos({ ultimaLecturaPorEstacion: new Map([['ana-cerca', lectura({ medidaEn: EN_15_MIN })]]) })
    expect(evidencia(sinDato(d))?.estado).toBe('normal')
  })
})

describe('crearAdapterRioAna / crearAdapterRioSgb', () => {
  it('el adapter ANA devuelve la evidencia y carga los datos una sola vez', async () => {
    let cargas = 0
    const adapter = crearAdapterRioAna({
      cargarDatos: async () => {
        cargas += 1
        return datos()
      },
    })
    const primera = await adapter.obtenerEvidencia({ cueAnexo: CUE, asOf: ASOF })
    const segunda = await adapter.obtenerEvidencia({ cueAnexo: CUE, asOf: ASOF })
    expect(primera).toEqual(resolverEvidenciaNivelRio(datos(), CUE, ASOF))
    expect(segunda).toEqual(primera)
    expect(cargas).toBe(1)
  })

  it('el adapter SGB devuelve la evidencia de la estación de Manaos', async () => {
    const sgb: EstacionNivel = { estacionId: 'amazonas_8', rio: 'negro', lat: -3.13667, lon: -60.02694, alertaM: 27, evacuacionM: 29 }
    const adapter = crearAdapterRioSgb({
      cargarDatos: async () =>
        datos({
          estaciones: [sgb],
          ultimaLecturaPorEstacion: new Map([['amazonas_8', lectura({ estacionId: 'amazonas_8', lecturaM: 27.4 })]]),
        }),
    })
    expect(await adapter.obtenerEvidencia({ cueAnexo: CUE, asOf: ASOF })).toMatchObject({
      estacionId: 'amazonas_8',
      rio: 'negro',
      estado: 'alerta',
      criterioExposicion: 'proximidad_ribera',
    })
  })

  it('una escuela sin vínculo a ribera devuelve null desde el adapter', async () => {
    const adapter = crearAdapterRioAna({
      cargarDatos: async () => datos({ distanciaRioKmPorCue: new Map([[CUE, 2]]) }),
    })
    expect(await adapter.obtenerEvidencia({ cueAnexo: CUE, asOf: ASOF })).toBeNull()
  })
})
