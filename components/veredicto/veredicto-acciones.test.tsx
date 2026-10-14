// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VeredictoAcciones } from './veredicto-acciones'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubClipboard(writeText: (texto: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

describe('VeredictoAcciones', () => {
  it('crea el enlace y lo copia al portapapeles', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ url: '/veredicto/compartido/tok-1', venceEn: '2026-10-13T23:59:00.000Z' }, 201),
    )
    vi.stubGlobal('fetch', fetchMock)
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    render(<VeredictoAcciones />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace para autoridades' }))

    await waitFor(() =>
      expect(screen.getByText('Enlace copiado. Vence hoy a las 23:59.')).toBeTruthy(),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/infraestructura/veredictos/enlaces',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/veredicto/compartido/tok-1`)
  })

  it('muestra el enlace completo en un input de solo lectura si el portapapeles falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ url: '/veredicto/compartido/tok-2', venceEn: 'x' }, 201)),
    )
    stubClipboard(vi.fn().mockRejectedValue(new Error('denegado')))

    render(<VeredictoAcciones />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace para autoridades' }))

    const input = (await screen.findByDisplayValue(
      `${window.location.origin}/veredicto/compartido/tok-2`,
    )) as HTMLInputElement
    expect(input.readOnly).toBe(true)
  })

  it('informa del error si no se puede crear el enlace', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'x' }, 500)))
    stubClipboard(vi.fn())

    render(<VeredictoAcciones />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace para autoridades' }))

    expect(await screen.findByText('No se pudo crear el enlace.')).toBeTruthy()
  })

  it('no revoca si el usuario cancela la confirmación', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<VeredictoAcciones />)
    fireEvent.click(screen.getByRole('button', { name: 'Revocar enlaces de hoy' }))

    expect(window.confirm).toHaveBeenCalledWith('¿Revocar todos los enlaces creados hoy?')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('revoca los enlaces de hoy cuando se confirma', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ revocados: 3 }, 200))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<VeredictoAcciones />)
    fireEvent.click(screen.getByRole('button', { name: 'Revocar enlaces de hoy' }))

    expect(await screen.findByText('Enlaces revocados: 3')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/infraestructura/veredictos/enlaces',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('enlaza el PDF con download', () => {
    render(<VeredictoAcciones />)
    const enlace = screen.getByRole('link', { name: 'Descargar PDF' })
    expect(enlace.getAttribute('href')).toBe('/api/infraestructura/veredictos/pdf')
    expect(enlace.hasAttribute('download')).toBe(true)
  })

  it('anuncia el estado en una región aria-live', async () => {
    render(<VeredictoAcciones />)
    const estado = screen.getByText('', { selector: '[aria-live="polite"]' })
    expect(estado.getAttribute('aria-live')).toBe('polite')
  })
})
