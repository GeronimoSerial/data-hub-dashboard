import { describe, expect, it } from 'vitest'
import type { CentroEvacuadosRespuesta } from './respuesta'
import { construirCaminoCentro, construirPuntosPosiblesCentros, etiquetaDistanciaCentro } from './mapa'

const destino = { cueAnexo: '1800002-00', nombre: 'Escuela B', lat: -28.2, lon: -58.2 }
const resp = (c: Partial<CentroEvacuadosRespuesta> = {}): CentroEvacuadosRespuesta => ({ cueAnexo: 'A', apto: false, disponible: true, destino, ...c })

describe('construirPuntosPosiblesCentros', () => {
  it('incluye sólo escuelas aptas con coordenadas', () => {
    const fc = construirPuntosPosiblesCentros([
      { cueAnexo: 'A', nombre: 'A', lat: -28, lon: -58, posibleCentroEvacuados: true },
      { cueAnexo: 'B', nombre: 'B', lat: -28, lon: -58, posibleCentroEvacuados: false },
      { cueAnexo: 'C', nombre: 'C', lat: -28, lon: -58 },
      { cueAnexo: 'D', nombre: 'D', lat: null, lon: null, posibleCentroEvacuados: true },
    ])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0]).toMatchObject({ geometry: { type: 'Point', coordinates: [-58, -28] }, properties: { cueAnexo: 'A' } })
  })
})

describe('construirCaminoCentro', () => {
  it('no dibuja nada sin destino o con respuesta no disponible', () => {
    expect(construirCaminoCentro(null, { lat: -28, lon: -58 })).toBeNull()
    expect(construirCaminoCentro({ cueAnexo: 'A', apto: false, disponible: false, motivoSinDestino: 'sin_calculo' }, { lat: -28, lon: -58 })).toBeNull()
  })

  it('camino: usa exactamente la ruta OSM y marca el destino', () => {
    const ruta = { type: 'LineString' as const, coordinates: [[-58, -28], [-58.1, -28.1], [-58.2, -28.2]] as Array<[number, number]> }
    const c = construirCaminoCentro(resp({ tipo: 'camino', ruta }), { lat: -28, lon: -58 })
    expect(c?.linea.features[0].geometry.coordinates).toEqual(ruta.coordinates)
    expect(c?.linea.features[0].properties).toEqual({ tipo: 'camino' })
    expect(c?.destino.features[0]).toMatchObject({ geometry: { coordinates: [-58.2, -28.2] }, properties: { nombre: 'Escuela B' } })
  })

  it('línea recta: une origen y destino y queda rotulada como línea recta', () => {
    const c = construirCaminoCentro(resp({ tipo: 'linea_recta' }), { lat: -28, lon: -58 })
    expect(c?.linea.features[0].geometry.coordinates).toEqual([[-58, -28], [-58.2, -28.2]])
    expect(c?.linea.features[0].properties).toEqual({ tipo: 'linea_recta' })
  })

  it('línea recta sin origen conocido no puede dibujarse', () => {
    expect(construirCaminoCentro(resp({ tipo: 'linea_recta' }), null)).toBeNull()
  })
})

describe('etiquetaDistanciaCentro', () => {
  it('camino: distancia por camino', () => {
    expect(etiquetaDistanciaCentro(resp({ tipo: 'camino', distanciaKm: 5.1 }))).toBe('5,1 km por camino')
  })
  it('línea recta: aclara que no es por camino', () => {
    expect(etiquetaDistanciaCentro(resp({ tipo: 'linea_recta', distanciaKm: 4.2 }))).toBe('4,2 km en línea recta (sin camino calculado)')
  })
})
