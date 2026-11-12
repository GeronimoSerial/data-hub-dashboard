// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CabecerasAdmin } from './cabeceras-admin'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const cabeceras = [
  { cue: '180017000', nombre: 'ESCUELA Nº 87', departamento: 'MERCEDES', supervisorName: 'MILAGROS GONZALEZ', evidencia: 'x', status: 'pendiente', supervisor: null, cabecera: null },
  { cue: '180032400', nombre: 'ESCUELA Nº 38', departamento: 'CURUZU CUATIA', supervisorName: 'EDID LEYES', evidencia: 'y', status: 'pendiente', supervisor: null, cabecera: null },
]

function stubApi() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/cuadernillos/cabeceras' && init?.method !== 'POST') {
      return new Response(JSON.stringify({ cabeceras }), { status: 200 })
    }
    if (url.startsWith('/api/cuadernillos/memberships?q=')) {
      const term = decodeURIComponent(url.split('q=')[1])
      const user = term === 'mili'
        ? { id: 'sup-1', name: 'Milagros González', email: 'mili@example.test' }
        : { id: 'cab-1', name: 'Directora 87', email: 'dir87@example.test' }
      return new Response(JSON.stringify({ users: [user] }), { status: 200 })
    }
    if (url === '/api/cuadernillos/cabeceras' && init?.method === 'POST') {
      return new Response(JSON.stringify({ confirmed: ['180017000'], unchanged: [], blocked: [] }), { status: 200 })
    }
    return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function pick(term: string, name: RegExp, slotIndex: number) {
  fireEvent.click(screen.getAllByRole('button', { name: /Sin asignar/ })[slotIndex])
  fireEvent.change(screen.getByPlaceholderText('Nombre o correo'), { target: { value: term } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  fireEvent.click(await screen.findByRole('button', { name }))
}

describe('CabecerasAdmin', () => {
  it('lists the cabeceras and posts the chosen account pair for a cabecera', async () => {
    const fetchMock = stubApi()
    render(<CabecerasAdmin />)

    expect(await screen.findByText('ESCUELA Nº 87')).toBeTruthy()
    expect(screen.getByText('MILAGROS GONZALEZ')).toBeTruthy()

    // Row order: CUE 180017000 comes first; once its supervisor is set, its cabecera slot is the first unassigned one.
    await pick('mili', /Milagros González/, 0)
    await pick('dir', /Directora 87/, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      mapping: { '180017000': { supervisorUserId: 'sup-1', cabeceraUserId: 'cab-1' } },
    })
  })
})
