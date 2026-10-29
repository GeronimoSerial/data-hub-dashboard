// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AgregarEnlace } from './agregar-enlace'

let llamadas: { url: string; method: string; body: unknown }[]
let respuesta: { status: number; body: unknown } | 'caida'

beforeEach(() => {
  llamadas = []
  respuesta = { status: 201, body: { enlace: { id: 'n', titulo: 'Portal de becas', url: 'https://becas.mec.gob.ar' } } }
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    llamadas.push({ url, method: init.method ?? 'GET', body: JSON.parse(String(init.body)) })
    if (respuesta === 'caida') return Promise.reject(new Error('offline'))
    return Promise.resolve(new Response(JSON.stringify(respuesta.body), { status: respuesta.status, headers: { 'content-type': 'application/json' } }))
  }))
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const boton = () => screen.getByRole('button', { name: 'Agregar enlace' }) as HTMLButtonElement

async function completar(user: ReturnType<typeof userEvent.setup>, url = 'https://becas.mec.gob.ar', descripcion = 'Portal de becas') {
  await user.type(screen.getByLabelText('Enlace'), url)
  await user.type(screen.getByLabelText('Descripción'), descripcion)
}

describe('AgregarEnlace', () => {
  it('pide solo dos datos: enlace y descripción', () => {
    render(<AgregarEnlace />)
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getByLabelText('Enlace')).toBeTruthy()
    expect(screen.getByLabelText('Descripción')).toBeTruthy()
  })

  it('mantiene el botón deshabilitado hasta tener un enlace seguro y una descripción', async () => {
    const user = userEvent.setup()
    render(<AgregarEnlace />)
    expect(boton().disabled).toBe(true)
    await user.type(screen.getByLabelText('Enlace'), 'javascript:alert(1)')
    await user.type(screen.getByLabelText('Descripción'), 'Algo')
    expect(boton().disabled).toBe(true)
    expect(screen.getByText(/empiece con http/)).toBeTruthy()
    await user.clear(screen.getByLabelText('Enlace'))
    await user.type(screen.getByLabelText('Enlace'), 'https://becas.mec.gob.ar')
    expect(boton().disabled).toBe(false)
  })

  it('envía el enlace y la descripción, confirma y limpia el formulario', async () => {
    const user = userEvent.setup()
    render(<AgregarEnlace />)
    await completar(user)
    await user.click(boton())
    expect(await screen.findByText('Enlace agregado.')).toBeTruthy()
    expect(llamadas).toEqual([{ url: '/api/linktree/enlaces', method: 'POST', body: { url: 'https://becas.mec.gob.ar', descripcion: 'Portal de becas' } }])
    expect((screen.getByLabelText('Enlace') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Descripción') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('link', { name: 'Ver la página' }).getAttribute('href')).toBe('/links')
  })

  it('muestra el error del servidor y conserva lo escrito', async () => {
    respuesta = { status: 409, body: { error: 'No hay lugar para más enlaces en el grupo.' } }
    const user = userEvent.setup()
    render(<AgregarEnlace />)
    await completar(user)
    await user.click(boton())
    expect((await screen.findByRole('alert')).textContent).toContain('No hay lugar')
    expect((screen.getByLabelText('Enlace') as HTMLInputElement).value).toBe('https://becas.mec.gob.ar')
  })

  it('avisa cuando no hay conexión', async () => {
    respuesta = 'caida'
    const user = userEvent.setup()
    render(<AgregarEnlace />)
    await completar(user)
    await user.click(boton())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se pudo conectar'))
  })
})
