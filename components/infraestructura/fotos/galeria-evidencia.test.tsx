// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GaleriaEvidencia } from './galeria-evidencia'

const groups = [{
  id: 'movement-1',
  type: 'reporte_inicial',
  createdAt: '2026-10-10T12:00:00.000Z',
  photos: [{ attachmentId: 'attachment-1', thumbnailUrl: 'https://obs.example/thumb' }],
}]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('GaleriaEvidencia', () => {
  it('loads thumbnails for the opened school sheet and groups them under their movement date', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ movements: groups }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<GaleriaEvidencia cue="180000123-00" />)

    expect(fetchMock).toHaveBeenCalledWith('/api/infraestructura/adjuntos?cue=180000123-00')
    expect(await screen.findByRole('heading', { name: /10 de octubre de 2026/ })).toBeInTheDocument()
    const thumbnail = screen.getByRole('button', { name: /Ampliar foto del/ }).querySelector('img')
    expect(thumbnail).toHaveAttribute('src', 'https://obs.example/thumb')
  })

  it('requests the optimized image only after selection', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ movements: groups }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://obs.example/full' }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<GaleriaEvidencia cue="180000123-00" />)

    fireEvent.click(await screen.findByRole('button', { name: /Ampliar foto/ }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/infraestructura/adjuntos?cue=180000123-00&attachmentId=attachment-1&variant=optimizada')
    expect(screen.getByRole('img', { name: 'Evidencia fotográfica ampliada' })).toHaveAttribute('src', 'https://obs.example/full')
  })
})
