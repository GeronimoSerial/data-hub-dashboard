// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReporteInicialForm } from './reporte-inicial-form'
import { jsonResponse } from '@/lib/infraestructura/test-utils/http'
import { motivos, turnos } from '@/components/test-utils/parte-formulario'
import type { CarreraElegible } from '@/lib/infraestructura/parte/instituto-ui'

const cue = '12345678'
const carreras: CarreraElegible[] = [
  { id: 1, nombre: 'Enfermería', tipo: 'Tecnicatura', totalAlumnos: 40 },
  { id: 2, nombre: 'Medicina', tipo: 'Carrera', totalAlumnos: 120 },
]
const alumnoAna = { id: 100, apellido: 'Lopez', nombre: 'Ana', carreraId: 1 }

const claveBorrador = `parte-nuevo:draft:${cue}`

function stubFetch(alumnos: unknown[] = []) {
  const llamadas: { url: string; metodo: string; body?: string }[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const metodo = init?.method ?? 'GET'
    llamadas.push({ url, metodo, body: typeof init?.body === 'string' ? init.body : undefined })
    if (url.includes('/borradores/config')) return jsonResponse({ borradoresSync: false, fotos: false, mapaBorradores: false })
    if (url.includes('/api/problematicas/parte/matricula')) return jsonResponse({ ok: true, alumnos, truncado: false })
    return jsonResponse({ ok: true, movimientoId: 'm1' }, 201)
  })
  return llamadas
}

function renderInstituto() {
  return render(<ReporteInicialForm cue={cue} turnos={turnos} motivos={motivos} carreras={carreras} />)
}

const continuar = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

async function elegirCarrera(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.click(screen.getByRole('combobox', { name: 'Carreras afectadas' }))
  await user.click(await screen.findByRole('option', { name: nombre }))
  await user.keyboard('{Escape}')
}

/** Paso 1 para "Afecta a toda la escuela": motivo Inundación, gravedad Alta. */
function completarQuePaso() {
  fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
  const dialogo = screen.queryByRole('dialog')
  if (dialogo) fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Inundación' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
}

function completarEstado() {
  fireEvent.click(screen.getByRole('radio', { name: 'Sí, con normalidad' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Sin daños / en uso normal' }))
}

function llegarAPaso2() {
  completarQuePaso()
  continuar()
}

/** Desde el paso 3 (clases y edificio): avanza hasta Confirmar y guarda. */
function guardar() {
  completarEstado()
  continuar()
  continuar()
  fireEvent.click(screen.getByRole('button', { name: /guardar situación/i }))
}

function cuerpoDelPost(llamadas: { url: string; metodo: string; body?: string }[]) {
  const post = llamadas.find((l) => l.url.includes('/api/problematicas/parte') && !l.url.includes('matricula') && l.metodo === 'POST')
  return post?.body ? JSON.parse(post.body) : undefined
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ReporteInicialForm para institutos superiores', () => {
  it('no ofrece secciones en el paso 2 y exige una carrera para continuar', async () => {
    stubFetch()
    renderInstituto()
    llegarAPaso2()
    expect(screen.queryByText('Algunas secciones')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Carreras afectadas' })).toBeTruthy()
    continuar()
    expect(await screen.findByText('Elija al menos una carrera para esta situación.')).toBeTruthy()
  })

  it('envía carreras y servicio por carrera, sin secciones', async () => {
    const user = userEvent.setup()
    const llamadas = stubFetch()
    renderInstituto()
    llegarAPaso2()
    await elegirCarrera(user, 'Enfermería')
    continuar()
    guardar()

    await waitFor(() => expect(cuerpoDelPost(llamadas)).toBeDefined())
    const cuerpo = cuerpoDelPost(llamadas)
    expect(cuerpo.afectacionesNuevas[0].carreras).toEqual([1])
    expect(cuerpo.afectacionesNuevas[0]).not.toHaveProperty('secciones')
    expect(cuerpo.afectacionesNuevas[0].alumnos).toBeUndefined()
    expect(cuerpo.servicioEducativo).toEqual({ estado: 'normal', alcance: { tipo: 'carrera', carreras: [1] } })
  })

  it('envía los alumnos elegidos dentro de la carrera', async () => {
    const user = userEvent.setup()
    const llamadas = stubFetch([alumnoAna])
    renderInstituto()
    llegarAPaso2()
    await elegirCarrera(user, 'Enfermería')
    await user.type(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo'), 'Lop')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Lopez, Ana/ }))
    continuar()
    guardar()

    await waitFor(() => expect(cuerpoDelPost(llamadas)).toBeDefined())
    const cuerpo = cuerpoDelPost(llamadas)
    expect(cuerpo.afectacionesNuevas[0].carreras).toEqual([1])
    expect(cuerpo.afectacionesNuevas[0].alumnos).toEqual([100])
  })

  it('guarda carreras y alumnos en el borrador local', async () => {
    const user = userEvent.setup()
    stubFetch([alumnoAna])
    renderInstituto()
    llegarAPaso2()
    await elegirCarrera(user, 'Enfermería')
    await user.type(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo'), 'Lop')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Lopez, Ana/ }))

    await waitFor(() => {
      const guardado = JSON.parse(localStorage.getItem(claveBorrador) ?? 'null')
      expect(guardado?.afectacion?.carreras).toEqual([1])
      expect(guardado?.afectacion?.alumnos).toEqual([100])
    })
  })

  it('restaura un borrador anterior sin campos de institutos', async () => {
    stubFetch()
    localStorage.setItem(
      claveBorrador,
      JSON.stringify({
        generacion: 'generacion-previa',
        version: 2,
        paso: 2,
        afectacion: {
          clientId: 'afectacion-previa',
          categoria: 'establecimiento',
          motivo: 'Inundación',
          severidad: 'Alta',
          descripcion: '',
          secciones: [],
          alumnos: [],
        },
        servicioEstado: '',
        estadoEstablecimiento: '',
        rigeDesde: '2026-10-04T10:00:00.000Z',
        asistenciaBrinda: 'no',
        modalidadesAsistencia: [],
        vigencia: { modo: 'ahora' },
      }),
    )
    renderInstituto()
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar donde lo dejé' }))
    expect(await screen.findByRole('combobox', { name: 'Carreras afectadas' })).toBeTruthy()
  })

  it('borra el borrador local tras un envío exitoso', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderInstituto()
    llegarAPaso2()
    await elegirCarrera(user, 'Enfermería')
    continuar()
    guardar()
    expect(await screen.findByText('Situación guardada', undefined, { timeout: 4000 })).toBeTruthy()
    expect(localStorage.getItem(claveBorrador)).toBeNull()
  })

  it('descarta de un borrador restaurado las carreras que ya no están en el catálogo', async () => {
    const llamadas = stubFetch()
    localStorage.setItem(
      claveBorrador,
      JSON.stringify({
        generacion: 'generacion-previa',
        version: 2,
        paso: 2,
        afectacion: {
          clientId: 'afectacion-previa',
          categoria: 'establecimiento',
          motivo: 'Inundación',
          severidad: 'Alta',
          descripcion: '',
          secciones: [],
          alumnos: [],
          carreras: [1, 99],
          alumnosElegidos: [],
        },
        servicioEstado: '',
        estadoEstablecimiento: '',
        rigeDesde: '2026-10-04T10:00:00.000Z',
        asistenciaBrinda: 'no',
        modalidadesAsistencia: [],
        vigencia: { modo: 'ahora' },
      }),
    )
    renderInstituto()
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar donde lo dejé' }, { timeout: 4000 }))
    const selector = await screen.findByRole('combobox', { name: 'Carreras afectadas' }, { timeout: 4000 })
    expect(selector.textContent).toContain('Enfermería')
    expect(selector.textContent).not.toContain('99')

    continuar()
    guardar()
    await waitFor(() => expect(cuerpoDelPost(llamadas)).toBeDefined(), { timeout: 4000 })
    expect(cuerpoDelPost(llamadas).afectacionesNuevas[0].carreras).toEqual([1])
  })
})
