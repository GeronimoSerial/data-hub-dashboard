// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VistaExportar } from './vista-exportar'

const PREVIA = {
  total: 2,
  totalAlumnos: 1200,
  pagina: 1,
  tamanoPagina: 25,
  totalPaginas: 1,
  opciones: {
    departamentos: [{ value: 'capital', label: 'Capital' }],
    direcciones: [{ value: '1', label: 'Dirección de Nivel Secundario' }],
  },
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
    if (url.includes('formato=json')) {
      return new Response(JSON.stringify(PREVIA), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('xlsx', {
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
    expect(screen.getByRole('heading', { name: 'Exportar escuelas', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Cargando escuelas')
    const barra = screen.getByRole('toolbar', { name: 'Filtros de exportación' })
    for (const nombre of ['Estado', 'Departamento', 'Dirección', 'Gravedad']) {
      expect(within(barra).getByRole('combobox', { name: nombre })).toBeInTheDocument()
    }
    expect(screen.queryByRole('group', { name: 'Horizonte de riesgo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar Excel' })).toBeInTheDocument()
    expect(barra).not.toContainElement(screen.getByRole('button', { name: 'Descargar Excel' }))
    expect(screen.queryByRole('button', { name: 'Limpiar' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('2 escuelas')).toBeInTheDocument())
    expect(screen.getByText('Total alumnos: 1.200')).toBeInTheDocument()
  })

  it('muestra el progreso del Excel y permite cerrar el diálogo sin interrumpir la descarga', async () => {
    let terminar!: (respuesta: Response) => void
    const pendiente = new Promise<Response>(resolve => { terminar = resolve })
    fetchMock.mockImplementation(async (url: string) => url.includes('formato=json') ? Response.json(PREVIA) : pendiente)
    render(<VistaExportar />)
    await screen.findByText('2 escuelas')
    const botonDescarga = screen.getByRole('button', { name: 'Descargar Excel' })
    await user.click(botonDescarga)
    expect(await screen.findByRole('dialog', { name: 'Preparando Excel' })).toBeInTheDocument()
    expect(botonDescarga).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    terminar(new Response('xlsx'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Descargar Excel' })).toBeEnabled())
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
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
    await screen.findByText('2 escuelas')
    await elegir('Departamento', 'Capital')

    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Limpiar' })).not.toBeInTheDocument())
  })

  it('carga solo la página pedida, permite avanzar, retroceder y cambiar el tamaño', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const params = new URL(url, 'http://localhost').searchParams
      const pagina = Number(params.get('pagina'))
      const tamanoPagina = Number(params.get('tamanoPagina'))
      return Response.json({
        ...PREVIA, total: 60, pagina, tamanoPagina, totalPaginas: Math.ceil(60 / tamanoPagina),
        filas: Array.from({ length: Math.min(tamanoPagina, 60 - (pagina - 1) * tamanoPagina) }, (_, i) => {
          const numero = (pagina - 1) * tamanoPagina + i + 1
          return { cue: String(numero), escuela: `Escuela ${numero}` }
        }),
      })
    })
    render(<VistaExportar />)
    await screen.findByRole('table', { name: 'Escuelas para exportar' })
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getAllByRole('row')).toHaveLength(26)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByText('Escuela 26', {}, { timeout: 3000 })
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    expect(new URL(urlesExportar().at(-1)!, 'http://localhost').searchParams.get('pagina')).toBe('2')
    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    await screen.findByText('Escuela 1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filas por página' }), '50')
    await screen.findByText('Escuela 50')
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
    expect(urlesExportar().every(url => url.includes('formato=json'))).toBe(true)
  })

  it('ordena desde la API y reinicia la página al cambiar los filtros', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const params = new URL(url, 'http://localhost').searchParams
      return Response.json({ ...PREVIA, total: 60, pagina: Number(params.get('pagina')), totalPaginas: 3 })
    })
    render(<VistaExportar />)
    await screen.findByRole('table', { name: 'Escuelas para exportar' })
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Ordenar por Escuela' }))
    await waitFor(() => {
      const params = new URL(urlesExportar().at(-1)!, 'http://localhost').searchParams
      expect(params.get('ordenarPor')).toBe('escuela')
      expect(params.get('sentido')).toBe('asc')
      expect(params.get('pagina')).toBe('1')
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled())
    await elegir('Departamento', 'Capital')
    await waitFor(() => {
      const params = new URL(urlesExportar().at(-1)!, 'http://localhost').searchParams
      expect(params.get('depto')).toBe('capital')
      expect(params.get('pagina')).toBe('1')
      expect(params.has('ordenarPor')).toBe(false)
    })
  })

  it('permite reintentar una página que falla', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'temporal' }, { status: 500 }))
    render(<VistaExportar />)
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByRole('table', { name: 'Escuelas para exportar' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('cancela la consulta anterior al cambiar los filtros', async () => {
    render(<VistaExportar />)
    await screen.findByText('2 escuelas')
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    await elegir('Estado', 'Escuelas sin clases')
    expect(signal.aborted).toBe(true)
  })
})
