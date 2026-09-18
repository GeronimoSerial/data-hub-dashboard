// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HistorialParte } from './historial-parte'

const CUE = '180001000'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('HistorialParte — recuperación de acceso vencido', () => {
  it('avisa del acceso vencido con un enlace accionable, sin un Reintentar engañoso', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'No autorizado' }) }),
    )
    render(<HistorialParte cue={CUE} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Su acceso ya no está vigente. Vuelva a ingresar la contraseña para ver el estado actual.',
    )
    expect(screen.getByRole('link', { name: 'Volver a ingresar la contraseña' })).toHaveAttribute(
      'href',
      `/problematicas/parte/historial?cue=${CUE}`,
    )
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('conserva el botón Reintentar para un error de lectura que no es de acceso vencido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )
    render(<HistorialParte cue={CUE} />)

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Volver a ingresar la contraseña' })).toBeNull()
  })
})
