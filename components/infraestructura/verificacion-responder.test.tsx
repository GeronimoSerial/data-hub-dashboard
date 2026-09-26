// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VerificacionResponder, type VerificacionEnlace } from './verificacion-responder'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}))

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const VERIFICACION_PENDIENTE: VerificacionEnlace = {
  cueAnexo: '1801605-04',
  estado: 'pendiente',
  resultado: null,
  respondidaEn: null,
  discrepancia: 0,
}

const PROPS = { verificacionId: 'verif-1', token: 'token-secreto' }

function renderResponder() {
  return render(<VerificacionResponder {...PROPS} />)
}

/** Mock de fetch que despacha por sufijo del endpoint y permite overrides. */
function stubFetch(
  overrides: {
    validar?: Response
    responder?: Response
    canjear?: Response
  } = {},
) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    const ruta = String(url)
    if (ruta.endsWith('/validar-token')) {
      return overrides.validar ?? jsonResponse({ ok: true, verificacion: VERIFICACION_PENDIENTE })
    }
    if (ruta.endsWith('/responder')) {
      return (
        overrides.responder ??
        jsonResponse({
          ok: true,
          verificacion: {
            ...VERIFICACION_PENDIENTE,
            estado: 'respondida',
            resultado: 'sin_afectacion',
            respondidaEn: '2026-09-18T13:35:00.000Z',
          },
        })
      )
    }
    if (ruta.endsWith('/canjear-sesion')) {
      return overrides.canjear ?? jsonResponse({ ok: true, verificacion: VERIFICACION_PENDIENTE })
    }
    throw new Error(`fetch inesperado: ${ruta}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  pushMock.mockReset()
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('VerificacionResponder — carga inicial', () => {
  it('valida el token al montar y muestra la pregunta con las dos acciones', async () => {
    const fetchMock = stubFetch()
    renderResponder()

    expect(
      await screen.findByText(
        '¿Su escuela tiene actualmente alguna afectación por la situación hidrometeorológica?',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Escuela 1801605-04')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sin afectación' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hay afectación' })).toBeInTheDocument()

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/problematicas/verificaciones/verif-1/validar-token')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ token: PROPS.token })
  })

  it('muestra el error de la API sin opciones de acción cuando el token es inválido', async () => {
    stubFetch({ validar: jsonResponse({ error: 'Este enlace venció.' }, 410) })
    renderResponder()

    expect(await screen.findByRole('alert')).toHaveTextContent('Este enlace venció.')
    expect(
      screen.getByText(/comuníquese con quien le compartió el enlace/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sin afectación' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hay afectación' })).toBeNull()
  })
})

describe('VerificacionResponder — sin afectación', () => {
  it('pide confirmación, envía la respuesta y muestra el comprobante', async () => {
    const fetchMock = stubFetch()
    renderResponder()

    fireEvent.click(await screen.findByRole('button', { name: 'Sin afectación' }))

    expect(
      screen.getByText('¿Confirma que la escuela NO tiene afectación en este momento?'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('Sin afectación')).toBeInTheDocument()

    const llamada = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/responder'))
    expect(llamada).toBeDefined()
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({
      token: PROPS.token,
      resultado: 'sin_afectacion',
    })
  })

  it('"Volver" regresa a la pregunta sin enviar nada', async () => {
    const fetchMock = stubFetch()
    renderResponder()

    fireEvent.click(await screen.findByRole('button', { name: 'Sin afectación' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))

    expect(
      screen.getByText(
        '¿Su escuela tiene actualmente alguna afectación por la situación hidrometeorológica?',
      ),
    ).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/responder'))).toBe(false)
  })
})

describe('VerificacionResponder — hay afectación', () => {
  it('canjea la sesión, guarda el vínculo y navega al parte con el CUE', async () => {
    const fetchMock = stubFetch()
    renderResponder()

    fireEvent.click(await screen.findByRole('button', { name: 'Hay afectación' }))

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/problematicas/parte?cue=1801605-04')
    })

    expect(JSON.parse(String(sessionStorage.getItem('e1-verificacion-vinculo')))).toEqual({
      id: PROPS.verificacionId,
      token: PROPS.token,
    })

    const llamada = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/canjear-sesion'),
    )
    expect(llamada).toBeDefined()
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ token: PROPS.token })
  })
})

describe('VerificacionResponder — verificación ya resuelta', () => {
  it('si ya está respondida muestra el comprobante sin botones de acción', async () => {
    stubFetch({
      validar: jsonResponse({
        ok: true,
        verificacion: {
          ...VERIFICACION_PENDIENTE,
          estado: 'respondida',
          resultado: 'no_disponible',
          respondidaEn: '2026-09-18T13:35:00.000Z',
        },
      }),
    })
    renderResponder()

    expect(await screen.findByText('No disponible')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sin afectación' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hay afectación' })).toBeNull()
  })

  it('si cancelada muestra el estado final sin opciones de respuesta', async () => {
    stubFetch({
      validar: jsonResponse({
        ok: true,
        verificacion: { ...VERIFICACION_PENDIENTE, estado: 'cancelada' },
      }),
    })
    renderResponder()

    expect(await screen.findByText('Cancelada')).toBeInTheDocument()
    expect(screen.getByText('Esta solicitud fue cancelada.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sin afectación' })).toBeNull()
  })

  it('discrepancia en el comprobante muestra la nota explícita', async () => {
    stubFetch({
      validar: jsonResponse({
        ok: true,
        verificacion: {
          ...VERIFICACION_PENDIENTE,
          estado: 'respondida',
          resultado: 'sin_afectacion',
          respondidaEn: '2026-09-18T13:35:00.000Z',
          discrepancia: 1,
        },
      }),
    })
    renderResponder()

    expect(
      await screen.findByText(
        /Se registró como 'sin afectación', pero el sistema tenía una afectación vigente/,
      ),
    ).toBeInTheDocument()
  })
})

describe('VerificacionResponder — token fuera de la URL', () => {
  it('saca el token de la URL tras validar (camino exitoso)', async () => {
    stubFetch()
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    renderResponder()

    await screen.findByText(
      '¿Su escuela tiene actualmente alguna afectación por la situación hidrometeorológica?',
    )
    await waitFor(() => expect(replaceStateSpy).toHaveBeenCalled())

    for (const llamada of replaceStateSpy.mock.calls) {
      expect(String(llamada[2])).not.toContain('token')
    }
    replaceStateSpy.mockRestore()
  })

  it('saca el token de la URL también cuando la validación falla', async () => {
    stubFetch({ validar: jsonResponse({ error: 'Este enlace venció.' }, 410) })
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    renderResponder()

    await screen.findByRole('alert')
    await waitFor(() => expect(replaceStateSpy).toHaveBeenCalled())

    for (const llamada of replaceStateSpy.mock.calls) {
      expect(String(llamada[2])).not.toContain('token')
    }
    replaceStateSpy.mockRestore()
  })
})

describe('VerificacionResponder — nombre de la escuela', () => {
  it('muestra el nombre de la escuela cuando se pasa escuelaNombre', async () => {
    stubFetch()
    render(<VerificacionResponder {...PROPS} escuelaNombre="Escuela Nº 5" />)

    expect(
      await screen.findByText('Escuela Nº 5 (CUE 1801605-04)'),
    ).toBeInTheDocument()
  })

  it('sin escuelaNombre cae al CUE como antes (regresión)', async () => {
    stubFetch()
    renderResponder()

    expect(await screen.findByText('Escuela 1801605-04')).toBeInTheDocument()
  })

  it('usa el mismo formato en el comprobante cuando se pasa escuelaNombre', async () => {
    stubFetch({
      validar: jsonResponse({
        ok: true,
        verificacion: {
          ...VERIFICACION_PENDIENTE,
          estado: 'respondida',
          resultado: 'no_disponible',
          respondidaEn: '2026-09-18T13:35:00.000Z',
        },
      }),
    })
    render(<VerificacionResponder {...PROPS} escuelaNombre="Escuela Nº 5" />)

    expect(
      await screen.findByText('Escuela Nº 5 (CUE 1801605-04)'),
    ).toBeInTheDocument()
  })
})
