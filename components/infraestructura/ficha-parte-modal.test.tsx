// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FichaParteModal } from './ficha-parte-modal'
import { crearParteMapa } from '@/components/test-utils/parte-mapa'

const CUE = '1801605-04'

const escuela = {
  nombre: 'Escuela 1',
  cueAnexo: CUE,
  localidad: 'Corrientes',
  departamento: 'Capital',
}

const parteResumen = crearParteMapa({
  cueAnexo: CUE,
  servicio: 'suspendido',
  estadoEstablecimiento: 'evacuado',
  afectaciones: [
    {
      id: 'a1',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      descripcion: 'El acceso principal quedó bajo agua.',
      rigeDesde: '2026-08-01T00:00:00Z',
      creadaEn: '2026-08-01T00:00:00Z',
    },
  ],
  seccionesAlcanzadas: 3,
  alumnosAlcanzados: 74,
})

function respuestaParte() {
  return {
    ok: true,
    periodo: { id: 'per1', nombre: 'Invierno 2026' },
    parte: {
      id: 'p1',
      cueAnexo: CUE,
      estadoEstablecimiento: 'evacuado',
      estadoEstablecimientoRigeDesde: '2026-08-01T00:00:00Z',
      actualizadaEn: '2026-08-01T00:00:00Z',
      asistenciaPedagogica: { brinda: true, modalidades: ['Clase virtual'] },
    },
    servicio: { estadoGeneral: 'suspendido', alcanceVigente: [] },
    afectaciones: [
      {
        id: 'a1',
        motivo: 'Inundación',
        categoria: 'establecimiento',
        severidad: 'Alta',
        descripcion: 'El acceso principal quedó bajo agua.',
        rigeDesde: '2026-08-01T00:00:00Z',
        totales: { secciones: 3, alumnos: 74 },
      },
    ],
    secciones: [
      { geSectionId: 1, turno: 'Mañana' },
      { geSectionId: 2, turno: 'Mañana' },
      { geSectionId: 3, turno: 'Tarde' },
    ],
    datosPadron: {
      niveles: ['PRIMARIA'],
      secciones: 3,
      matriculaTotal: 74,
      turnos: ['MAÑANA', 'TARDE'],
    },
    ultimaActualizacion: '2026-08-01T12:00:00Z',
  }
}

function respuestaHistorial() {
  return {
    ok: true,
    movimientos: [
      {
        id: 'm1',
        tipo: 'actualizacion',
        rol: 'director',
        creadaEn: '2026-08-01T12:00:00Z',
        rigeDesde: '2026-08-01T12:00:00Z',
        cambios: ['Clases normales → Clases suspendidas'],
      },
    ],
  }
}

function stubFetch(modo: 'normal' | 'sin-padron' | 'sin-parte' = 'normal') {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/parte?')) {
      let cuerpo
      if (modo === 'normal') {
        cuerpo = respuestaParte()
      } else if (modo === 'sin-padron') {
        // Parte sin filas GE: la escuela está en el padrón de escuelas, pero no en el corte vigente.
        cuerpo = {
          ok: true,
          periodo: { id: 'per1', nombre: 'Invierno 2026' },
          parte: null,
          servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
          afectaciones: [],
          secciones: [],
          datosPadron: null,
          ultimaActualizacion: null,
        }
      } else {
        // Parte sin afectación ni filas GE; la escuela no está en el corte del padrón.
        cuerpo = {
          ok: true,
          periodo: { id: 'per1', nombre: 'Invierno 2026' },
          parte: null,
          servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
          afectaciones: [],
          secciones: [],
          ultimaActualizacion: null,
        }
      }
      return Promise.resolve({ ok: true, json: async () => cuerpo } as Response)
    }
    if (url.includes('/historial?')) {
      const cuerpo = modo === 'normal' ? respuestaHistorial() : { ok: true, movimientos: [] }
      return Promise.resolve({ ok: true, json: async () => cuerpo } as Response)
    }
    return Promise.reject(new Error(`URL inesperada: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

type PropsFicha = Parameters<typeof FichaParteModal>[0]

const PROPS_FICHA: PropsFicha = {
  cueAnexo: CUE,
  open: true,
  onOpenChange: () => {},
  parteResumen,
  escuela,
  mostrarEnlaceNominal: false,
  onVerAlumnosAlcanzados: () => {},
  onVerHistorialCompleto: () => {},
}

function elementoFicha(overrides: Partial<PropsFicha> = {}) {
  return <FichaParteModal {...PROPS_FICHA} {...overrides} />
}

function renderFicha(overrides: Partial<PropsFicha> = {}) {
  return render(elementoFicha(overrides))
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('FichaParteModal', () => {
  it('muestra la asistencia pedagógica y sus modalidades', async () => {
    stubFetch()
    render(<FichaParteModal cueAnexo={CUE} open={true} onOpenChange={() => {}} parteResumen={parteResumen} escuela={escuela} mostrarEnlaceNominal={false} onVerAlumnosAlcanzados={() => {}} onVerHistorialCompleto={() => {}} />)
    expect(await screen.findByText('Sí · Clase virtual')).toBeInTheDocument()
  })
  it('no fetchea nada mientras el modal está cerrado', () => {
    const fetchMock = stubFetch()
    renderFicha({ open: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('muestra servicio, estado del establecimiento, afectaciones y totales', async () => {
    stubFetch()
    renderFicha()

    expect(await screen.findByText(/clases suspendidas/i)).toBeInTheDocument()
    expect(screen.getByText(/^evacuado$/i)).toBeInTheDocument()
    expect(screen.getByText('Inundación')).toBeInTheDocument()
    expect(await screen.findByText(/3 secciones · 74 alumnos/)).toBeInTheDocument()
  })

  // Hallazgo 22 / F3.2-V4: datos reales del padrón de la escuela que la ruta
  // ya devuelve para cualquier CUE, tenga o no afectación.
  it('muestra niveles, matrícula total, secciones y turnos en "Datos de la escuela"', async () => {
    stubFetch()
    renderFicha()

    expect(await screen.findByTestId('ficha-parte-padron-niveles')).toHaveTextContent(
      'Nivel educativo: PRIMARIA',
    )
    expect(screen.getByTestId('ficha-parte-padron-matricula')).toHaveTextContent(
      'Matrícula total: 74 alumnos',
    )
    expect(screen.getByTestId('ficha-parte-padron-secciones')).toHaveTextContent('3 secciones')
    expect(screen.getByTestId('ficha-parte-padron-turnos')).toHaveTextContent(
      'Turnos: MAÑANA · TARDE',
    )
  })

  // Escuela del padrón sin secciones ni matrícula en el corte vigente: se
  // dice explícitamente, nunca una tabla vacía ni ceros inventados. La frase
  // habla del CORTE de Gestión Escolar, no del padrón de escuelas (hallazgo 6).
  it('con la escuela en el padrón y `datosPadron: null` habla del corte de Gestión Escolar', async () => {
    stubFetch('sin-padron')
    renderFicha({ parteResumen: null })

    const aviso = await screen.findByTestId('ficha-parte-sin-padron')
    expect(aviso).toHaveTextContent(
      'Sin secciones ni matrícula en el corte vigente de Gestión Escolar.',
    )
    expect(aviso).not.toHaveTextContent('padrón')
  })

  // Sin `escuela` el CUE no está en el padrón cargado: es otra ausencia y
  // necesita otra frase.
  it('con `escuela: null` y `datosPadron: null` dice que no figura en el padrón cargado', async () => {
    stubFetch('sin-padron')
    renderFicha({ parteResumen: null, escuela: null })

    const aviso = await screen.findByTestId('ficha-parte-sin-padron')
    expect(aviso).toHaveTextContent(
      'La escuela no figura en el padrón cargado: sin datos de secciones ni matrícula.',
    )
    expect(aviso).not.toHaveTextContent('corte vigente de Gestión Escolar')
  })

  // Hallazgo 7/22: una escuela sin afectación vigente no tiene que verse como
  // una pantalla vacía o rota: se dice explícitamente que no hay afectaciones.
  it('muestra un mensaje explícito cuando la escuela no tiene afectaciones', async () => {
    stubFetch('sin-parte')
    renderFicha({ parteResumen: null })

    expect(await screen.findByTestId('ficha-parte-sin-afectaciones')).toHaveTextContent(
      'Sin afectaciones reportadas para esta escuela.',
    )
  })

  // Q6a: una escuela clickeada desde el padrón sin afectación vigente
  // (`parteResumen === null`) igual muestra su identidad en el encabezado,
  // tomada del padrón completo.
  it('muestra nombre y ubicación desde `escuela` aunque no haya parte', async () => {
    stubFetch('sin-parte')
    renderFicha({ parteResumen: null })

    expect(screen.getByRole('heading', { name: 'Escuela 1' })).toBeInTheDocument()
    expect(screen.getByText('1801605-04 · Corrientes, Capital')).toBeInTheDocument()
  })

  it('muestra el botón nominal por afectación sólo cuando mostrarEnlaceNominal es true', async () => {
    stubFetch()
    const onVerAlumnos = vi.fn()
    renderFicha({ mostrarEnlaceNominal: true, onVerAlumnosAlcanzados: onVerAlumnos })

    // Se espera a que resuelva el fetch (reemplaza el placeholder) antes de
    // clickear, para no clickear un botón del placeholder que ya se desmontó.
    await screen.findByText(/3 secciones · 74 alumnos/)
    const boton = screen.getByRole('button', { name: 'Ver alumnos alcanzados' })
    await userEvent.click(boton)
    expect(onVerAlumnos).toHaveBeenCalledWith('a1')
  })

  it('no muestra el botón nominal cuando mostrarEnlaceNominal es false', async () => {
    stubFetch()
    renderFicha()

    await screen.findByText(/3 secciones · 74 alumnos/)
    expect(screen.queryByRole('button', { name: 'Ver alumnos alcanzados' })).not.toBeInTheDocument()
  })

  it('muestra el bloque "qué cambió" con los primeros movimientos y permite ver el historial completo', async () => {
    stubFetch()
    const onVerHistorial = vi.fn()
    renderFicha({ onVerHistorialCompleto: onVerHistorial })

    expect(await screen.findByText('Clases normales → Clases suspendidas')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Ver historial completo' }))
    expect(onVerHistorial).toHaveBeenCalledTimes(1)
  })

  it('muestra el placeholder de parteResumen mientras espera el fetch', () => {
    stubFetch()
    renderFicha()
    // Antes de que resuelva el fetch, ya se ve el motivo desde parteResumen.
    expect(screen.getByText('Inundación')).toBeInTheDocument()
  })

  it('vuelve a pedir todo si se cierra y se reabre el modal', async () => {
    const fetchMock = stubFetch()
    const { rerender } = renderFicha()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    rerender(elementoFicha({ open: false }))
    rerender(elementoFicha())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
  })
})
