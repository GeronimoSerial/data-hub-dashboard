// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EvolucionMapa } from '@/lib/infraestructura/evolucion'
import { EvolucionPanel } from './evolucion-panel'

// Respuesta de ejemplo con forma EXACTA de EvolucionMapa: si el panel
// pidiera otro campo, el tipado en runtime se caería acá y no en producción.
const DATOS: EvolucionMapa = {
  serieEscuelasServicioCaido: [
    { fecha: '2026-09-01', escuelas: 3 },
    { fecha: '2026-09-02', escuelas: 5 },
  ],
  rankingDepartamentos: [
    { departamento: 'Capital', escuelasAfectadas: 4, alumnosAlcanzados: 120 },
    { departamento: 'Goya', escuelasAfectadas: 2, alumnosAlcanzados: 60 },
  ],
  distribucionMotivo: [{ motivo: 'Inundación', afectacionesVigentes: 7 }],
  alumnosAcumulados: [
    { fecha: '2026-09-01', alumnosAcumulados: 10 },
    { fecha: '2026-09-02', alumnosAcumulados: 25 },
  ],
}

const fetchEvolucion = vi.fn()

beforeEach(() => {
  fetchEvolucion.mockReset()
  fetchEvolucion.mockResolvedValue({ ok: true, json: async () => DATOS })
  vi.stubGlobal('fetch', fetchEvolucion)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('EvolucionPanel — consumo del endpoint de evolución', () => {
  it('pide la evolución una sola vez al montar', async () => {
    render(<EvolucionPanel />)

    await screen.findByRole('tab', { name: 'Servicio caído' })
    expect(fetchEvolucion).toHaveBeenCalledTimes(1)
    expect(fetchEvolucion).toHaveBeenCalledWith('/api/mapas/infraestructura/evolucion')
  })

  it('muestra el ranking de departamentos como tabla con los datos del endpoint', async () => {
    render(<EvolucionPanel />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Departamentos' }))

    const tabla = await screen.findByRole('table')
    expect(within(tabla).getByRole('columnheader', { name: 'Escuelas afectadas' })).toBeInTheDocument()
    // La primera columna son th[scope=row] (encabezado de fila), no td.
    expect(within(tabla).getByRole('rowheader', { name: 'Capital' })).toBeInTheDocument()
    expect(within(tabla).getByRole('cell', { name: '4' })).toBeInTheDocument()
    expect(within(tabla).getByRole('cell', { name: '120' })).toBeInTheDocument()
    expect(within(tabla).getByRole('rowheader', { name: 'Goya' })).toBeInTheDocument()
    expect(within(tabla).getByRole('cell', { name: '60' })).toBeInTheDocument()
  })

  it('la vista de alumnos acumulados explica que NO es el indicador del mapa', async () => {
    render(<EvolucionPanel />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Alumnos acumulados' }))

    expect(await screen.findByText('No es el indicador del mapa')).toBeInTheDocument()
    expect(
      screen.getByText(/cuántos alumnos están afectados/i),
    ).toBeInTheDocument()
  })

  it('las cuatro vistas son navegables por sus pestañas', async () => {
    render(<EvolucionPanel />)

    expect(await screen.findByRole('tab', { name: 'Servicio caído' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Departamentos' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Motivos' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Alumnos acumulados' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Motivos' }))
    expect(await screen.findByText('Distribución por motivo')).toBeInTheDocument()
  })

  it('ante un error del endpoint muestra el mensaje y no una grilla vacía', async () => {
    fetchEvolucion.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    render(<EvolucionPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTP 500/)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
