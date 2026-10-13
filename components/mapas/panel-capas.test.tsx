// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import { CAPAS_VISIBLES_DEFAULT, type CapasVisibles } from '@/lib/infraestructura/mapa/capas'
import { PanelCapas } from './panel-capas'

describe('PanelCapas · Situación actual', () => {
  it('muestra el grupo "Situación actual" con la capa de estaciones del río activa', () => {
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={() => {}} haySeleccion={false} />)

    expect(screen.getByRole('group', { name: 'Situación actual' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Estaciones de Prefectura (altura de ríos)' }).getAttribute('aria-checked')).toBe('true')
  })

  it('apaga la capa de estaciones del río al desactivar su interruptor', async () => {
    const cambios = vi.fn<(visibles: CapasVisibles) => void>()
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={cambios} haySeleccion={false} />)

    await userEvent.click(screen.getByRole('switch', { name: 'Estaciones de Prefectura (altura de ríos)' }))
    expect(cambios).toHaveBeenCalledWith({ ...CAPAS_VISIBLES_DEFAULT, estacionesRio: false })
  })
})

describe('PanelCapas · lluvia observada', () => {
  it('muestra el interruptor de lluvia IMERG activo y, encendido, el selector 24 h / 72 h', () => {
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={() => {}} haySeleccion={false} horasLluvia={72} onHorasLluviaChange={() => {}} />)

    expect(screen.getByRole('switch', { name: 'Lluvia observada (satélite IMERG)' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: '72 h' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '24 h' })).toBeTruthy()
  })

  it('oculta el selector de horas cuando la lluvia observada está apagada', () => {
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={{ ...CAPAS_VISIBLES_DEFAULT, lluviaObservada: false }} onCapasVisiblesChange={() => {}} haySeleccion={false} horasLluvia={72} onHorasLluviaChange={() => {}} />)

    expect(screen.queryByRole('radio', { name: '24 h' })).toBeNull()
  })

  it('apaga la lluvia observada al desactivar su interruptor y cambia la ventana a 24 h', async () => {
    const cambios = vi.fn<(visibles: CapasVisibles) => void>()
    const horas = vi.fn()
    const { rerender } = render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={cambios} haySeleccion={false} horasLluvia={72} onHorasLluviaChange={horas} />)

    await userEvent.click(screen.getByRole('switch', { name: 'Lluvia observada (satélite IMERG)' }))
    expect(cambios).toHaveBeenCalledWith({ ...CAPAS_VISIBLES_DEFAULT, lluviaObservada: false })

    await userEvent.click(screen.getByRole('radio', { name: '24 h' }))
    expect(horas).toHaveBeenCalledWith(24)
    rerender(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={cambios} haySeleccion={false} horasLluvia={24} onHorasLluviaChange={horas} />)
  })
})

afterEach(cleanup)

describe('PanelCapas', () => {
  it('muestra las opciones de mapa base y marca la seleccionada', () => {
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={() => {}} haySeleccion={false} />)

    expect(screen.getByRole('heading', { name: 'Mapa base' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Mapa base' })).toBeInTheDocument()
    for (const basemap of Object.values(BASEMAPS)) {
      expect(screen.getByRole('radio', { name: basemap.label })).toBeInTheDocument()
    }
    expect(screen.getByRole('radio', { name: BASEMAPS.voyager.label })).toBeChecked()
    const mapaBase = screen.getByRole('group', { name: 'Mapa base' })
    expect(within(mapaBase).getByRole('switch', { name: 'Límites de los departamentos' })).toBeChecked()
    expect(within(mapaBase).getByRole('switch', { name: 'Nombres de los departamentos' })).toBeChecked()
    const referencias = screen.getByRole('group', { name: 'Referencias' })
    expect(within(referencias).getByRole('switch', { name: 'Ruta de acceso de la escuela seleccionada' })).toBeChecked()
    expect(within(referencias).getByRole('switch', { name: 'Cruces de agua de la ruta' })).toBeChecked()
    expect(screen.getAllByText('Se muestra al seleccionar una escuela.')).toHaveLength(2)
  })

  it('notifica el mapa base elegido', async () => {
    const onChange = vi.fn<(id: BasemapId) => void>()
    render(<PanelCapas value="voyager" onChange={onChange} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={() => {}} haySeleccion />)

    await userEvent.click(within(screen.getByRole('group', { name: 'Mapa base' })).getByRole('radio', { name: BASEMAPS.positron.label }))
    expect(onChange).toHaveBeenCalledWith('positron')
    expect(screen.queryByText('Se muestra al seleccionar una escuela.')).not.toBeInTheDocument()
  })

  it.each([
    ['Límites de los departamentos', 'limitesDepartamentos'],
    ['Nombres de los departamentos', 'nombresDepartamentos'],
    ['Ruta de acceso de la escuela seleccionada', 'rutaAcceso'],
    ['Cruces de agua de la ruta', 'crucesAgua'],
  ] as const)('actualiza %s de forma independiente', async (etiqueta, clave) => {
    const cambios = vi.fn<(visibles: CapasVisibles) => void>()
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={cambios} haySeleccion={false} />)

    await userEvent.click(screen.getByRole('switch', { name: etiqueta }))
    expect(cambios).toHaveBeenCalledTimes(1)
    expect(cambios).toHaveBeenCalledWith({ ...CAPAS_VISIBLES_DEFAULT, [clave]: false })
  })

  it('muestra sólo Escuelas aisladas en el grupo Riesgo y su escala cuando está activa', async () => {
    const cambios = vi.fn<(visibles: CapasVisibles) => void>()
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={cambios} haySeleccion={false} riesgoDisponible />)
    const riesgo = screen.getByRole('group', { name: 'Riesgo' })
    const aisladas = within(riesgo).getByRole('switch', { name: 'Escuelas aisladas' })
    expect(aisladas).not.toBeChecked()
    expect(within(riesgo).getAllByRole('switch')).toHaveLength(1)
    expect(screen.queryByText('Riesgo de corte por inundación')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Escala de riesgo')).not.toBeInTheDocument()

    await userEvent.click(aisladas)
    expect(cambios).toHaveBeenCalledWith({ ...CAPAS_VISIBLES_DEFAULT, escuelasAisladas: true })
    cleanup()

    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={{ ...CAPAS_VISIBLES_DEFAULT, escuelasAisladas: true }} onCapasVisiblesChange={cambios} haySeleccion={false} riesgoDisponible />)
    expect(screen.queryByText('Se muestra una capa de riesgo a la vez.')).not.toBeInTheDocument()
    const escala = screen.getByLabelText('Escala de riesgo')
    expect(within(escala).getByText('Alto')).toBeInTheDocument()
    expect(within(escala).getByText('Medio')).toBeInTheDocument()
    expect(within(escala).getByText('Bajo')).toBeInTheDocument()
  })

  it('deshabilita la capa de riesgo si no hay contexto territorial', () => {
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={() => {}} haySeleccion={false} riesgoDisponible={false} />)
    const riesgo = screen.getByRole('group', { name: 'Riesgo' })
    expect(within(riesgo).getByRole('switch', { name: 'Escuelas aisladas' })).toHaveAttribute('aria-disabled', 'true')
    expect(within(riesgo).getByText('Los datos territoriales no están disponibles.')).toBeInTheDocument()
  })
})

describe('PanelCapas · eventos reportados', () => {
  it('muestra el interruptor de eventos reportados activo dentro de Situación actual', () => {
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={() => {}} haySeleccion={false} />)

    const grupo = screen.getByRole('group', { name: 'Situación actual' })
    expect(within(grupo).getByRole('switch', { name: 'Eventos reportados (últimos días)' }).getAttribute('aria-checked')).toBe('true')
  })

  it('apaga la capa de eventos reportados al desactivar su interruptor', async () => {
    const cambios = vi.fn<(visibles: CapasVisibles) => void>()
    render(<PanelCapas value="voyager" onChange={() => {}} capasVisibles={CAPAS_VISIBLES_DEFAULT} onCapasVisiblesChange={cambios} haySeleccion={false} />)

    await userEvent.click(screen.getByRole('switch', { name: 'Eventos reportados (últimos días)' }))
    expect(cambios).toHaveBeenCalledWith({ ...CAPAS_VISIBLES_DEFAULT, eventosReportados: false })
  })
})
