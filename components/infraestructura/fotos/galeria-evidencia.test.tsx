// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GaleriaEvidencia } from './galeria-evidencia'

const groups = [{
  id: 'movement-1',
  type: 'reporte_inicial',
  createdAt: '2026-10-10T12:00:00.000Z',
  photos: [
    { attachmentId: 'attachment-1', thumbnailUrl: 'https://obs.example/thumb-1' },
    { attachmentId: 'attachment-2', thumbnailUrl: 'https://obs.example/thumb-2' },
  ],
}]

function mockFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/config')) return Response.json({ fotos: true })
    if (url.includes('attachmentId=')) {
      const attachmentId = new URL(url, 'http://localhost').searchParams.get('attachmentId')
      return Response.json({ url: `https://obs.example/${attachmentId}` })
    }
    return Response.json({ movements: groups })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
})

describe('GaleriaEvidencia con LightGallery v3', () => {
  it('loads thumbnails for the school sheet and groups them under their movement date', async () => {
    const fetchMock = mockFetch()
    render(<GaleriaEvidencia cue="180000123-00" />)

    expect(await screen.findByRole('heading', { name: /10 de octubre de 2026/ })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/infraestructura/adjuntos?cue=180000123-00')
    expect(screen.getAllByRole('button', { name: /Ampliar foto del/ })[0].querySelector('img'))
      .toHaveAttribute('src', 'https://obs.example/thumb-1')
  })

  it('loads authorized optimized URLs on demand and renders native thumbnail and zoom plugins', async () => {
    const fetchMock = mockFetch()
    render(<GaleriaEvidencia cue="180000123-00" />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Ampliar foto/ }))[0])

    const dialog = await screen.findByRole('dialog', { name: 'Galería de evidencia' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Evidencia fotográfica' })[0]).toHaveAttribute(
      'src', 'https://obs.example/attachment-1',
    )
    expect(document.querySelector('.lg-sub-html')).toHaveTextContent(/Reporte inicial/)
    expect(document.querySelector('.lg-thumb-outer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver tamaño real' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/infraestructura/adjuntos?cue=180000123-00&attachmentId=attachment-1&variant=optimizada',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/infraestructura/adjuntos?cue=180000123-00&attachmentId=attachment-2&variant=optimizada',
    )
  })

  it('uses the fullscreen element as portal target and returns to body after fullscreen exits', async () => {
    mockFetch()
    const { container } = render(<GaleriaEvidencia cue="180000123-00" />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Ampliar foto/ }))[0])
    const dialog = await screen.findByRole('dialog', { name: 'Galería de evidencia' })
    expect(dialog.parentElement).toBe(document.body)

    const fullscreenRoot = document.createElement('div')
    document.body.append(fullscreenRoot)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: fullscreenRoot })
    fireEvent(document, new Event('fullscreenchange'))
    await waitFor(() => expect(fullscreenRoot.querySelector('.lg-container')).not.toBeNull())
    expect(fullscreenRoot).toContainElement(document.querySelector('.lg-container'))

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    fireEvent(document, new Event('fullscreenchange'))
    await waitFor(() => expect(document.body).toContainElement(document.querySelector('.lg-container')))
    expect(fullscreenRoot.querySelector('.lg-container')).toBeNull()
    expect(container).toContainElement(screen.getByRole('region', { name: 'Evidencia fotográfica' }))
    fullscreenRoot.remove()
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
  })

  it('closes with Escape or the native close control and restores focus without changing scroll styles', async () => {
    mockFetch()
    document.documentElement.style.overflow = 'auto'
    document.body.style.overflow = 'scroll'
    render(<GaleriaEvidencia cue="180000123-00" />)
    const thumbnail = (await screen.findAllByRole('button', { name: /Ampliar foto/ }))[0]
    thumbnail.focus()
    fireEvent.click(thumbnail)

    const dialog = await screen.findByRole('dialog', { name: 'Galería de evidencia' })
    await waitFor(() => expect(dialog).toHaveFocus())
    expect(document.documentElement.style.overflow).toBe('auto')
    expect(document.body.style.overflow).toBe('scroll')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(thumbnail).toHaveFocus())
    expect(thumbnail).toHaveFocus()

    fireEvent.click(thumbnail)
    await screen.findByRole('dialog', { name: 'Galería de evidencia' })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar galería' }))
    await waitFor(() => expect(thumbnail).toHaveFocus())
  })

  it('keeps separate gallery instances isolated through open, close, and unmount', async () => {
    mockFetch()
    const view = render(
      <>
        <GaleriaEvidencia cue="180000123-00" />
        <GaleriaEvidencia cue="180000124-00" />
      </>,
    )
    const triggers = await screen.findAllByRole('button', { name: /Ampliar foto/ })
    fireEvent.click(triggers[0])
    const firstDialog = await screen.findByRole('dialog', { name: 'Galería de evidencia' })
    expect(document.querySelectorAll('.lg-container')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar galería' }))
    await waitFor(() => expect(firstDialog).not.toHaveClass('lg-show'))

    fireEvent.click(triggers[1])
    await screen.findByRole('dialog', { name: 'Galería de evidencia' })
    expect(document.querySelectorAll('.lg-container')).toHaveLength(1)
    view.unmount()
    await waitFor(() => expect(document.querySelector('.lg-container')).toBeNull())
    expect(firstDialog.isConnected).toBe(false)
  })
})
