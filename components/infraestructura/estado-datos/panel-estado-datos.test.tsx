// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { EstadoDatos, ItemEstadoDato } from '@/lib/infraestructura/riesgo/estado-datos/clasificar'
import { PanelEstadoDatos } from './panel-estado-datos'

afterEach(cleanup)

const GENERADO = '2026-10-17T22:00:00.000Z'

function item(parcial: Partial<ItemEstadoDato> & Pick<ItemEstadoDato, 'id' | 'estado'>): ItemEstadoDato {
  return {
    grupo: 'riesgo',
    nombre: parcial.id,
    motivo: 'Motivo.',
    ultimoExitoEn: '2026-10-17T19:00:00.000Z',
    ultimoIntentoEn: null,
    ultimoError: null,
    edadMinutos: 180,
    intervaloMinutos: 360,
    ...parcial,
  }
}

const TODO_OK: EstadoDatos = {
  items: [item({ id: 'run', nombre: 'Run de riesgo vigente', estado: 'ok' })],
  problemas: 0,
  generadoEn: GENERADO,
}

const CON_FALLA: EstadoDatos = {
  items: [
    item({
      id: 'clima',
      grupo: 'climatologias',
      nombre: 'Climatología de caudal',
      estado: 'fallido',
      motivo: 'Falló la última corrida (intento 3).',
      ultimoError: 'GloFAS respondió 503',
    }),
    item({ id: 'pref', grupo: 'hidrometria', nombre: 'Lecturas de Prefectura', estado: 'atrasado' }),
    item({ id: 'run', nombre: 'Run de riesgo vigente', estado: 'ok' }),
    item({ id: 'seas', grupo: 'lluvia', nombre: 'Pronóstico estacional', estado: 'deshabilitado', ultimoExitoEn: null, edadMinutos: null }),
  ],
  problemas: 2,
  generadoEn: GENERADO,
}

describe('PanelEstadoDatos', () => {
  it('cerrado y con resumen "al día" cuando no hay problemas', () => {
    render(<PanelEstadoDatos estado={TODO_OK} />)
    const panel = screen.getByTestId('estado-datos')
    expect(panel).not.toHaveAttribute('open')
    expect(screen.getByText('Todos los datos al día')).toBeInTheDocument()
  })

  it('abierto y resaltado con problemas, con el fallido primero y su error', () => {
    render(<PanelEstadoDatos estado={CON_FALLA} />)
    const panel = screen.getByTestId('estado-datos')
    expect(panel).toHaveAttribute('open')
    expect(panel).toHaveAttribute('data-problemas', 'true')
    expect(screen.getByText('2 fuentes con problemas')).toBeInTheDocument()

    const filas = screen.getAllByTestId('estado-datos-item')
    expect(filas[0]).toHaveTextContent('Climatología de caudal')
    expect(filas[0]).toHaveTextContent('GloFAS respondió 503')
    expect(filas[1]).toHaveTextContent('Lecturas de Prefectura')
    expect(filas.at(-1)).toHaveTextContent('Pronóstico estacional')
  })

  it('el estado se comunica con texto, no sólo color, y la fecha es relativa y absoluta', () => {
    render(<PanelEstadoDatos estado={CON_FALLA} />)
    const [primera] = screen.getAllByTestId('estado-datos-item')
    expect(within(primera).getByText('Falló')).toBeInTheDocument()
    expect(within(primera).getByText('hace 3 h')).toBeInTheDocument()
    expect(within(primera).getByText(/Último éxito 17\/10\/2026, 16:00/)).toBeInTheDocument()
    expect(screen.getByText('No programado')).toBeInTheDocument()
    expect(screen.getByText('Desactualizado')).toBeInTheDocument()
  })

  it('agrupa por área con encabezados', () => {
    render(<PanelEstadoDatos estado={CON_FALLA} />)
    expect(screen.getByRole('heading', { name: 'Climatologías' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hidrometría' })).toBeInTheDocument()
  })

  it('pausa operativa: abierto, con problema y sin "Todos los datos al día"', () => {
    const PAUSADO: EstadoDatos = {
      items: [
        item({ id: 'clima', grupo: 'climatologias', nombre: 'Climatología de caudal', estado: 'pausado', motivo: 'Jobs batch detenidos por pausa operativa (ENOS_JOBS_ENABLED=false).' }),
        item({ id: 'seas', grupo: 'lluvia', nombre: 'Pronóstico estacional', estado: 'deshabilitado', ultimoExitoEn: null, edadMinutos: null }),
      ],
      problemas: 1,
      generadoEn: GENERADO,
    }
    render(<PanelEstadoDatos estado={PAUSADO} />)
    expect(screen.getByTestId('estado-datos')).toHaveAttribute('open')
    expect(screen.getByText('1 fuente con problemas')).toBeInTheDocument()
    expect(screen.queryByText('Todos los datos al día')).not.toBeInTheDocument()
    const [primera] = screen.getAllByTestId('estado-datos-item')
    expect(within(primera).getByText('Pausado')).toBeInTheDocument()
    expect(screen.getByText('No programado')).toBeInTheDocument()
  })

  it('sin lectura del estado: abierto y avisando, nunca "al día"', () => {
    render(<PanelEstadoDatos estado={null} />)
    expect(screen.getByTestId('estado-datos')).toHaveAttribute('open')
    expect(screen.getByText('No se pudo leer el estado de los datos')).toBeInTheDocument()
    expect(screen.queryByText('Todos los datos al día')).not.toBeInTheDocument()
  })
})
