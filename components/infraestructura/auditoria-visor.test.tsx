// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuditoriaVisor } from './auditoria-visor'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const evento = { id: 'evt-1', ocurridoEn: '2026-10-19T12:00:00Z', accion: 'parte.guardar', actorTipo: 'compartido', actorId: null,
  actorRol: null, viaAcceso: 'password_compartida', cueAnexo: '1801605-04', resultado: 'exito', httpStatus: 201,
  requestId: 'req-1', metodo: 'POST', rutaPlantilla: '/api/problematicas/parte', duracionMs: 2, metadatos: { movimientoId: 'mov-1' } }
const respuesta = (items: unknown[], nextCursor: string | null = null) => Response.json({ items, nextCursor })

describe('visor bajo demanda', () => {
  it('carga una página al abrirse y muestra hora de Buenos Aires e identidad compartida', async () => {
    const fetcher = vi.fn(async () => respuesta([evento]))
    vi.stubGlobal('fetch', fetcher)
    render(<AuditoriaVisor />)
    expect(await screen.findByText('parte.guardar')).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/compartido: sin identidad personal/)).toBeInTheDocument()
    expect(screen.getByText(/9:00:00/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Ver referencias'))
    expect(screen.getByText('Solicitud: req-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('aplica filtros, recorre páginas y vuelve con el mismo filtro', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(respuesta([evento], 'cursor-1'))
      .mockResolvedValueOnce(respuesta([{ ...evento, id: 'evt-2' }]))
      .mockResolvedValueOnce(respuesta([evento], 'cursor-1'))
      .mockResolvedValueOnce(respuesta([]))
    vi.stubGlobal('fetch', fetcher)
    render(<AuditoriaVisor />)
    await screen.findByText('parte.guardar')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled())
    expect(fetcher.mock.calls[1][0]).toContain('cursor=cursor-1')
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filtrar historial' })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('CUE anexo'), { target: { value: '1801605-04' } })
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar historial' }))
    expect(await screen.findByText('No hay operaciones para estos filtros.')).toBeInTheDocument()
    expect(fetcher.mock.calls[3][0]).toContain('cueAnexo=1801605-04')
    expect(fetcher.mock.calls[3][0]).not.toContain('cursor=')
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  })

  it('permite reintentar una lectura fallida', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce(respuesta([]))
    vi.stubGlobal('fetch', fetcher)
    render(<AuditoriaVisor />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('No hay operaciones para estos filtros.')).toBeInTheDocument()
  })
})
