// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EvolucionMapa } from '@/lib/infraestructura/evolucion'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'
import { EvolucionPanel, recortarSerieAlRangoConDatos } from './evolucion-panel'

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
    render(<EvolucionPanel filtros={FILTROS_MAPA_VACIOS} />)

    await screen.findByRole('tab', { name: 'Servicio caído' })
    expect(fetchEvolucion).toHaveBeenCalledTimes(1)
    expect(fetchEvolucion).toHaveBeenCalledWith('/api/mapas/infraestructura/evolucion')
  })

  it('envía departamentos y niveles jurisdiccionales como parámetros repetidos en el orden recibido', async () => {
    const filtros: FiltrosMapa = {
      ...FILTROS_MAPA_VACIOS,
      departamentos: ['GOYA', 'ESQUINA'],
      direcciones: [3, 1],
    }
    render(<EvolucionPanel filtros={filtros} />)

    await screen.findByRole('tab', { name: 'Servicio caído' })
    expect(fetchEvolucion).toHaveBeenCalledWith(
      '/api/mapas/infraestructura/evolucion?departamento=GOYA&departamento=ESQUINA&direccion=3&direccion=1',
    )
  })

  it('vuelve a pedir cuando cambia la query y no por un objeto equivalente', async () => {
    const primera: FiltrosMapa = { ...FILTROS_MAPA_VACIOS, departamentos: ['GOYA'] }
    const { rerender } = render(<EvolucionPanel filtros={primera} />)
    await screen.findByRole('tab', { name: 'Servicio caído' })

    rerender(<EvolucionPanel filtros={{ ...primera, departamentos: ['ESQUINA'] }} />)
    await vi.waitFor(() => expect(fetchEvolucion).toHaveBeenCalledTimes(2))
    expect(fetchEvolucion).toHaveBeenLastCalledWith(
      '/api/mapas/infraestructura/evolucion?departamento=ESQUINA',
    )

    rerender(<EvolucionPanel filtros={{ ...primera, departamentos: ['ESQUINA'] }} />)
    expect(fetchEvolucion).toHaveBeenCalledTimes(2)
  })

  it('conserva los datos anteriores mientras recarga los filtros', async () => {
    let resolver: ((value: { ok: boolean; json: () => Promise<EvolucionMapa> }) => void) | undefined
    fetchEvolucion.mockResolvedValueOnce({ ok: true, json: async () => DATOS })
    fetchEvolucion.mockImplementationOnce(
      () => new Promise((resolve) => { resolver = resolve }),
    )
    const { rerender } = render(<EvolucionPanel filtros={FILTROS_MAPA_VACIOS} />)
    await screen.findByRole('tab', { name: 'Servicio caído' })
    await userEvent.click(screen.getByRole('tab', { name: 'Departamentos' }))
    expect(await screen.findByRole('rowheader', { name: 'Capital' })).toBeInTheDocument()

    rerender(<EvolucionPanel filtros={{ ...FILTROS_MAPA_VACIOS, departamentos: ['Goya'] }} />)

    expect(screen.getByRole('rowheader', { name: 'Capital' })).toBeInTheDocument()
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    expect(resolver).toBeDefined()
  })

  it('muestra el ranking de departamentos como tabla con los datos del endpoint', async () => {
    render(<EvolucionPanel filtros={FILTROS_MAPA_VACIOS} />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Departamentos' }))

    const tabla = await screen.findByRole('table')
    expect(within(tabla).getByRole('columnheader', { name: 'Escuelas afectadas' })).toBeInTheDocument()
    // La primera columna son th[scope=row] (encabezado de fila), no td.
    expect(within(tabla).getByRole('columnheader', { name: 'Departamento' })).toBeInTheDocument()
    expect(within(tabla).getByRole('columnheader', { name: 'Proporción' })).toBeInTheDocument()
    expect(within(tabla).getByRole('rowheader', { name: 'Capital' })).toBeInTheDocument()
    expect(within(tabla).getByRole('cell', { name: '4' })).toBeInTheDocument()
    expect(within(tabla).getByRole('cell', { name: '120' })).toBeInTheDocument()
    expect(within(tabla).getByRole('rowheader', { name: 'Goya' })).toBeInTheDocument()
    expect(within(tabla).getByRole('cell', { name: '60' })).toBeInTheDocument()
  })

  it('la vista de alumnos acumulados explica que deduplica en todo el período', async () => {
    render(<EvolucionPanel filtros={FILTROS_MAPA_VACIOS} />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Alumnos acumulados' }))

    expect(await screen.findByText('Cuenta a cada alumno una sola vez en todo el período.')).toBeInTheDocument()
  })

  it('las cuatro vistas son navegables por sus pestañas', async () => {
    render(<EvolucionPanel filtros={FILTROS_MAPA_VACIOS} />)

    expect(await screen.findByRole('tab', { name: 'Servicio caído' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Departamentos' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Motivos' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Alumnos acumulados' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Motivos' }))
    expect(await screen.findByRole('img', { name: 'Distribución de afectaciones vigentes por motivo' })).toBeInTheDocument()
  })

  it('ante un error del endpoint muestra el mensaje y no una grilla vacía', async () => {
    fetchEvolucion.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    render(<EvolucionPanel filtros={FILTROS_MAPA_VACIOS} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTP 500/)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('recortarSerieAlRangoConDatos — recorte de presentación (hallazgo 24)', () => {
  function punto(dia: number, escuelas: number) {
    return { fecha: `2026-01-${String(dia).padStart(2, '0')}`, escuelas }
  }

  it('recorta los días iniciales en cero y deja margen de contexto antes del primer dato', () => {
    const serie = [punto(1, 0), punto(2, 0), punto(3, 0), punto(4, 0), punto(5, 3), punto(6, 4)]

    expect(recortarSerieAlRangoConDatos(serie)).toEqual([
      punto(2, 0),
      punto(3, 0),
      punto(4, 0),
      punto(5, 3),
      punto(6, 4),
    ])
  })

  it('no recorta cuando el primer punto ya tiene datos', () => {
    const serie = [punto(1, 2), punto(2, 3)]
    expect(recortarSerieAlRangoConDatos(serie)).toEqual(serie)
  })

  it('devuelve la serie completa si todos los días están en cero', () => {
    const serie = [punto(1, 0), punto(2, 0), punto(3, 0)]
    expect(recortarSerieAlRangoConDatos(serie)).toEqual(serie)
  })

  it('devuelve un array vacío si no hay puntos', () => {
    expect(recortarSerieAlRangoConDatos([])).toEqual([])
  })

  it('respeta el margen indicado', () => {
    const serie = [punto(1, 0), punto(2, 0), punto(3, 0), punto(4, 5)]
    expect(recortarSerieAlRangoConDatos(serie, 1)).toEqual([punto(3, 0), punto(4, 5)])
  })
})
