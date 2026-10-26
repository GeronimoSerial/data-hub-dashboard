// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReporteInicialForm } from './reporte-inicial-form'
import { jsonResponse } from '@/lib/infraestructura/test-utils/http'
import { vaciarEscriturasBorrador } from '@/lib/infraestructura/parte/borrador-formulario'
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

/** Paso 1 para "Inaccesibilidad de alumnos" (sólo esta categoría admite alumnos). */
function llegarAPaso2ConAlumnos() {
  fireEvent.click(screen.getByRole('radio', { name: /Inaccesibilidad de alumnos/ }))
  const dialogo = screen.queryByRole('dialog')
  if (dialogo) fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Anegamiento' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
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

beforeEach(async () => {
  cleanup()
  // Las escrituras del borrador del test anterior terminan antes de aislar el almacén.
  await vaciarEscriturasBorrador()
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

  it('en "Inaccesibilidad de alumnos" no deja continuar con una carrera sin alumnos, como GE', async () => {
    const user = userEvent.setup()
    const llamadas = stubFetch([alumnoAna])
    renderInstituto()
    llegarAPaso2ConAlumnos()
    await elegirCarrera(user, 'Enfermería')
    expect(screen.getByText('Alumnos afectados')).toBeTruthy()
    expect(screen.getByText('Elija al menos un alumno de cada carrera.')).toBeTruthy()
    continuar()
    expect(await screen.findByText('Seleccione al menos un alumno afectado en cada carrera elegida.')).toBeTruthy()
    expect(screen.queryByText('Si no elige alumnos, se informa la carrera completa.')).toBeNull()
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false)
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

  it('en "Afecta al establecimiento" no ofrece buscador de alumnos y no envía alumnos', async () => {
    const user = userEvent.setup()
    const llamadas = stubFetch([alumnoAna])
    renderInstituto()
    llegarAPaso2()
    await elegirCarrera(user, 'Enfermería')
    expect(screen.queryByPlaceholderText('Buscar por apellido, nombre o DNI completo')).toBeNull()
    expect(screen.queryByText('Alumnos (opcional)')).toBeNull()
    continuar()
    guardar()

    await waitFor(() => expect(cuerpoDelPost(llamadas)).toBeDefined())
    const cuerpo = cuerpoDelPost(llamadas)
    expect(cuerpo.afectacionesNuevas[0].carreras).toEqual([1])
    expect(cuerpo.afectacionesNuevas[0].alumnos).toBeUndefined()
    expect(llamadas.some((l) => l.url.includes('/matricula?'))).toBe(false)
  })

  it('envía los alumnos elegidos dentro de la carrera', async () => {
    const user = userEvent.setup()
    const llamadas = stubFetch([alumnoAna])
    renderInstituto()
    llegarAPaso2ConAlumnos()
    await elegirCarrera(user, 'Enfermería')
    await user.type(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo'), 'Lop')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Lopez, Ana/ }))
    continuar()
    continuar()
    continuar()
    fireEvent.click(screen.getByRole('button', { name: /guardar situación/i }))

    await waitFor(() => expect(cuerpoDelPost(llamadas)).toBeDefined())
    const cuerpo = cuerpoDelPost(llamadas)
    expect(cuerpo.afectacionesNuevas[0].carreras).toEqual([1])
    expect(cuerpo.afectacionesNuevas[0].alumnos).toEqual([100])
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
    // La eliminación del borrador va en fila: la copia local se borra al terminar, no al mostrar la confirmación.
    await waitFor(() => expect(localStorage.getItem(claveBorrador)).toBeNull())
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

  it('el mensaje de guardado nombra la institución', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderInstituto()
    llegarAPaso2()
    await elegirCarrera(user, 'Enfermería')
    continuar()
    guardar()
    expect(await screen.findByText('Ya figura en el estado actual de su institución.', undefined, { timeout: 4000 })).toBeTruthy()
  })


  it('guarda carreras y alumnos en el borrador local', async () => {
    const user = userEvent.setup()
    stubFetch([alumnoAna])
    renderInstituto()
    llegarAPaso2ConAlumnos()
    await elegirCarrera(user, 'Enfermería')
    await user.type(screen.getByPlaceholderText('Buscar por apellido, nombre o DNI completo'), 'Lop')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Lopez, Ana/ }))

    await waitFor(() => {
      const guardado = JSON.parse(localStorage.getItem(claveBorrador) ?? 'null')
      expect(guardado?.afectacion?.carreras).toEqual([1])
      expect(guardado?.afectacion?.alumnos).toEqual([100])
    })
  })


  it('la confirmación de categoría y el criterio de gravedad hablan de carreras e instituto', async () => {
    stubFetch()
    renderInstituto()
    fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText(/Va a marcar las carreras donde el instituto no puede funcionar/)).toBeTruthy()
    expect(within(dialogo).queryByText(/escuela/)).toBeNull()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Inundación' }))
    expect(screen.getByText('Condiciona el dictado: algunas carreras funcionan a medias.')).toBeTruthy()
    expect(screen.queryByText(/secciones o turnos/)).toBeNull()
  })

  it('en la evacuación habla de todo el instituto y de carreras', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderInstituto()
    llegarAPaso2()
    await elegirCarrera(user, 'Enfermería')
    continuar()
    fireEvent.click(screen.getByRole('radio', { name: 'Evacuado' }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText('¿Pasamos el alcance a todo el instituto?')).toBeTruthy()
    expect(within(dialogo).getByText(/interrumpe todo el instituto, pero marcó sólo algunas carreras/)).toBeTruthy()
    expect(within(dialogo).queryByText(/escuela/)).toBeNull()
  })


  it('un guardado que termina después de desmontar no deja una copia local que reaparezca en el próximo test', async () => {
    stubFetch()
    renderInstituto()
    // Esperar la restauración inicial: sólo después el formulario guarda borradores.
    await screen.findByRole('radio', { name: /Afecta al establecimiento/ })
    await new Promise((resolve) => setTimeout(resolve, 100))
    completarQuePaso()
    // Desmontar sin esperar: el guardado del borrador queda en curso.
    cleanup()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(localStorage.getItem(claveBorrador)).toBeNull()
  })
})
