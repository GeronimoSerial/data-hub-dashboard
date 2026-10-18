// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PanelExportaciones } from './panel-exportaciones'

const ESCUELAS = [
  { cueAnexo: '1000001', departamento: 'capital', nivelJurisdiccionalId: 1, nivelJurisdiccionalNombre: 'Dirección de Nivel Secundario' },
]

function respuestaPadron() {
  return new Response(JSON.stringify({ escuelas: ESCUELAS }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/mapas/infraestructura/escuelas')) return respuestaPadron()
    return new Response(JSON.stringify({ error: 'No tiene acceso a este recurso' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PanelExportaciones', () => {
  it('lista los cinco tipos de exportación con su descripción y un botón de descarga', async () => {
    render(<PanelExportaciones />)
    for (const titulo of ['Escuelas afectadas', 'Escuelas sin clases', 'Escuelas con clases', 'Escuelas con asistencia pedagógica', 'Escuelas en riesgo']) {
      expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button', { name: 'Descargar Excel' })).toHaveLength(5)
    expect(screen.getByText(/radar de riesgo/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Departamento' })).not.toBeDisabled())
  })

  it('muestra el mensaje de error del servidor cuando la descarga falla', async () => {
    render(<PanelExportaciones />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Descargar Excel' })[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('No tiene acceso a este recurso')
  })

  it('descarga el tipo elegido con los filtros y usa el nombre de archivo del servidor', async () => {
    const clicks: string[] = []
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:exportacion'),
      revokeObjectURL: vi.fn(),
    }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download)
    })
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/mapas/infraestructura/escuelas')) return respuestaPadron()
      return new Response(new Blob(['xlsx']), {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="escuelas-en-riesgo-2026-10-18.xlsx"' },
      })
    })

    render(<PanelExportaciones />)
    fireEvent.click(screen.getByRole('button', { name: '10 días' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Descargar Excel' })[4])

    await waitFor(() => expect(clicks).toEqual(['escuelas-en-riesgo-2026-10-18.xlsx']))
    const urlDescarga = fetchMock.mock.calls.map(([url]) => url as string).find((url) => url.includes('/exportar'))
    expect(urlDescarga).toBe('/api/infraestructura/exportar?tipo=en-riesgo&horizonte=240')
  })
})
