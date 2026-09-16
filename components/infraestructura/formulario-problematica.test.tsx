// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FormularioProblematica } from './formulario-problematica'

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const turnos = [
  { turno: 'Mañana', niveles: [ { nivel: 'Primario', secciones: [
    { geSectionId: 10, curso: '1°', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 28 },
    { geSectionId: 11, curso: '1°', division: 'B', nivel: 'Primario', turno: 'Mañana', matricula: 25 },
  ] } ] },
]

const props = {
  cue: '12345678',
  escuelaNombre: 'Escuela N° 45',
  turnos,
}

function impacto(overrides: Record<string, unknown> = {}) {
  return {
    alumnos: 28,
    secciones: 1,
    seccionesIrresolubles: 0,
    calculoIncompleto: false,
    cues: 1,
    cuis: 1,
    cuiDisponible: true,
    ...overrides,
  }
}

beforeEach(() => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => '00000000-0000-4000-8000-000000000000' })
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function renderFormulario() {
  return render(
    <FormularioProblematica cue={props.cue} escuelaNombre={props.escuelaNombre} turnos={props.turnos} />,
  )
}

describe('FormularioProblematica', () => {
  it('muestra el nombre de la escuela y el CUE como texto de solo lectura', () => {
    renderFormulario()

    expect(screen.getByText(props.escuelaNombre)).toBeInTheDocument()
    expect(screen.getByText(`CUE ${props.cue}`)).toBeInTheDocument()
  })

  it('no ofrece selección de escuela ni CUE y no muestra vínculos de inicio de sesión', () => {
    renderFormulario()

    expect(screen.queryByText(/iniciar sesión/i)).toBeNull()
    expect(screen.queryByRole('link', { name: /iniciar sesión/i })).toBeNull()
    expect(screen.queryByText(/login/i)).toBeNull()
    expect(document.querySelector('a[href*="/login"]')).toBeNull()
    expect(screen.queryByLabelText(/escuela/i)).toBeNull()
    expect(screen.queryByLabelText(/cue/i)).toBeNull()
    expect(screen.queryByRole('combobox', { name: /escuela|cue/i })).toBeNull()
    expect(screen.queryByRole('textbox', { name: /escuela|cue/i })).toBeNull()
  })

  it('consulta el impacto preliminar al elegir dos secciones', async () => {
    const usuario = userEvent.setup()
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/problematicas/impacto')) {
        return jsonResponse({ ok: true, impacto: impacto({ alumnos: 53, secciones: 2 }) })
      }
      return jsonResponse({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    await usuario.click(screen.getByRole('checkbox', { name: /1° "A"/ }))
    await usuario.click(screen.getByRole('checkbox', { name: /1° "B"/ }))

    await waitFor(() => {
      const llamadas = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/problematicas/impacto'))
      expect(llamadas.length).toBeGreaterThan(0)
      const body = JSON.parse(llamadas[llamadas.length - 1][1]?.body as string)
      expect(body.cue).toBe(props.cue)
      expect(body.secciones).toEqual([10, 11])
    })

    expect(await screen.findByText(/impacto preliminar: 53 alumnos en 2 secciones/i)).toBeInTheDocument()
  })

  it('envía la problemática y muestra la confirmación con el impacto real del servidor', async () => {
    const usuario = userEvent.setup()
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/api/problematicas/impacto')) {
        return jsonResponse({ ok: true, impacto: impacto() })
      }
      if (u.includes('/api/problematicas')) {
        return jsonResponse({ ok: true, id: 'abc', impacto: impacto() }, 201)
      }
      return jsonResponse({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    await usuario.selectOptions(screen.getByLabelText(/motivo/i), 'Inundación')
    await usuario.selectOptions(screen.getByLabelText(/severidad/i), 'Alta')
    await usuario.click(screen.getByRole('checkbox', { name: /1° "A"/ }))
    await usuario.click(screen.getByRole('button', { name: /registrar/i }))

    await waitFor(() => {
      const llamadas = fetchMock.mock.calls.filter(
        ([url]) => String(url).includes('/api/problematicas') && !String(url).includes('impacto'),
      )
      expect(llamadas.length).toBe(1)
      const body = JSON.parse(llamadas[0][1]?.body as string)
      expect(body.cue).toBe(props.cue)
      expect(body.motivo).toBe('Inundación')
      expect(body.severidad).toBe('Alta')
      expect(body.secciones).toEqual([10])
      expect(typeof body.idempotencyKey).toBe('string')
      expect(body.idempotencyKey.length).toBeGreaterThan(0)
    })

    expect(await screen.findByText(/afecta a 28 alumnos en 1 secciones/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /registrar/i })).toBeNull()
  })

  it('bloquea el doble envío: un solo POST a /api/problematicas ante doble click', async () => {
    const usuario = userEvent.setup()
    let resolver!: (respuesta: Response) => void
    const promesa = new Promise<Response>((resolve) => {
      resolver = resolve
    })
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/api/problematicas/impacto')) {
        return jsonResponse({ ok: true, impacto: impacto() })
      }
      if (u.includes('/api/problematicas')) {
        return promesa
      }
      return jsonResponse({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    await usuario.selectOptions(screen.getByLabelText(/motivo/i), 'Inundación')
    await usuario.selectOptions(screen.getByLabelText(/severidad/i), 'Alta')
    await usuario.click(screen.getByRole('checkbox', { name: /1° "A"/ }))
    const boton = screen.getByRole('button', { name: /registrar/i })
    await usuario.click(boton)
    await usuario.click(boton)

    resolver(jsonResponse({ ok: true, id: 'abc', impacto: impacto() }, 201))

    await waitFor(() => {
      const llamadas = fetchMock.mock.calls.filter(
        ([url]) => String(url).includes('/api/problematicas') && !String(url).includes('impacto'),
      )
      expect(llamadas.length).toBe(1)
    })

    expect(await screen.findByText(/afecta a 28 alumnos en 1 secciones/i)).toBeInTheDocument()
  })

  it('muestra un error y conserva el estado del formulario si falla la conexión', async () => {
    const usuario = userEvent.setup()
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/api/problematicas') && !u.includes('impacto')) {
        throw new Error('network')
      }
      if (u.includes('/api/problematicas/impacto')) {
        return jsonResponse({ ok: true, impacto: impacto() })
      }
      return jsonResponse({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderFormulario()

    await usuario.selectOptions(screen.getByLabelText(/motivo/i), 'Inundación')
    await usuario.selectOptions(screen.getByLabelText(/severidad/i), 'Alta')
    await usuario.click(screen.getByRole('checkbox', { name: /1° "A"/ }))
    await usuario.click(screen.getByRole('button', { name: /registrar/i }))

    expect(await screen.findByText(/no se pudo guardar/i)).toBeInTheDocument()
    expect((screen.getByLabelText(/motivo/i) as HTMLSelectElement).value).toBe('Inundación')
  })
})