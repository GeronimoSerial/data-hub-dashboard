// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('@/components/call-center/formulario-llamada', () => ({
  FormularioLlamada: ({ cueAnexo, onGuardada }: { cueAnexo: string; onGuardada: () => void }) => (
    <div data-testid="formulario">
      <span>Formulario {cueAnexo}</span>
      <button type="button" onClick={onGuardada}>Guardar stub</button>
    </div>
  ),
}))

import { ListaEscuelas } from './lista-escuelas'

const ESCUELAS = [
  {
    cueAnexo: '3200001',
    nombre: 'Escuela Pendiente',
    departamento: 'Paraná',
    localidad: 'Paraná',
    actualizadaEn: null,
    horasSinActualizar: 80,
    contactada: false,
    ultimaLlamada: null,
  },
  {
    cueAnexo: '3200002',
    nombre: 'Escuela Contactada',
    departamento: 'Concordia',
    localidad: 'Concordia',
    actualizadaEn: null,
    horasSinActualizar: 30,
    contactada: true,
    ultimaLlamada: { creadaEn: '2026-11-10T12:00:00.000Z', callerNombre: 'Ana Operadora' },
  },
]

function mockFetch(escuelas = ESCUELAS) {
  const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ escuelas, total: escuelas.length }),
    { status: 200 },
  ))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function renderLista() {
  render(<ListaEscuelas callerNombreInicial="Ana Operadora" />)
  await screen.findByText('Escuela Pendiente')
}

describe('ListaEscuelas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('muestra nombre, CUE y horas sin actualizar de cada escuela', async () => {
    mockFetch()
    await renderLista()

    expect(screen.getByText('CUE 3200001 · Paraná, Paraná')).toBeInTheDocument()
    expect(screen.getByText('hace 3 días sin actualizar')).toBeInTheDocument()
  })

  it('por defecto muestra pendientes y oculta contactadas', async () => {
    mockFetch()
    await renderLista()

    expect(screen.getByRole('button', { name: 'Pendientes' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Escuela Contactada')).not.toBeInTheDocument()
  })

  it('el toggle muestra contactadas y todas', async () => {
    mockFetch()
    await renderLista()

    fireEvent.click(screen.getByRole('button', { name: 'Contactadas' }))
    expect(screen.getByText('Escuela Contactada')).toBeInTheDocument()
    expect(screen.queryByText('Escuela Pendiente')).not.toBeInTheDocument()
    expect(screen.getByText(/Contactada por Ana Operadora/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(screen.getByText('Escuela Pendiente')).toBeInTheDocument()
    expect(screen.getByText('Escuela Contactada')).toBeInTheDocument()
    expect(screen.getByText('2 escuelas')).toBeInTheDocument()
  })

  it('la búsqueda filtra sin distinguir acentos ni mayúsculas', async () => {
    mockFetch()
    await renderLista()

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    fireEvent.change(screen.getByLabelText('Buscar escuela'), { target: { value: 'CONCORDIA' } })
    expect(screen.getByText('Escuela Contactada')).toBeInTheDocument()
    expect(screen.queryByText('Escuela Pendiente')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Buscar escuela'), { target: { value: 'parana' } })
    expect(screen.getByText('Escuela Pendiente')).toBeInTheDocument()
  })

  it('seleccionar una fila muestra el formulario de esa escuela', async () => {
    mockFetch()
    await renderLista()

    fireEvent.click(screen.getByRole('button', { name: /Escuela Pendiente/ }))
    expect(screen.getByTestId('formulario')).toHaveTextContent('Formulario 3200001')
  })

  it('guardar una llamada vuelve a pedir la lista', async () => {
    const fetchMock = mockFetch()
    await renderLista()

    fireEvent.click(screen.getByRole('button', { name: /Escuela Pendiente/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar stub' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenLastCalledWith('/api/call-center/escuelas')
  })

  it('muestra un alert si falla la carga', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    render(<ListaEscuelas callerNombreInicial="Ana Operadora" />)

    const alerta = await screen.findByRole('alert')
    expect(within(alerta).getByText(/No se pudo cargar/)).toBeInTheDocument()
  })

  it('no muestra teléfonos', async () => {
    mockFetch()
    await renderLista()

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(screen.queryByText(/tel[eé]fono|\+?\d{3}[\s-]?\d{4}[\s-]?\d{4}/i)).not.toBeInTheDocument()
  })
})
