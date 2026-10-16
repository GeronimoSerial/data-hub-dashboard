// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BorradoresPendientes } from './borradores-pendientes'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const item = {
  draftId: 'server-draft-1',
  cue: '1801605-60',
  flujo: 'inicial',
  progreso: { pasoActual: 'servicios', pasosCompletados: ['inicio', 'afectaciones'] },
  actividadEn: '2026-10-15T10:00:00.000Z',
  respuestas: { servicio: { agua: 'sin_servicio' }, descripcion: 'Corte prolongado' },
}

describe('BorradoresPendientes', () => {
  it('shows server drafts apart from confirmed situations and displays allowed answers', async () => {
    const fetchMock = vi.fn(async (url: string) => url.includes('/config')
      ? Response.json({ mapaBorradores: true })
      : { ok: true, json: async () => ({ items: [item], nextCursor: null }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<BorradoresPendientes cue="1801605-60" count={2} />)

    expect(await screen.findByRole('heading', { name: 'Borradores sin enviar' })).toBeInTheDocument()
    expect(screen.getByText('2', { selector: 'strong' })).toHaveAttribute('aria-label', '2 borradores sin enviar')
    expect(screen.getByText(/2 pasos completados/)).toBeInTheDocument()
    expect(screen.getByText('Última actividad').nextElementSibling).not.toBeEmptyDOMElement()
    expect(screen.getByText(/Corte prolongado/)).toBeInTheDocument()
    expect(screen.getByText('Respuestas permitidas')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching('/api/infraestructura/borradores/1801605-60\\?limit=20'))
  })

  it('requests the next page only after an explicit action', async () => {
    let page = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/config')) return Response.json({ mapaBorradores: true })
      page += 1
      return page === 1
        ? { ok: true, json: async () => ({ items: [item], nextCursor: { actividadEn: item.actividadEn, draftId: item.draftId } }) }
        : { ok: true, json: async () => ({ items: [{ ...item, draftId: 'server-draft-2' }], nextCursor: null }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<BorradoresPendientes cue="1801605-60" count={2} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más borradores' }))

    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Reporte inicial pendiente' })).toHaveLength(2))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(String(fetchMock.mock.calls[3][0])).toContain('cursor=')
  })

  it('does not label local-only work as server-known', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/config')
      ? Response.json({ mapaBorradores: true })
      : { ok: true, json: async () => ({ items: [], nextCursor: null }) }))
    render(<BorradoresPendientes cue="1801605-60" count={0} />)

    expect(await screen.findByText('No hay borradores pendientes para esta escuela.')).toBeInTheDocument()
    expect(screen.queryByText(/guardado localmente/i)).not.toBeInTheDocument()
  })

  it('hides map drafts without requesting their page when the map flag is off', async () => {
    const fetchMock = vi.fn(async () => Response.json({ mapaBorradores: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<BorradoresPendientes cue="1801605-60" count={0} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Borradores sin enviar' })).not.toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Borradores sin enviar' })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
