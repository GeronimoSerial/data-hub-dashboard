// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  VerificacionesCola,
  estadoVisible,
  type VerificacionVisible,
} from './verificaciones-cola'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function verificacion(overrides: Partial<VerificacionVisible> = {}): VerificacionVisible {
  return {
    id: 'v1',
    episodioId: 'e1',
    cueAnexo: '12345678',
    estado: 'pendiente',
    solicitadaEn: '2026-09-01T12:00:00.000Z',
    solicitadaPorUserId: 'u1',
    vencimientoEn: null,
    resultado: null,
    discrepancia: 0,
    respondidaEn: null,
    respondidaCanal: null,
    respondidaPorUserId: null,
    movimientoId: null,
    canceladaEn: null,
    canceladaPorUserId: null,
    motivoCancelacion: null,
    tokenExpiraEn: '2026-10-01T12:00:00.000Z',
    tokenRevocadoEn: null,
    tokenConsumidoEn: null,
    creadaEn: '2026-09-01T12:00:00.000Z',
    actualizadaEn: '2026-09-01T12:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  refreshMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
  document.body.innerHTML = ''
})

describe('estadoVisible', () => {
  const ahora = new Date('2026-09-15T12:00:00.000Z')

  it('pendiente sin vencimiento', () => {
    expect(estadoVisible(verificacion(), ahora)).toBe('pendiente')
  })

  it('pendiente vencida cuando el vencimiento ya pasó', () => {
    expect(
      estadoVisible(verificacion({ vencimientoEn: '2026-09-10T12:00:00.000Z' }), ahora),
    ).toBe('pendiente_vencida')
  })

  it('sigue pendiente si el vencimiento todavía no llegó', () => {
    expect(
      estadoVisible(verificacion({ vencimientoEn: '2026-09-20T12:00:00.000Z' }), ahora),
    ).toBe('pendiente')
  })

  it('respondida sin afectación', () => {
    expect(
      estadoVisible(verificacion({ estado: 'respondida', resultado: 'sin_afectacion' }), ahora),
    ).toBe('respondida_sin_afectacion')
  })

  it('respondida con afectación', () => {
    expect(
      estadoVisible(verificacion({ estado: 'respondida', resultado: 'con_afectacion' }), ahora),
    ).toBe('respondida_con_afectacion')
  })

  it('respondida no disponible', () => {
    expect(
      estadoVisible(verificacion({ estado: 'respondida', resultado: 'no_disponible' }), ahora),
    ).toBe('respondida_no_disponible')
  })

  it('cancelada', () => {
    expect(estadoVisible(verificacion({ estado: 'cancelada' }), ahora)).toBe('cancelada')
  })
})

describe('VerificacionesCola', () => {
  it('crear una solicitud exitosa muestra el enlace con el token', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, verificacion: verificacion({ id: 'v9' }), token: 'tok-abc' }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, verificaciones: [verificacion({ id: 'v9' })] }, 200),
      )

    render(
      <VerificacionesCola episodioId="e1" verificacionesIniciales={[]} episodioAbierto />,
    )
    fireEvent.change(screen.getByLabelText(/cue/i), { target: { value: '12345678' } })
    fireEvent.click(screen.getByRole('button', { name: /crear solicitud/i }))

    await waitFor(() => {
      const enlace = screen.getByDisplayValue(/\?token=tok-abc/) as HTMLInputElement
      expect(enlace.value).toBe(
        `${window.location.origin}/problematicas/verificaciones/v9?token=tok-abc`,
      )
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/infraestructura/verificaciones',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('cancelar una fila pendiente llama al endpoint correcto', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, verificacion: verificacion({ estado: 'cancelada' }) }, 200),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, verificaciones: [] }, 200))

    render(
      <VerificacionesCola
        episodioId="e1"
        verificacionesIniciales={[verificacion({ id: 'v1' })]}
        episodioAbierto={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/infraestructura/verificaciones/v1/cancelar',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('el formulario de respuesta asistida no ofrece con_afectacion', () => {
    render(
      <VerificacionesCola
        episodioId="e1"
        verificacionesIniciales={[verificacion({ id: 'v1' })]}
        episodioAbierto={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /registrar respuesta asistida/i }))

    expect(screen.queryByRole('option', { name: /con afectación/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /con_afectacion/i })).toBeNull()
    expect(screen.getByRole('option', { name: /sin afectación/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /no disponible/i })).toBeInTheDocument()
  })
})
