// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Recurso } from '@/lib/model'
import { AdminSectionView } from './admin-section-view'

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

describe('AdminSectionView', () => {
  it('mantiene la tabla de motivos dentro de su área y muestra el título y la gravedad sugerida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        motivos: [{ id: 'anegamiento', nombre: 'Anegamiento', categoria: 'alumnos', orden: 10, severidadSugerida: 'Alta' }],
      }),
    }))
    render(<AdminSectionView slug="motivos" />)

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
  hubPolicy: { enabledSections: ['reports'], landing: false },
  hubDestination: '/reportes',
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('AdminSectionView: direcciones (nivel jurisdiccional)', () => {
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
      if (url === '/api/usuarios/opciones' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        const all = ['/', '/explorar', '/reportes', '/mapas', '/tableros', '/mapas/infraestructura', '/situacion', '/mapas/matricula', '/mapas/natalidad', '/tablero', '/mapa_interactivo', '/mapa_sobreedad', '/mapa_notas', '/problematicas/parte/nuevo']
        return json({ destinos: body.role === 'consulta' ? all.filter((path) => path !== '/situacion' && path !== '/problematicas/parte/nuevo') : all })
      }
      if (url === '/api/usuarios/opciones') return json({ recursos: [{ id: 'r1', titulo: 'Matrícula 2026', nivelId: 'primaria' }] })
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
    render(<AdminSectionView slug="usuarios" />)

    expect(
      await screen.findByText('Dirección de Enseñanza Privada, Nivel Central'),
    ).toBeInTheDocument()
  })

  it('ofrece los roles director de nivel y operador del establecimiento con sus etiquetas', async () => {
    const user = userEvent.setup()
    render(<AdminSectionView slug="usuarios" />)

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
    render(<AdminSectionView slug="usuarios" />)

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
    render(<AdminSectionView slug="recursos" />)

    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText('Audiencia por dirección')).toBeInTheDocument()
    expect(within(dialog).getByText('Nivel Central')).toBeInTheDocument()
  })

  it('lista el catálogo de direcciones GE en solo lectura', async () => {
    render(<AdminSectionView slug="direcciones" />)

    expect(
      await screen.findByText('Se sincroniza desde Gestión Educativa'),
    ).toBeInTheDocument()
    expect(screen.getByText('Dirección de Nivel Secundario')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar/ })).not.toBeInTheDocument()
  })

  it('rehidrata un estado explícitamente vacío sin sustituirlo por los valores heredados', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/usuarios/opciones' && init?.method === 'POST') return json({ destinos: ['/'] })
      if (url === '/api/usuarios/opciones') return json({ recursos: [] })
      if (init?.method === 'PATCH') return json({ ok: true })
      if (url === '/api/usuarios') return json({ usuarios: [{ ...usuarioFixture, hubPolicy: { enabledSections: [], landing: false }, hubDestination: null }] })
      return json({})
    })
    render(<AdminSectionView slug="usuarios" />)
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('checkbox', { name: 'Exploración' })).not.toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Permitir Inicio' })).not.toBeChecked()
    expect(within(dialog).getByText(/Sin secciones ni Inicio/)).toBeInTheDocument()
  })

  it('muestra una selección inválida al quitar el acceso que habilitaba el destino', async () => {
    const user = userEvent.setup()
    render(<AdminSectionView slug="usuarios" />)
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Reportes' }))
    expect(await within(dialog).findByText(/destino guardado ya no es válido/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('solo ofrece destinos autorizados por el rol del usuario editado', async () => {
    const user = userEvent.setup()
    render(<AdminSectionView slug="usuarios" />)
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'Rol' }))
    await user.click(await screen.findByRole('option', { name: 'Consulta' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Situación' }))
    await user.click(within(dialog).getByRole('combobox', { name: 'Destino inicial' }))
    expect(screen.queryByRole('option', { name: 'Situación' })).not.toBeInTheDocument()
  })

  it('crea un usuario solo de infraestructura con destino validado y conserva el password asignado', async () => {
    const user = userEvent.setup()
    render(<AdminSectionView slug="usuarios" />)
    await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
    const dialog = await screen.findByRole('dialog')
    const fields = within(dialog).getAllByRole('textbox')
    await user.type(fields[0], 'Usuario Infraestructura')
    await user.type(within(dialog).getByPlaceholderText('usuario@example.com'), 'infra@example.com')
    await user.type(dialog.querySelector('input[type="password"]')!, 'clave-inicial-segura')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Infraestructura' }))
    const destination = await within(dialog).findByRole('combobox', { name: 'Destino inicial' })
    await user.click(destination)
    await user.click(await screen.findByRole('option', { name: 'ENOS 2026' }))
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/usuarios' && (init as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post?.[1] as RequestInit).body as string)
      expect(body.password).toBe('clave-inicial-segura')
      expect(body.hubAccess).toEqual({ enabledSections: ['infrastructure'], landing: false, destination: '/mapas/infraestructura' })
    })
  })

  it('keeps save pending and reports API failures without closing the form', async () => {
    const user = userEvent.setup()
    let resolveSave!: (response: Response) => void
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/usuarios/opciones' && init?.method === 'POST') return Promise.resolve(json({ destinos: ['/'] }))
      if (url === '/api/usuarios/opciones') return Promise.resolve(json({ recursos: [] }))
      if (url === '/api/usuarios' && init?.method === 'POST') return new Promise<Response>((resolve) => { resolveSave = resolve })
      return Promise.resolve(json({ usuarios: [] }))
    })
    render(<AdminSectionView slug="usuarios" />)
    await user.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
    const dialog = await screen.findByRole('dialog')
    const fields = within(dialog).getAllByRole('textbox')
    await user.type(fields[0], 'Cuenta')
    await user.type(within(dialog).getByPlaceholderText('usuario@example.com'), 'cuenta@example.com')
    await user.type(dialog.querySelector('input[type="password"]')!, 'clave-inicial-segura')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Permitir Inicio' }))
    await user.click(await within(dialog).findByRole('combobox', { name: 'Destino inicial' }))
    await user.click(await screen.findByRole('option', { name: 'Inicio' }))
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled()
    resolveSave(new Response(JSON.stringify({ error: 'No se pudo guardar el usuario' }), { status: 400 }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No se pudo guardar el usuario')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
