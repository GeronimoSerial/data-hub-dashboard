// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'
import { contextoCruceEnRuta, distanciaSobreRutaM, TarjetaCruceAgua } from './tarjeta-cruce-agua'

afterEach(cleanup)

// Straight east-west route at the equator: 0.01° of longitude ≈ 1.11 km.
const GEOMETRIA: GeometriaAccesoRespuesta = {
  cueAnexo: 'A',
  disponible: true,
  fechaExtractoOsm: '2026-09-26',
  ruta: { type: 'LineString', coordinates: [[0, 0], [0.01, 0], [0.03, 0]] },
  cruces: [
    { lon: 0.02, lat: 0.0001, clasificacion: 'vado', nombreCurso: 'Arroyo Ñaembé' },
    { lon: 0.005, lat: 0, clasificacion: 'puente', nombreCurso: 'Río Corriente', nombrePuente: 'Puente Pexoa' },
    { lon: 0.025, lat: 0, clasificacion: 'sin_evidencia' },
  ],
  viaPrincipal: { nombre: 'RP 12', tipo: 'secondary', pavimentada: false },
  destino: { nombre: 'Goya' },
  distanciaKm: 3.4,
}

describe('distanciaSobreRutaM', () => {
  it('mide desde el primer vértice hasta el punto más cercano de la línea', () => {
    expect(distanciaSobreRutaM([[0, 0], [0.01, 0], [0.03, 0]], [0.02, 0.0005])).toBeCloseTo(2224, -1)
    expect(distanciaSobreRutaM([[0, 0]], [0, 0])).toBeNull()
  })
})

describe('contextoCruceEnRuta', () => {
  it('ordena los cruces desde la escuela y cuenta los que no tienen puente', () => {
    expect(contextoCruceEnRuta(GEOMETRIA, 0)).toMatchObject({ orden: 2, total: 3, sinPuente: 2 })
    expect(contextoCruceEnRuta(GEOMETRIA, 1)?.orden).toBe(1)
  })

  it('invierte la ruta cuando la escuela está en el otro extremo', () => {
    const contexto = contextoCruceEnRuta(GEOMETRIA, 1, { lat: 0, lon: 0.03 })
    expect(contexto?.orden).toBe(3)
    expect(contexto?.distanciaEscuelaM).toBeCloseTo(2780, -1)
  })

  it('devuelve null sin ruta o sin el cruce pedido', () => {
    expect(contextoCruceEnRuta(null, 0)).toBeNull()
    expect(contextoCruceEnRuta({ ...GEOMETRIA, ruta: undefined }, 0)).toBeNull()
    expect(contextoCruceEnRuta(GEOMETRIA, 9)).toBeNull()
  })
})

describe('TarjetaCruceAgua', () => {
  it('muestra curso, puente, contexto de ruta, lluvia y crédito de OpenStreetMap', () => {
    render(
      <TarjetaCruceAgua
        clasificacion="puente"
        nombreCurso="Río Corriente"
        nombrePuente="Puente Pexoa"
        indice={1}
        escuela={{ nombre: 'Escuela 123', lat: 0, lon: 0 }}
        geometria={GEOMETRIA}
        lluvia={{ mm: 12.34, horas: 72 }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Río Corriente' })).toBeTruthy()
    expect(screen.getByText('Cruce de agua')).toBeTruthy()
    expect(screen.getByText('Puente: Puente Pexoa')).toBeTruthy()
    expect(screen.getByText('Cruce 1 de 3')).toBeTruthy()
    expect(screen.getByText('a 0,6 km')).toBeTruthy()
    expect(screen.queryByText('2 de 3')).toBeNull()
    expect(screen.getByText('12,3 mm')).toBeTruthy()
    expect(screen.getByText('Escuela 123')).toBeTruthy()
    expect(screen.getByText('Camino a Goya · 3,4 km')).toBeTruthy()
    expect(screen.getByText('Vía principal: RP 12 · sin pavimentar')).toBeTruthy()
    expect(screen.getByText('Mapa colaborativo OpenStreetMap')).toBeTruthy()
  })

  it('omite los datos que faltan y nunca afirma si hoy se puede pasar', () => {
    const { container } = render(<TarjetaCruceAgua clasificacion="vado" />)

    expect(screen.getByRole('heading', { name: 'Cruce de agua' })).toBeTruthy()
    expect(screen.queryByText(/Puente:/)).toBeNull()
    expect(screen.queryByText(/Cruce \d+ de/)).toBeNull()
    expect(screen.queryByText(/Lluvia observada/)).toBeNull()
    expect(screen.queryByText(/Camino a/)).toBeNull()
    expect(screen.getByText('Mapa colaborativo OpenStreetMap')).toBeTruthy()
    expect(container.textContent).not.toMatch(/es transitable|se puede pasar hoy|intransitable/i)
  })
})
