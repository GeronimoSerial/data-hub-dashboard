// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CentroEvacuadosRespuesta } from '@/lib/infraestructura/evacuacion/respuesta'
import { BloqueCentroEvacuados } from './bloque-centro-evacuados'

afterEach(cleanup)

const destino = { cueAnexo: '1800002-00', nombre: 'Escuela N° 2 Los Aromos', lat: -28.2, lon: -58.2 }
const base = { visible: false, cargando: false, error: false, respuesta: null as CentroEvacuadosRespuesta | null }

describe('BloqueCentroEvacuados', () => {
  it('muestra el botón y lo dispara al hacer click', async () => {
    const onAlternar = vi.fn()
    render(<BloqueCentroEvacuados {...base} onAlternar={onAlternar} />)
    const boton = screen.getByRole('button', { name: 'Mostrar camino al centro de evacuados más cercano' })
    expect(boton).toHaveAttribute('aria-pressed', 'false')
    await userEvent.setup().click(boton)
    expect(onAlternar).toHaveBeenCalledTimes(1)
  })

  it('visible: el botón pasa a ocultar y muestra destino y distancia por camino', () => {
    render(<BloqueCentroEvacuados {...base} visible onAlternar={vi.fn()}
      respuesta={{ cueAnexo: 'A', apto: false, disponible: true, tipo: 'camino', destino, distanciaKm: 5.1, distanciaRectaKm: 4.2 }} />)
    expect(screen.getByRole('button', { name: 'Ocultar camino al centro de evacuados' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Escuela N° 2 Los Aromos')).toBeInTheDocument()
    expect(screen.getByText('5,1 km por camino')).toBeInTheDocument()
  })

  it('sin ruta OSM rotula la línea recta', () => {
    render(<BloqueCentroEvacuados {...base} visible onAlternar={vi.fn()}
      respuesta={{ cueAnexo: 'A', apto: false, disponible: true, tipo: 'linea_recta', destino, distanciaKm: 4.2, distanciaRectaKm: 4.2 }} />)
    expect(screen.getByText('4,2 km en línea recta (sin camino calculado)')).toBeInTheDocument()
  })

  it.each([
    ['sin_calculo', 'Todavía no se calculó el centro de evacuados más cercano.'],
    ['sin_destino_apto', 'No hay otro posible centro de evacuados para esta escuela.'],
  ] as const)('sin destino (%s) explica el motivo', (motivoSinDestino, texto) => {
    render(<BloqueCentroEvacuados {...base} visible onAlternar={vi.fn()} respuesta={{ cueAnexo: 'A', apto: false, disponible: false, motivoSinDestino }} />)
    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it('muestra estados de carga y error cuando está visible', () => {
    const { rerender } = render(<BloqueCentroEvacuados {...base} visible cargando onAlternar={vi.fn()} />)
    expect(screen.getByText('Buscando el centro de evacuados más cercano…')).toBeInTheDocument()
    rerender(<BloqueCentroEvacuados {...base} visible error onAlternar={vi.fn()} />)
    expect(screen.getByText('No se pudo cargar el centro de evacuados más cercano.')).toBeInTheDocument()
  })
})
