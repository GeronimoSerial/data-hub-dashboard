import { describe, expect, it } from 'vitest'
import { construirPuntosNivel, puntosRiesgoSobreSituacion, soloConDato, soloConDatoOJuntoLaguna } from './puntos-nivel'
import type { EscuelaMapaEnriquecida } from './tipos'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'

const escuelasRiesgo: EscuelaMapaEnriquecida[] = [
  { cueAnexo: 'a', nombre: 'Escuela Alfa', departamento: 'Goya', localidad: 'Centro', lat: -29.14, lon: -59.26, niveles: ['Primario'], alumnos: 20, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 0, solucionadasRecientes: 0 },
  { cueAnexo: 'b', nombre: 'Escuela Beta', departamento: 'Goya', localidad: 'Centro', lat: -29.15, lon: -59.27, niveles: ['Inicial'], alumnos: 10, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 0, solucionadasRecientes: 0 },
  { cueAnexo: 'c', nombre: 'Escuela Gamma', departamento: 'Goya', localidad: 'Centro', lat: -29.16, lon: -59.28, niveles: ['Secundario'], alumnos: 30, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 0, solucionadasRecientes: 0 },
]

const territorioRiesgo: TerritorioMapa = {
  aislamiento: {
    fuente: 'OpenStreetMap', atribucion: '© OpenStreetMap contributors', licencia: 'ODbL', fechaExtractoOsm: '2026-01-01', versionJob: '1',
    escuelas: {
      a: { nivel: 3, cruces: 1, conPuente: 0, sinPuente: 1, alternativaSinCruce: false },
      b: { nivel: 'sin_datos_red', cruces: null, conPuente: null, sinPuente: null, alternativaSinCruce: null },
      c: { nivel: 1, cruces: 0, conPuente: 0, sinPuente: 0, alternativaSinCruce: true },
    },
  },
  susceptibilidad: {
    fuente: 'physrisk', indicador: 'inundacion_fluvial', escenario: 'historico', unidad: 'm', periodoRetornoAnios: 100, fechaCorrida: '2026-01-01', licencia: 'licencia',
    escuelas: { a: { inundacionFluvialM: 1, claseRio: "alto", juntoLaguna: null }, b: { inundacionFluvialM: 0.5, claseRio: "medio", juntoLaguna: null }, c: { inundacionFluvialM: 0, claseRio: "sin_riesgo", juntoLaguna: null } },
  },
}

describe('construirPuntosNivel', () => {
  it('conserva el orden y una feature por escuela con coordenadas', () => {
    const puntos = construirPuntosNivel(
      [
        { cueAnexo: 'cue-1', lat: -27.5, lon: -58.8 },
        { cueAnexo: 'sin-coordenadas', lat: null, lon: -58.7 },
        { cueAnexo: 'cue-2', lat: -27.4, lon: -58.6 },
        { cueAnexo: 'sin-longitud', lat: -27.2, lon: null },
        { cueAnexo: 'cue-1', lat: -27.3, lon: -58.5 },
      ],
      new Map([['cue-1', '#f00']]),
    )

    expect(puntos.features.map(({ properties }) => properties.cueAnexo)).toEqual([
      'cue-1', 'cue-2', 'cue-1',
    ])
    expect(puntos.features.map(({ properties }) => [properties.color, properties.conDato])).toEqual([
      ['#f00', true],
      [undefined, false],
      ['#f00', true],
    ])
    expect(puntos.features.map(({ geometry }) => geometry.coordinates)).toEqual([
      [-58.8, -27.5], [-58.6, -27.4], [-58.5, -27.3],
    ])
  })

  it('devuelve sólo puntos con nivel de aislamiento', () => {
    const aisladas = puntosRiesgoSobreSituacion(escuelasRiesgo, territorioRiesgo)
    expect(aisladas.features.map(({ properties }) => properties.cueAnexo)).toEqual(['a', 'c'])
    expect(aisladas.features.every(({ properties }) => properties.conDato)).toBe(true)
    expect(puntosRiesgoSobreSituacion(escuelasRiesgo, null).features).toEqual([])
  })

  it('soloConDato descarta las escuelas sin color y conserva el orden', () => {
    const puntos = construirPuntosNivel(
      [{ cueAnexo: 'a', lat: -29, lon: -59 }, { cueAnexo: 'b', lat: -29, lon: -59 }, { cueAnexo: 'c', lat: -29, lon: -59 }],
      new Map([['c', '#0f0'], ['a', '#f00']]),
    )
    expect(soloConDato(puntos).features.map(({ properties }) => properties.cueAnexo)).toEqual(['a', 'c'])
  })

  it('marca junto a laguna sin alterar el color del nivel de río', () => {
    const puntos = construirPuntosNivel(
      [{ cueAnexo: 'a', lat: -29, lon: -59 }, { cueAnexo: 'b', lat: -29, lon: -59 }],
      new Map([['a', '#f00']]),
      new Set(['a', 'b']),
    )
    expect(puntos.features.map(({ properties }) => [properties.color, properties.conDato, properties.juntoLaguna])).toEqual([
      ['#f00', true, true],
      [undefined, false, true],
    ])
    expect(construirPuntosNivel([{ cueAnexo: 'a', lat: -29, lon: -59 }], new Map()).features[0].properties.juntoLaguna).toBe(false)
  })

  it('soloConDatoOJuntoLaguna conserva nivel de río y laguna, y descarta sin dato sin laguna', () => {
    const puntos = construirPuntosNivel(
      [
        { cueAnexo: 'rio', lat: -29, lon: -59 },
        { cueAnexo: 'laguna', lat: -29, lon: -59 },
        { cueAnexo: 'vacia', lat: -29, lon: -59 },
        { cueAnexo: 'rio-laguna', lat: -29, lon: -59 },
      ],
      new Map([['rio', '#0f0'], ['rio-laguna', '#00f']]),
      new Set(['laguna', 'rio-laguna']),
    )
    expect(soloConDatoOJuntoLaguna(puntos).features.map(({ properties }) => properties.cueAnexo)).toEqual(['rio', 'laguna', 'rio-laguna'])
    expect(soloConDato(puntos).features.map(({ properties }) => properties.cueAnexo)).toEqual(['rio', 'rio-laguna'])
  })
})
