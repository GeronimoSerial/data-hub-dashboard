// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'
import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import { BloqueAcceso } from './bloque-acceso'

afterEach(cleanup)

const geometria: GeometriaAccesoRespuesta = {
  cueAnexo: '1801605-04',
  disponible: true,
  ruta: { type: 'LineString', coordinates: [[0, 0], [0.01, 0]] },
  cruces: [
    { lon: 0.003, lat: 0.001, clasificacion: 'vado' },
    { lon: 0.006, lat: 0.002, clasificacion: 'sin_evidencia' },
  ],
  resumen: { puente: 0, vado: 1, sinEvidencia: 1 },
}

function exposicion(
  estado: ExposicionRutaRespuesta['estado'],
  profundidadMaxM: number | null,
  claseRuta: ExposicionRutaRespuesta['claseRuta'] = null,
): ExposicionRutaRespuesta {
  return {
    cueAnexo: '1801605-04',
    disponible: true,
    estado,
    claseRuta,
    versionJob: null,
    resumen: { celdasTotal: 0, celdasConDato: 0, celdasConProfundidad: 0, profundidadMaxM, cobertura: 0 },
    celdasAfectadas: [],
    resolucionArcsec: null,
    periodoRetornoAnios: null,
    escenario: null,
    fuente: null,
    licencia: null,
    fechaCorrida: null,
    aviso: '',
  }
}

describe('BloqueAcceso', () => {
  it('muestra las tres líneas con el copy exacto y sus íconos', () => {
    render(
      <BloqueAcceso geometria={geometria} exposicion={exposicion('con_profundidad', 0.5, 'alto')} claseEscuela="alto" />,
    )

    expect(screen.getByText('Camino de acceso · 1,1 km')).toBeInTheDocument()
    expect(screen.getByText('2 cruces de agua en el camino')).toBeInTheDocument()
    expect(screen.getByText('1 vado · 1 sin puente registrado')).toBeInTheDocument()
    expect(screen.getByText('Riesgo alto de inundación en la escuela')).toBeInTheDocument()
    expect(screen.getByText('Riesgo alto de inundación en el camino')).toBeInTheDocument()
    expect(screen.getByTestId('bloque-acceso-via').querySelector('svg')).toBeInTheDocument()
    expect(screen.getByTestId('bloque-acceso-cruces').querySelector('svg')).toBeInTheDocument()
    expect(screen.getByTestId('bloque-acceso-cruces-icono')).toHaveAttribute('data-icono', 'alerta')
    expect(screen.getByTestId('bloque-acceso-riesgo').querySelector('svg')).toBeInTheDocument()
  })

  it('separa la clase de la escuela del riesgo del camino', () => {
    render(
      <BloqueAcceso
        geometria={geometria}
        exposicion={exposicion('con_profundidad', 0, 'sin_riesgo')}
        claseEscuela="alto"
      />,
    )

    expect(screen.getByTestId('bloque-acceso-escuela')).toHaveTextContent('Riesgo alto de inundación en la escuela')
    expect(screen.getByTestId('bloque-acceso-riesgo')).toHaveTextContent('Sin riesgo de inundación en el camino')
    expect(screen.queryByText(/Riesgo de corte/)).not.toBeInTheDocument()
  })

  it('muestra "Junto a laguna" como tag junto a la escuela', () => {
    render(
      <BloqueAcceso geometria={geometria} exposicion={null} claseEscuela="bajo" juntoLaguna />,
    )

    expect(screen.getByTestId('bloque-acceso-escuela')).toHaveTextContent('Riesgo bajo de inundación en la escuela')
    expect(screen.getByTestId('bloque-acceso-laguna')).toHaveTextContent(/^Junto a laguna$/)
  })

  it('muestra la vía principal, el destino y la distancia informada', () => {
    render(
      <BloqueAcceso
        geometria={{
          ...geometria,
          viaPrincipal: { nombre: 'Ruta Provincial 13', tipo: 'primary', pavimentada: true },
          destino: { nombre: 'Saladas' },
          distanciaKm: 14,
        }}
        exposicion={null}
      />,
    )

    expect(screen.getByTestId('bloque-acceso-via'))
      .toHaveTextContent('Ruta Provincial 13 (pavimentada) → Saladas · 14 km')
  })

  it('muestra los cruces con puente sin advertencia', () => {
    render(
      <BloqueAcceso
        geometria={{
          ...geometria,
          cruces: [{ lon: 0.003, lat: 0.001, clasificacion: 'puente' }],
          resumen: { puente: 1, vado: 0, sinEvidencia: 0 },
        }}
        exposicion={null}
      />,
    )

    expect(screen.getByText('1 cruce de agua en el camino')).toBeInTheDocument()
    expect(screen.getByText('1 con puente')).toBeInTheDocument()
    expect(screen.getByTestId('bloque-acceso-cruces-icono')).toHaveAttribute('data-icono', 'ok')
  })

  it('muestra el mensaje de ausencia de acceso', () => {
    render(<BloqueAcceso geometria={null} exposicion={null} />)
    expect(screen.getByText('Sin acceso calculado')).toBeInTheDocument()
  })

  it('muestra "Camino: Sin dato" cuando hay ruta pero no exposición', () => {
    render(<BloqueAcceso geometria={geometria} exposicion={null} />)
    expect(screen.getByTestId('bloque-acceso-riesgo')).toHaveTextContent('Sin dato de inundación en el camino')
    expect(screen.getByTestId('bloque-acceso-escuela')).toHaveTextContent('Sin dato de inundación en la escuela')
  })

  it('muestra "Camino: Sin ruta" cuando no hay recorrido', () => {
    render(<BloqueAcceso geometria={null} exposicion={null} claseEscuela="medio" />)
    expect(screen.getByTestId('bloque-acceso-escuela')).toHaveTextContent('Riesgo medio de inundación en la escuela')
    expect(screen.getByTestId('bloque-acceso-riesgo')).toHaveTextContent('Sin camino calculado')
  })

  it.each([
    ['cargando', { cargando: true }, 'Calculando el acceso…'],
    ['error', { error: true }, 'No se pudo calcular el acceso.'],
  ] as const)('muestra el estado de %s', (_estado, props, texto) => {
    render(<BloqueAcceso geometria={null} exposicion={null} {...props} />)
    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it('enlaza cada riesgo a su sección de metodología', () => {
    render(<BloqueAcceso geometria={null} exposicion={null} claseEscuela="alto" />)
    const links = screen.getAllByRole('link', { name: 'Cómo se calcula' })
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/mapas/infraestructura#metodologia/inundacion-clases-rio',
      '/mapas/infraestructura#metodologia/inundacion-ruta-acceso',
    ])
  })
})
