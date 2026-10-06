// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { PronosticoHorizonte } from '@/lib/infraestructura/radar-meteo/pronostico-horizonte'
import { PronosticoResumen } from './pronostico-resumen'

const pronostico: PronosticoHorizonte = {
  dias: 3,
  conLluvia20mm: 1,
  rafagaMax: { kmh: 70, departamento: 'Bella Vista' },
  conGranizo: 2,
  filas: [
    { id: 'alv', nombre: 'Alvear', lluviaMm: 12.5, probabilidadMax: 80, rafagaMaxKmh: 45, granizoPosible: false },
    { id: 'bv', nombre: 'Bella Vista', lluviaMm: 25, probabilidadMax: null, rafagaMaxKmh: 70, granizoPosible: true },
    { id: 'goy', nombre: 'Goya', lluviaMm: null, probabilidadMax: null, rafagaMaxKmh: null, granizoPosible: true },
  ],
}

function renderResumen(overrides: Partial<React.ComponentProps<typeof PronosticoResumen>> = {}) {
  return render(<PronosticoResumen
    pronostico={pronostico}
    horizonte={72}
    runAt="2026-10-06T12:00:00Z"
    departamentoId={null}
    onDepartamento={vi.fn()}
    {...overrides}
  />)
}

describe('PronosticoResumen', () => {
  afterEach(cleanup)

  it('muestra los indicadores, fecha y departamentos en el orden recibido', () => {
    renderResumen()
    const kpis = screen.getByLabelText('Resumen del pronóstico')
    expect(within(kpis).getByText('1')).toBeInTheDocument()
    expect(within(kpis).getByText('70 km/h')).toBeInTheDocument()
    expect(within(kpis).getByText('Bella Vista')).toBeInTheDocument()
    expect(within(kpis).getByText('2')).toBeInTheDocument()
    const filas = screen.getAllByRole('button').filter((boton) => boton.className.includes('map-sitact__fila'))
    expect(filas.map((fila) => within(fila).getByText(/Alvear|Bella Vista|Goya/).textContent)).toEqual(['Alvear', 'Bella Vista', 'Goya'])
    expect(screen.getByText('12,5 mm')).toBeInTheDocument()
    expect(screen.getByText('Sin dato')).toBeInTheDocument()
    expect(screen.getByText('La probabilidad de lluvia corresponde a las próximas 48 h.')).toBeInTheDocument()
    expect(screen.getByText(/^Actualizado /)).toBeInTheDocument()
  })

  it('permite seleccionar y quitar la selección de un departamento', () => {
    const onDepartamento = vi.fn()
    const { rerender } = renderResumen({ onDepartamento })
    fireEvent.click(screen.getByRole('button', { name: 'Alvear, 12,5 mm' }))
    expect(onDepartamento).toHaveBeenCalledWith('alv')
    rerender(<PronosticoResumen pronostico={pronostico} horizonte={72} runAt={null} departamentoId="alv" onDepartamento={onDepartamento} />)
    fireEvent.click(screen.getByRole('button', { name: 'Alvear, 12,5 mm' }))
    expect(onDepartamento).toHaveBeenLastCalledWith(null)
  })

  it('permite desplegar más de ocho departamentos', () => {
    const filas = Array.from({ length: 12 }, (_, indice) => ({ ...pronostico.filas[0], id: `${indice}`, nombre: `Departamento ${indice}` }))
    renderResumen({ pronostico: { ...pronostico, filas } })
    expect(screen.getAllByRole('button').filter((boton) => boton.className.includes('map-sitact__fila'))).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'Ver los 12 departamentos' }))
    expect(screen.getAllByRole('button').filter((boton) => boton.className.includes('map-sitact__fila'))).toHaveLength(12)
    expect(screen.getByRole('button', { name: 'Ver menos' })).toBeInTheDocument()
  })

  it('muestra la ventana correcta por horizonte y la nota de probabilidad sólo cuando corresponde', () => {
    const { rerender } = renderResumen({ horizonte: 24 })
    expect(screen.getByText('Próximas 24 h')).toBeInTheDocument()
    expect(screen.queryByText('La probabilidad de lluvia corresponde a las próximas 48 h.')).not.toBeInTheDocument()
    rerender(<PronosticoResumen pronostico={pronostico} horizonte={240} runAt={null} departamentoId={null} onDepartamento={() => {}} />)
    expect(screen.getByText('Próximos 3 días')).toBeInTheDocument()
    expect(screen.getByText('La probabilidad de lluvia corresponde a las próximas 48 h.')).toBeInTheDocument()
    rerender(<PronosticoResumen pronostico={{ ...pronostico, dias: 1 }} horizonte={240} runAt={null} departamentoId={null} onDepartamento={() => {}} />)
    expect(screen.getByText('Próximo día')).toBeInTheDocument()
  })
})
