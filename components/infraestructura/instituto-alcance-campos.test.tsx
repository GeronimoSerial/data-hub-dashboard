// @vitest-environment jsdom
import { act, render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstitutoCamposAQuienAfecta, resumenCarreras } from './instituto-alcance-campos'
import { crearAfectacionVacia, type AfectacionBorrador } from './afectacion-campos'
import { jsonResponse } from '@/lib/infraestructura/test-utils/http'
import type { CarreraElegible } from '@/lib/infraestructura/parte/instituto-ui'

const carreras: CarreraElegible[] = [
  { id: 1, nombre: 'Enfermería', tipo: 'Tecnicatura', totalAlumnos: 40 },
  { id: 2, nombre: 'Medicina', tipo: 'Carrera', totalAlumnos: 120 },
]

const alumnoAna = { id: 100, apellido: 'Lopez', nombre: 'Ana', carreraId: 1, dni: '30111222' }
const alumnoGarcia = { id: 200, apellido: 'Garcia', nombre: 'Juan', carreraId: 1 }

type Llamada = { url: string }

function stubBusqueda(respuesta: () => Response | Promise<Response>) {
  const llamadas: Llamada[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    llamadas.push({ url: String(input) })
    return respuesta()
  })
  return llamadas
}

function Harness({ inicial, onCambio }: { inicial: AfectacionBorrador; onCambio?: (a: AfectacionBorrador) => void }) {
  return (
    <InstitutoCamposAQuienAfecta
      cue="12345678"
      idPrefijo="test"
      borrador={inicial}
      carreras={carreras}
      onChange={(siguiente) => onCambio?.(siguiente)}
    />
  )
}

function renderConEstado(inicial: Partial<AfectacionBorrador> = {}) {
  const base: AfectacionBorrador = { ...crearAfectacionVacia('cliente-1'), carreras: [], alumnosElegidos: [], ...inicial }
  let actual: AfectacionBorrador = base
  const onCambio = vi.fn((siguiente: AfectacionBorrador) => {
    actual = siguiente
    rerender(<Harness inicial={actual} onCambio={onCambio} />)
  })
  const { rerender } = render(<Harness inicial={actual} onCambio={onCambio} />)
  return { onCambio, obtenerActual: () => actual }
}

async function elegirCarrera(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.click(screen.getByRole('combobox', { name: 'Carreras afectadas' }))
  await user.click(await screen.findByRole('option', { name: nombre }))
  await user.keyboard('{Escape}')
}

beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('InstitutoCamposAQuienAfecta', () => {
  it('pide elegir una carrera antes de buscar alumnos', () => {
    renderConEstado()
    expect(screen.getByText('Elija primero una carrera para buscar alumnos.')).toBeTruthy()
    expect(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo')).toHaveProperty('disabled', true)
  })

  it('elige carreras con el selector múltiple, sin select nativo', async () => {
    const user = userEvent.setup()
    const { obtenerActual } = renderConEstado()
    await elegirCarrera(user, 'Medicina')
    expect(obtenerActual().carreras).toEqual([2])
    expect(document.querySelector('select')).toBeNull()
    expect(screen.getByText('Alcanza a 1 carrera (120 alumnos)')).toBeTruthy()
  })

  it('muestra "Toda la carrera" por defecto y los alumnos elegidos como chips', async () => {
    const user = userEvent.setup()
    stubBusqueda(() => jsonResponse({ ok: true, alumnos: [alumnoAna], truncado: false }))
    const { obtenerActual } = renderConEstado({ carreras: [1] })
    expect(screen.getByText('Toda la carrera (40 alumnos)')).toBeTruthy()

    await user.type(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo'), 'Lop')
    const checkbox = await screen.findByRole('checkbox', { name: /Lopez, Ana/ })
    fireEvent.click(checkbox)

    expect(obtenerActual().alumnos).toEqual([100])
    expect(screen.getByRole('button', { name: 'Quitar a Lopez, Ana' })).toBeTruthy()
    expect(screen.getByText('1 de 40 alumnos')).toBeTruthy()
  })

  it('nunca muestra el DNI, aunque la respuesta lo traiga', async () => {
    const user = userEvent.setup()
    stubBusqueda(() => jsonResponse({ ok: true, alumnos: [alumnoAna], truncado: false }))
    renderConEstado({ carreras: [1] })
    await user.type(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo'), 'Lop')
    await screen.findByRole('checkbox', { name: /Lopez, Ana/ })
    expect(document.body.textContent).not.toContain('30111222')
  })

  it('muestra el mensaje de error del servidor sin reintentar', async () => {
    const user = userEvent.setup()
    stubBusqueda(() => jsonResponse({ error: 'Búsqueda inválida' }, 400))
    renderConEstado({ carreras: [1] })
    await user.type(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo'), 'Lop')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Búsqueda inválida')
    expect(within(alerta).queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('un DNI incompleto no se consulta y muestra la pista local', () => {
    vi.useFakeTimers()
    try {
      const llamadas = stubBusqueda(() => jsonResponse({ ok: true, alumnos: [], truncado: false }))
      renderConEstado({ carreras: [1] })
      const input = screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo')
      fireEvent.change(input, { target: { value: '3011' } })
      act(() => vi.advanceTimersByTime(500))
      expect(llamadas).toHaveLength(0)
      expect(screen.getByText('Ingrese el DNI completo')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('espera 300 ms desde la última tecla y consulta una sola vez', () => {
    vi.useFakeTimers()
    try {
      const llamadas = stubBusqueda(() => jsonResponse({ ok: true, alumnos: [], truncado: false }))
      renderConEstado({ carreras: [1] })
      const input = screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo')
      fireEvent.change(input, { target: { value: 'Lo' } })
      act(() => vi.advanceTimersByTime(100))
      fireEvent.change(input, { target: { value: 'Lop' } })
      act(() => vi.advanceTimersByTime(100))
      fireEvent.change(input, { target: { value: 'Lope' } })
      act(() => vi.advanceTimersByTime(299))
      expect(llamadas).toHaveLength(0)
      act(() => vi.advanceTimersByTime(1))
      expect(llamadas).toHaveLength(1)
      expect(llamadas[0].url).toContain('q=Lope')
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignora la respuesta tardía de una consulta anterior', async () => {
    const pendiente: { liberar?: (respuesta: Response) => void } = {}
    const llamadas: string[] = []
    vi.stubGlobal('fetch', (input: string | URL | Request) => {
      llamadas.push(String(input))
      if (llamadas.length === 1) return new Promise<Response>((resolver) => { pendiente.liberar = resolver })
      return Promise.resolve(jsonResponse({ ok: true, alumnos: [alumnoGarcia], truncado: false }))
    })
    const user = userEvent.setup()
    renderConEstado({ carreras: [1] })
    const input = screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo')
    await user.type(input, 'Lop')
    await waitFor(() => expect(llamadas).toHaveLength(1))
    await user.clear(input)
    await user.type(input, 'Gar')
    expect(await screen.findByRole('checkbox', { name: /Garcia, Juan/ })).toBeTruthy()

    await act(async () => {
      pendiente.liberar?.(jsonResponse({ ok: true, alumnos: [alumnoAna], truncado: false }))
    })
    expect(screen.queryByRole('checkbox', { name: /Lopez, Ana/ })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Garcia, Juan/ })).toBeTruthy()
  })

  it('ante un 5xx ofrece reintentar y vuelve a consultar', async () => {
    const user = userEvent.setup()
    let intentos = 0
    vi.stubGlobal('fetch', async () => {
      intentos += 1
      return intentos === 1 ? jsonResponse({ error: 'interno' }, 503) : jsonResponse({ ok: true, alumnos: [alumnoAna], truncado: false })
    })
    renderConEstado({ carreras: [1] })
    await user.type(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo'), 'Lop')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('No pudimos buscar alumnos')
    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('checkbox', { name: /Lopez, Ana/ })).toBeTruthy()
    expect(intentos).toBe(2)
  })

  it('anuncia la cantidad de alumnos en la región viva del buscador', async () => {
    const user = userEvent.setup()
    stubBusqueda(() => jsonResponse({ ok: true, alumnos: [alumnoAna], truncado: false }))
    renderConEstado({ carreras: [1] })
    await user.type(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo'), 'Lop')
    await screen.findByRole('checkbox', { name: /Lopez, Ana/ })
    expect(screen.getByText('1 alumno encontrado')).toHaveAttribute('aria-live', 'polite')
  })

  it('ante un 429 pide esperar y ofrece reintentar', async () => {
    const user = userEvent.setup()
    stubBusqueda(() => jsonResponse({ error: 'Demasiados pedidos' }, 429))
    renderConEstado({ carreras: [1] })
    await user.type(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo'), 'Lop')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Hay muchas búsquedas seguidas')
    expect(within(alerta).getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })

  it('sin conexión deshabilita la búsqueda pero deja elegir carreras completas', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const user = userEvent.setup()
    const llamadas = stubBusqueda(() => jsonResponse({ ok: true, alumnos: [], truncado: false }))
    const { obtenerActual } = renderConEstado()
    expect(screen.getByText(/Sin conexión: puede informar carreras completas/)).toBeTruthy()
    const buscador = screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo')
    expect(buscador).toHaveProperty('disabled', true)
    expect(document.getElementById(buscador.getAttribute('aria-describedby') ?? '')).toHaveTextContent('Sin conexión')
    await elegirCarrera(user, 'Enfermería')
    expect(obtenerActual().carreras).toEqual([1])
    expect(llamadas).toHaveLength(0)
  })
})

describe('InstitutoCamposAQuienAfecta sin selección de alumnos', () => {
  it('no muestra el buscador ni consulta alumnos, aunque haya carreras elegidas', () => {
    const llamadas = stubBusqueda(() => jsonResponse({ ok: true, alumnos: [alumnoAna], truncado: false }))
    const base: AfectacionBorrador = { ...crearAfectacionVacia('cliente-1'), carreras: [1], alumnosElegidos: [], alumnos: [] }
    render(
      <InstitutoCamposAQuienAfecta
        cue="12345678"
        idPrefijo="test"
        borrador={base}
        carreras={carreras}
        permiteAlumnos={false}
        onChange={() => {}}
      />,
    )
    expect(screen.queryByLabelText('Alumnos (opcional)')).toBeNull()
    expect(screen.getByText('Toda la carrera (40 alumnos)')).toBeTruthy()
    expect(llamadas).toHaveLength(0)
  })

  it('singulariza "1 alumno" en la carrera completa', () => {
    const unAlumno: CarreraElegible[] = [{ id: 1, nombre: 'Enfermería', tipo: 'Tecnicatura', totalAlumnos: 1 }]
    let actual: AfectacionBorrador = { ...crearAfectacionVacia('cliente-1'), carreras: [1], alumnosElegidos: [] }
    render(
      <InstitutoCamposAQuienAfecta cue="12345678" idPrefijo="test" borrador={actual} carreras={unAlumno} onChange={(siguiente) => { actual = siguiente }} />,
    )
    expect(screen.getByText('Toda la carrera (1 alumno)')).toBeTruthy()
  })

  it('no repite "RM" cuando la matrícula ya lo trae en la resolución', async () => {
    const user = userEvent.setup()
    const conPrefijo: CarreraElegible[] = [
      { id: 1, nombre: 'Matemática', tipo: 'Profesorado', totalAlumnos: 40, rm: 'RM 4658/15' },
      { id: 2, nombre: 'Matemática', tipo: 'Tecnicatura', totalAlumnos: 12, rm: 'R.M 690/12' },
    ]
    const borrador: AfectacionBorrador = { ...crearAfectacionVacia('cliente-1'), carreras: [], alumnosElegidos: [] }
    render(
      <InstitutoCamposAQuienAfecta cue="12345678" idPrefijo="test" borrador={borrador} carreras={conPrefijo} onChange={() => {}} />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Carreras afectadas' }))
    expect(await screen.findByRole('option', { name: 'Matemática — Profesorado (RM 4658/15)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Matemática — Tecnicatura (RM 690/12)' })).toBeInTheDocument()
    expect(screen.queryByText(/RM RM|R\.M \(RM/)).toBeNull()
  })

  it('distingue las carreras homónimas del CUE con tipo y RM en el selector', async () => {
    const user = userEvent.setup()
    const homonimas: CarreraElegible[] = [
      { id: 1, nombre: 'Matemática', tipo: 'Profesorado', totalAlumnos: 40, rm: '1464/14' },
      { id: 2, nombre: 'Matemática', tipo: 'Tecnicatura', totalAlumnos: 12, rm: '0770/21' },
    ]
    let actual: AfectacionBorrador = { ...crearAfectacionVacia('cliente-1'), carreras: [], alumnosElegidos: [] }
    const onChange = (siguiente: AfectacionBorrador) => { actual = siguiente }
    render(
      <InstitutoCamposAQuienAfecta cue="12345678" idPrefijo="test" borrador={actual} carreras={homonimas} onChange={onChange} />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Carreras afectadas' }))
    expect(await screen.findByRole('option', { name: 'Matemática — Profesorado (RM 1464/14)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Matemática — Tecnicatura (RM 0770/21)' })).toBeInTheDocument()
  })
})

describe('resumenCarreras', () => {
  it('usa singular para una carrera y plural con el total para dos o más', () => {
    expect(resumenCarreras(1)).toBe('1 carrera')
    expect(resumenCarreras(2)).toBe('2 carreras seleccionadas')
  })
})
