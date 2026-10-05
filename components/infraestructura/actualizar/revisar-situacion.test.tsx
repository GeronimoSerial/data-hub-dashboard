// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RevisarSituacion, type RevisarSituacionProps } from './revisar-situacion'

afterEach(cleanup)

const base = (over: Partial<RevisarSituacionProps> = {}): RevisarSituacionProps => ({
  situacion: { id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null, secciones: [], alumnos: [] },
  turnos: TURNOS_FIXTURE,
  sugerida: 'Crítica',
  respuesta: undefined,
  consecuencias: [],
  clasesEdificio: { servicioEstado: 'normal', estadoEstablecimiento: 'habitual' },
  onResponder: vi.fn(),
  onCambiarClasesEdificio: vi.fn(),
  onCascada: vi.fn(),
  posicion: { actual: 1, total: 2 },
  ...over,
})

describe('RevisarSituacion', () => {
  it('"Sigue igual" responde de inmediato', () => {
    const p = base()
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'sigue' })
  })

  it('"Cambió" pregunta qué cambió y muestra sólo esos bloques', () => {
    const p = base()
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'La gravedad' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('¿Qué tan grave es?')).toBeInTheDocument()
    expect(screen.queryByText('¿Hay clases?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'cambio', cambio: { aspectos: ['gravedad'], severidad: 'Crítica' } })
  })

  it('cancelar “¿Qué cambió?” conserva “Sigue igual” sin aplicar bloques de edición', () => {
    const p = base({ respuesta: { tipo: 'sigue' } })
    render(<RevisarSituacion {...p} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog', { name: '¿Qué cambió en Inundación?' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancelar' }))

    expect(p.onResponder).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sigue igual' })).toBeChecked()
    expect(screen.queryByText('¿Qué tan grave es?')).not.toBeInTheDocument()
  })

  it('"Se solucionó" queda respondido con "Ahora" y pregunta en cascada sin un botón interno', () => {
    const p = base({ consecuencias: [{ id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a' }] })
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    expect(screen.getByText('¿Cuándo se solucionó?')).toBeInTheDocument()
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'solucionada', solucionadaEn: expect.any(String) })
    expect(screen.queryByRole('button', { name: 'Listo' })).not.toBeInTheDocument()
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText(/Sin energía o agua \(causado por Inundación\)/)).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sí, también se solucionó' }))
    expect(p.onCascada).toHaveBeenCalledWith('b', expect.any(String))
  })

  it('en la cascada "No, sigue activo" no responde la consecuencia y conserva una sola respuesta solucionada', () => {
    const p = base({ consecuencias: [{ id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a' }] })
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'No, sigue activo' }))

    expect(p.onCascada).not.toHaveBeenCalled()
    expect(p.onResponder).toHaveBeenCalledTimes(1)
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'solucionada', solucionadaEn: expect.any(String) })
  })
})
