// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CabeceraView } from './cabecera-view'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const page = {
  items: [{ cueAnexo: '180123456', schoolName: 'Escuela Cabecera', relationship: 'cabecera' as const, cabeceraCueAnexo: '180123456', supervisorName: 'Supervisora' }],
  nextCursor: null,
}

function json(body: unknown, ok = true) {
  return { ok, json: async () => body }
}

describe('CabeceraView request form', () => {
  it('searches critical schools by CUE and only offers the ones the endpoint returns', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('/api/cuadernillos/overview')) {
        return json({ campaignId: 'campaign-1', campaignOptions: [], balances: [] })
      }
      if (url.startsWith('/api/cuadernillos/schools')) {
        return json({ schools: [{ cueAnexo: '180123457', nombre: 'Escuela Critica', departamento: 'CAPITAL', severity: 'Crítica' }] })
      }
      return json({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraView page={page} loading={false} error={null} onLoadMore={() => {}} loadingMore={false} />)

    fireEvent.change(screen.getByLabelText('CUE de la escuela'), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))

    expect(await screen.findByText(/Escuela Critica/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cuadernillos/schools?cue=180123', expect.anything())
  })

  it('asks the server for recommendations scoped to the requesting cabecera cue', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('/api/cuadernillos/overview')) {
        return json({ campaignId: 'campaign-1', campaignOptions: [], balances: [
          { productId: 'product-1', productLabel: 'Cuadernillo A', globalAvailable: 100, quotaAssigned: 50, quotaAvailable: 50, cabeceraCueAnexo: '180123456', cabeceraName: 'Escuela Cabecera' },
        ] })
      }
      if (url.startsWith('/api/cuadernillos/schools')) {
        return json({ schools: [{ cueAnexo: '180123457', nombre: 'Escuela Critica', departamento: 'CAPITAL', severity: 'Crítica' }] })
      }
      if (url.startsWith('/api/cuadernillos/recommendations')) {
        return json({ recommendations: [{ productId: 'product-1', students: 12, suggested: 12, sourceCutId: 'cut-1' }] })
      }
      return json({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CabeceraView page={page} loading={false} error={null} onLoadMore={() => {}} loadingMore={false} />)
    fireEvent.change(screen.getByLabelText('CUE de la escuela'), { target: { value: '180123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar escuela' }))
    fireEvent.click(await screen.findByRole('button', { name: /Elegir Escuela Critica/ }))

    await waitFor(() => expect(screen.getByLabelText(/Cantidad · Cuadernillo A/)).toHaveValue(12))
    const recommendationUrl = fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.startsWith('/api/cuadernillos/recommendations'))
    expect(recommendationUrl).toContain('cueAnexo=180123457')
    expect(recommendationUrl).toContain('cabeceraCueAnexo=180123456')
  })
})
