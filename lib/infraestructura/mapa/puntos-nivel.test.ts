import { describe, expect, it } from 'vitest'
import { construirPuntosNivel, puntosRiesgoSobreSituacion } from './puntos-nivel'
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
    escuelas: { a: { inundacionFluvialM: 1, claseRio: "alto" }, b: { inundacionFluvialM: 0.5, claseRio: "medio" }, c: { inundacionFluvialM: 0, claseRio: "sin_riesgo" } },
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

  it('devuelve sólo puntos con nivel territorial y respeta la vista', () => {
    const aisladas = puntosRiesgoSobreSituacion(escuelasRiesgo, 'aisladas', territorioRiesgo)
    const inundacion = puntosRiesgoSobreSituacion(escuelasRiesgo, 'inundacion', territorioRiesgo)
    expect(aisladas.features.map(({ properties }) => properties.cueAnexo)).toEqual(['a', 'c'])
    expect(inundacion.features.map(({ properties }) => properties.cueAnexo)).toEqual(['a', 'b'])
    expect(aisladas.features.every(({ properties }) => properties.conDato)).toBe(true)
    expect(puntosRiesgoSobreSituacion(escuelasRiesgo, 'aisladas', null).features).toEqual([])
  })
})
