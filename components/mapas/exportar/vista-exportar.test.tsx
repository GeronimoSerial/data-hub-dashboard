// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VistaExportar } from './vista-exportar'

const ESCUELAS = [
  { cueAnexo: '1000001', departamento: 'capital', nivelJurisdiccionalId: 1, nivelJurisdiccionalNombre: 'Dirección de Nivel Secundario' },
]

const PREVIA = {
  total: 2,
  columnas: [
    { clave: 'cue', encabezado: 'CUE anexo' },
    { clave: 'escuela', encabezado: 'Escuela' },
  ],
  filas: [
    { cue: '1000001', escuela: 'Escuela Uno' },
    { cue: '1000002', escuela: 'Escuela Dos' },
  ],
}

let fetchMock: ReturnType<typeof vi.fn>
let user: ReturnType<typeof userEvent.setup>

async function elegir(campo: string, opcion: string) {
  await user.click(screen.getByRole('combobox', { name: campo }))
  await user.click(await screen.findByRole('option', { name: opcion }))
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

function urlesExportar(): string[] {
  return fetchMock.mock.calls.map(([url]) => url as string).filter((url) => url.includes('/api/infraestructura/exportar'))
}

beforeEach(() => {
  user = userEvent.setup()
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/mapas/infraestructura/escuelas')) {
      return new Response(JSON.stringify({ escuelas: ESCUELAS }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('formato=json')) {
      return new Response(JSON.stringify(PREVIA), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(new Blob(['xlsx']), {
      status: 200,
      headers: { 'Content-Disposition': 'attachment; filename="escuelas-sin-clases-2026-10-18.xlsx"' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:exportacion'), revokeObjectURL: vi.fn() }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('VistaExportar', () => {
  it('muestra la barra de filtros sin tarjetas y sin horizonte hasta elegir en-riesgo', async () => {
    render(<VistaExportar />)
    const barra = screen.getByRole('toolbar', { name: 'Filtros de exportación' })
    for (const nombre of ['Estado', 'Departamento', 'Dirección', 'Gravedad']) {
      expect(within(barra).getByRole('combobox', { name: nombre })).toBeInTheDocument()
    }
    expect(screen.queryByRole('group', { name: 'Horizonte de riesgo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar Excel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('2 escuelas')).toBeInTheDocument())
  })

  it('combina un estado y un departamento en la misma consulta de vista previa', async () => {
    render(<VistaExportar />)
    await waitFor(() => expect(screen.getByText('2 escuelas')).toBeInTheDocument())

    await elegir('Estado', 'Escuelas sin clases')
    await elegir('Departamento', 'Capital')

    await waitFor(() => {
      const previa = urlesExportar().find((url) => url.includes('formato=json') && url.includes('depto=capital'))
      expect(previa).toBeDefined()
      const params = new URL(previa as string, 'http://localhost').searchParams
      expect(params.getAll('estado')).toEqual(['sin-clases'])
    })
  })

  it('descarga con la misma consulta que la vista previa, sin formato json', async () => {
    render(<VistaExportar />)
    await waitFor(() => expect(screen.getByText('2 escuelas')).toBeInTheDocument())

    await elegir('Departamento', 'Capital')
    await user.click(screen.getByRole('button', { name: 'Descargar Excel' }))

    await waitFor(() => {
      const descarga = urlesExportar().find((url) => !url.includes('formato=json') && url.includes('depto=capital'))
      expect(descarga).toBe('/api/infraestructura/exportar?depto=capital')
    })
  })

  it('muestra el horizonte solo con en-riesgo y lo incluye en la consulta', async () => {
    render(<VistaExportar />)
    await elegir('Estado', 'Escuelas en riesgo')
    await user.click(screen.getByRole('button', { name: '10 días' }))
    await waitFor(() => {
      const previa = urlesExportar().find((url) => url.includes('formato=json') && url.includes('horizonte=240'))
      expect(previa).toBeDefined()
    })
  })

  it('muestra "Limpiar" cuando hay filtros y vuelve al estado inicial al usarlo', async () => {
    render(<VistaExportar />)
    await elegir('Departamento', 'Capital')

    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Limpiar' })).not.toBeInTheDocument())
  })
})
