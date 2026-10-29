// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CONFIG_INICIAL, type LinksConfig } from '@/miniapps/links/lib/config'
import { AdminEnlaces } from './admin-enlaces'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const inicial: LinksConfig = {
  ...CONFIG_INICIAL,
  titulo: 'Accesos',
  enlaces: [
    { id: 'a', titulo: 'Uno', descripcion: 'Primero', url: 'https://uno.example.org' },
    { id: 'b', titulo: 'Dos', descripcion: '', url: 'https://dos.example.org' },
  ],
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const cuerpoEnviado = () => JSON.parse(fetchMock.mock.calls[0][1].body as string) as LinksConfig

describe('AdminEnlaces', () => {
  it('arranca sin cambios: guardar está deshabilitado', () => {
    render(<AdminEnlaces inicial={inicial} />)
    expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('agrega un enlace con título, descripción y URL y lo envía al guardar', async () => {
    const user = userEvent.setup()
    render(<AdminEnlaces inicial={inicial} />)
    await user.click(screen.getByRole('button', { name: /Agregar enlace/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Título'), 'Tres')
    await user.type(within(dialogo).getByLabelText('Descripción'), 'Tercero')
    await user.type(within(dialogo).getByLabelText('Enlace'), 'https://tres.example.org')
    await user.click(within(dialogo).getByRole('button', { name: 'Agregar' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe('/links/api/contenido')
    expect(cuerpoEnviado().enlaces.map((e) => e.titulo)).toEqual(['Uno', 'Dos', 'Tres'])
    expect(await screen.findByText('Cambios guardados.')).toBeTruthy()
  })

  it('no deja agregar una URL que no sea http(s)', async () => {
    const user = userEvent.setup()
    render(<AdminEnlaces inicial={inicial} />)
    await user.click(screen.getByRole('button', { name: /Agregar enlace/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Título'), 'Malo')
    await user.type(within(dialogo).getByLabelText('Enlace'), 'javascript:alert(1)')
    expect((within(dialogo).getByRole('button', { name: 'Agregar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('reordena y elimina antes de guardar', async () => {
    const user = userEvent.setup()
    render(<AdminEnlaces inicial={inicial} />)
    await user.click(screen.getByRole('button', { name: 'Subir Dos' }))
    await user.click(screen.getByRole('button', { name: 'Eliminar Uno' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(cuerpoEnviado().enlaces.map((e) => e.titulo)).toEqual(['Dos'])
  })

  it('muestra el error del servidor y conserva los cambios', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Contenido inválido' }), { status: 400 }))
    const user = userEvent.setup()
    render(<AdminEnlaces inicial={inicial} />)
    await user.click(screen.getByRole('button', { name: 'Eliminar Uno' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Contenido inválido')
    expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy()
  })
})
