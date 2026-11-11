// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FormularioLlamada } from './formulario-llamada'

const CUE = '0010001'
const LLAMADAS_VACIAS = { llamadas: [] }

type RespuestaMock = { status: number; body: unknown }

// fetch mock por método: GET de historial y POST de guardado.
function mockFetch(post: RespuestaMock, historial: unknown = LLAMADAS_VACIAS) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return new Response(JSON.stringify(post.body), { status: post.status })
    }
    return new Response(JSON.stringify(historial), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderFormulario(onGuardada = vi.fn()) {
  render(
    <FormularioLlamada
      cueAnexo={CUE}
      nombreEscuela="Escuela Normal"
      callerNombreInicial="Ana Operadora"
      onGuardada={onGuardada}
    />,
  )
  return { onGuardada }
}

function completarTextos() {
  fireEvent.change(screen.getByLabelText('Por qué no se actualizó el parte'), {
    target: { value: 'Sin personal' },
  })
  fireEvent.change(screen.getByLabelText('Qué dijo el director'), {
    target: { value: 'Lo carga mañana' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

beforeEach(() => {
  mockFetch({ status: 201, body: {} })
})

describe('FormularioLlamada', () => {
  it('prefills the caller name and lets the operator edit it', () => {
    renderFormulario()
    const caller = screen.getByLabelText('Nombre de quien llama') as HTMLInputElement
    expect(caller.value).toBe('Ana Operadora')
    fireEvent.change(caller, { target: { value: 'Luis' } })
    expect(caller.value).toBe('Luis')
  })

  it('keeps the submit disabled until both textareas have text', () => {
    renderFormulario()
    const boton = screen.getByRole('button', { name: 'Guardar llamada' })
    expect(boton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Por qué no se actualizó el parte'), {
      target: { value: 'Sin personal' },
    })
    expect(boton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Qué dijo el director'), {
      target: { value: '   ' },
    })
    expect(boton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Qué dijo el director'), {
      target: { value: 'Lo carga mañana' },
    })
    expect(boton).toBeEnabled()
  })

  it('posts exactly cueAnexo, callerNombre, justificacion and respuestaDirector', async () => {
    const fetchMock = mockFetch({ status: 201, body: {} })
    renderFormulario()
    completarTextos()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar llamada' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/call-center/llamadas',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    const init = postCall?.[1] as RequestInit
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(
      ['callerNombre', 'cueAnexo', 'justificacion', 'respuestaDirector'].sort(),
    )
    expect(body).toEqual({
      cueAnexo: CUE,
      callerNombre: 'Ana Operadora',
      justificacion: 'Sin personal',
      respuestaDirector: 'Lo carga mañana',
    })
  })

  it('shows the server error message in an alert when the save fails', async () => {
    mockFetch({ status: 400, body: { error: 'La justificación es obligatoria' } })
    renderFormulario()
    completarTextos()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar llamada' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('La justificación es obligatoria')
  })

  it('calls onGuardada and clears the textareas after a 201, keeping the caller name', async () => {
    const { onGuardada } = renderFormulario()
    completarTextos()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar llamada' }))

    await waitFor(() => expect(onGuardada).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Por qué no se actualizó el parte')).toHaveValue('')
    expect(screen.getByLabelText('Qué dijo el director')).toHaveValue('')
    expect(screen.getByLabelText('Nombre de quien llama')).toHaveValue('Ana Operadora')
  })

  it('renders history items in the received order and the empty state when there are none', async () => {
    mockFetch({ status: 201, body: {} }, {
      llamadas: [
        {
          id: '2',
          callerNombre: 'Luis',
          justificacion: 'Segunda',
          respuestaDirector: 'Respuesta 2',
          creadaEn: '2026-11-10T13:00:00.000Z',
        },
        {
          id: '1',
          callerNombre: 'Ana',
          justificacion: 'Primera',
          respuestaDirector: 'Respuesta 1',
          creadaEn: '2026-11-09T13:00:00.000Z',
        },
      ],
    })
    renderFormulario()
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Segunda')
    expect(items[1]).toHaveTextContent('Primera')
    expect(screen.queryByText('Todavía no hay llamadas registradas para esta escuela.')).toBeNull()
  })

  it('shows the empty state when there is no history', async () => {
    renderFormulario()
    expect(
      await screen.findByText('Todavía no hay llamadas registradas para esta escuela.'),
    ).toBeInTheDocument()
  })
})
