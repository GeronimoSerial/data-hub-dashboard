// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Recurso } from '@/lib/model'
import { AdminPage } from './admin-page'

const hub = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  defaults: {
    recursos: [], niveles: [], tipos: [], categorias: [], tags: [], writeError: null,
    upsertNivel: vi.fn(), removeNivel: vi.fn(), upsertTipo: vi.fn(), removeTipo: vi.fn(),
    upsertCategoria: vi.fn(), removeCategoria: vi.fn(), upsertTag: vi.fn(), removeTag: vi.fn(),
  } as Record<string, unknown>,
}))
hub.current = hub.defaults

vi.mock('@/components/hub-data', () => ({
  useHubData: () => hub.current,
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('AdminPage', () => {
  it('mantiene la tabla de motivos dentro de su área y muestra el título y la gravedad sugerida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        motivos: [{ id: 'anegamiento', nombre: 'Anegamiento', categoria: 'alumnos', orden: 10, severidadSugerida: 'Alta' }],
      }),
    }))
    render(<AdminPage role="admin" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Motivos' }))
    expect(await screen.findByRole('table', { name: 'Administración de motivos' })).toBeInTheDocument()
    expect(screen.queryByText('Modelo único')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Gravedad sugerida' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Categoría' })).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-motivos-table-wrap')).toHaveClass('admin-motivos__table-wrap')
    expect(screen.getByText('Anegamiento').parentElement).toHaveClass('admin-motivos__nombre-contenido')
    expect(screen.getByText('Inaccesibilidad de alumnos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar motivo' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar motivo' }))
    const title = await screen.findByRole('heading', { name: 'Nuevo motivo' })
    expect(title).toHaveClass('admin-form__title')
    expect(title.nextElementSibling).toHaveClass('ui-form-grid')
    expect(screen.getAllByText('Gravedad sugerida')).toHaveLength(2)
  })
})

// ── Direcciones (nivel jurisdiccional) ────────────────────────────────────

const nivelesHub = [{ id: 'primaria', nombre: 'Primaria', orden: 1 }]

const recursoFixture = {
  id: 'r1',
  titulo: 'Matrícula 2026',
  descripcion: '',
  formato: 'reporte',
  nivelId: 'primaria',
  tipoId: 'informe',
  categoriaId: 'matricula',
  tagIds: [],
  area: '',
  actualizado: '2026-10-01',
  estado: 'publicado',
  audienciaNivelJurIds: [7],
  audienciaUserIds: [],
} as unknown as Recurso

const usuarioFixture = {
  id: 'u1',
  name: 'Ana Pérez',
  email: 'ana@example.com',
  role: 'consulta',
  banned: false,
  nivelJurIds: [2, 7],
  accesoRecursos: 'todos',
  recursoIds: [],
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('AdminPage: direcciones (nivel jurisdiccional)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    hub.current = {
      ...hub.defaults,
      recursos: [recursoFixture],
      niveles: nivelesHub,
      tipos: [{ id: 'informe', nombre: 'Informe de gestión', aplicaA: ['reporte'] }],
      categorias: [{ id: 'matricula', nombre: 'Matrícula', color: 'brand' }],
    }
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return json({ ok: true })
      if (url === '/api/usuarios') return json({ usuarios: [usuarioFixture] })
      return json({})
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    hub.current = hub.defaults
  })

  it('muestra los nombres jurisdiccionales de los niveles de cada usuario', async () => {
    window.location.hash = '#usuarios'
    render(<AdminPage role="admin" />)

    expect(
      await screen.findByText('Dirección de Enseñanza Privada, Nivel Central'),
    ).toBeInTheDocument()
  })

  it('ofrece los roles director de nivel y operador del establecimiento con sus etiquetas', async () => {
    const user = userEvent.setup()
    window.location.hash = '#usuarios'
    render(<AdminPage role="admin" />)

    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'Rol' }))

    const opciones = await screen.findAllByRole('option')
    expect(opciones.map((opcion) => opcion.textContent?.trim())).toEqual([
      'Administrador',
      'Editor',
      'Consulta',
      'Director de nivel',
      'Operador del establecimiento',
    ])
  })

  it('envía nivelJurIds como números al guardar un usuario editado', async () => {
    const user = userEvent.setup()
    window.location.hash = '#usuarios'
    render(<AdminPage role="admin" />)

    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('Direcciones (nivel jurisdiccional)'),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      )
      expect(patch).toBeDefined()
      const body = JSON.parse((patch?.[1] as RequestInit).body as string)
      expect(body.nivelJurIds).toEqual([2, 7])
    })
  })

  it('muestra la audiencia de un recurso con el nombre de la dirección', async () => {
    const user = userEvent.setup()
    render(<AdminPage role="admin" />)

    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText('Audiencia por dirección')).toBeInTheDocument()
    expect(within(dialog).getByText('Nivel Central')).toBeInTheDocument()
  })

  it('lista el catálogo de direcciones GE en solo lectura', async () => {
    window.location.hash = '#direcciones'
    render(<AdminPage role="admin" />)

    expect(
      await screen.findByText('Se sincroniza desde Gestión Educativa'),
    ).toBeInTheDocument()
    expect(screen.getByText('Dirección de Nivel Secundario')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar/ })).not.toBeInTheDocument()
  })
})
