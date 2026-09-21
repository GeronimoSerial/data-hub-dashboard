// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EstadoActualParte } from './estado-actual-parte'

const CUE = '180001000'

function responderCon(body: unknown, status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('EstadoActualParte — recuperación de acceso vencido', () => {
  it('ofrece un enlace accionable para volver a ingresar la contraseña, no sólo el aviso', async () => {
    vi.stubGlobal('fetch', responderCon({ error: 'No autorizado' }, 401))
    render(<EstadoActualParte cue={CUE} />)

    const enlace = await screen.findByRole('link', { name: 'Volver a ingresar la contraseña' })
    expect(enlace).toHaveAttribute('href', `/problematicas/parte?cue=${CUE}`)
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('no muestra el enlace de acceso vencido para un error de lectura genérico', async () => {
    vi.stubGlobal('fetch', responderCon({ error: 'falló' }, 500))
    render(<EstadoActualParte cue={CUE} />)

    await screen.findByRole('button', { name: 'Reintentar' })
    expect(screen.queryByRole('link', { name: 'Volver a ingresar la contraseña' })).toBeNull()
  })
})
