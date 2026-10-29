// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CONFIG_INICIAL, type LinktreeConfig } from '@/lib/linktree/config'
import { LinktreeAdmin } from './linktree'

const inicial: LinktreeConfig = {
  ...CONFIG_INICIAL,
  titulo: 'Sistemas de Corrientes',
  grupos: [
    {
      id: 'g1',
      titulo: 'Datos',
      enlaces: [
        { id: 'e1', titulo: 'Hub de Datos', descripcion: '', url: 'https://hub.sistemas.mec.gob.ar', icono: null, visible: true },
        { id: 'e2', titulo: 'Mapas', descripcion: '', url: '/mapas', icono: null, visible: true },
      ],
    },
  ],
}

type Llamada = { url: string; method: string; body?: LinktreeConfig }
let llamadas: Llamada[]
let respuestaPut: { status: number; body: unknown }

function respuesta(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

beforeEach(() => {
  llamadas = []
  respuestaPut = { status: 200, body: null }
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(String(init.body)) as LinktreeConfig) : undefined
    llamadas.push({ url, method, body })
    if (method === 'PUT') return respuesta(respuestaPut.status, respuestaPut.body ?? body)
    return respuesta(200, inicial)
  }))
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function abrir() {
  const user = userEvent.setup()
  render(<LinktreeAdmin />)
  await screen.findByText('Hub de Datos')
  return user
}

const puts = () => llamadas.filter((l) => l.method === 'PUT')

describe('LinktreeAdmin', () => {
  it('carga la configuración y la muestra agrupada', async () => {
    await abrir()
    expect(screen.getByRole('heading', { name: 'Datos' })).toBeTruthy()
    expect(screen.getByText('Mapas')).toBeTruthy()
    expect(llamadas[0]).toMatchObject({ url: '/api/linktree', method: 'GET' })
  })

  it('muestra el error cuando no se puede cargar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respuesta(403, { error: 'No tiene acceso a este recurso' })))
    render(<LinktreeAdmin />)
    expect((await screen.findByRole('alert')).textContent).toContain('No tiene acceso a este recurso')
  })

  it('mantiene "Guardar cambios" deshabilitado hasta que hay un cambio', async () => {
    const user = await abrir()
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement
    expect(guardar.disabled).toBe(true)
    await user.click(screen.getByRole('switch', { name: 'Mostrar Mapas' }))
    expect(guardar.disabled).toBe(false)
  })

  it('guarda el documento completo con el cambio de visibilidad y confirma', async () => {
    const user = await abrir()
    await user.click(screen.getByRole('switch', { name: 'Mostrar Mapas' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await screen.findByText('Cambios guardados.')
    expect(puts()).toHaveLength(1)
    expect(puts()[0].body?.grupos[0].enlaces[1]).toMatchObject({ id: 'e2', visible: false })
    expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('muestra el error del servidor al guardar y conserva el borrador', async () => {
    respuestaPut = { status: 400, body: { error: 'Configuración inválida' } }
    const user = await abrir()
    await user.click(screen.getByRole('switch', { name: 'Mostrar Mapas' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Configuración inválida')
    expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('agrega un grupo desde el diálogo', async () => {
    const user = await abrir()
    await user.click(screen.getByRole('button', { name: 'Agregar grupo' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText(/Título/), 'Gestión')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Gestión' })).toBeTruthy()
  })

  it('no deja guardar un enlace con URL insegura y acepta una válida', async () => {
    const user = await abrir()
    await user.click(screen.getByRole('button', { name: 'Agregar enlace' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText(/Título/), 'Nuevo sistema')
    await user.type(within(dialogo).getByLabelText(/URL/), 'javascript:alert(1)')
    const guardar = within(dialogo).getByRole('button', { name: 'Guardar' }) as HTMLButtonElement
    expect(guardar.disabled).toBe(true)
    expect(within(dialogo).getByText(/URL inválida|http/)).toBeTruthy()
    await user.clear(within(dialogo).getByLabelText(/URL/))
    await user.type(within(dialogo).getByLabelText(/URL/), 'https://nuevo.sistemas.mec.gob.ar')
    expect(guardar.disabled).toBe(false)
    await user.click(guardar)
    expect(await screen.findByText('Nuevo sistema')).toBeTruthy()
  })

  it('reordena un enlace con los botones subir y bajar', async () => {
    const user = await abrir()
    await user.click(screen.getByRole('button', { name: 'Subir Mapas' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0].body?.grupos[0].enlaces.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('guarda el acento elegido de la paleta oficial', async () => {
    const user = await abrir()
    await user.click(screen.getByRole('tab', { name: 'Apariencia' }))
    await user.click(screen.getByRole('button', { name: 'Celeste' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0].body?.acento).toBe('celeste')
  })
})
