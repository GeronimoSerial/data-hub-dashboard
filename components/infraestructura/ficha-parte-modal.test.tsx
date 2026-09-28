// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FichaParteModal } from './ficha-parte-modal'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'

const CUE = '1801605-04'

const escuela = {
  nombre: 'Escuela 1',
  cueAnexo: CUE,
  localidad: 'Corrientes',
  departamento: 'Capital',
}

const parteResumen: ParteMapa = {
  parteId: 'p1',
  cueAnexo: CUE,
  nombre: 'Escuela 1',
  departamento: 'Capital',
  localidad: 'Corrientes',
  lat: -27.47,
  lon: -58.83,
  servicio: 'suspendido',
  estadoEstablecimiento: 'evacuado',
  peorSeveridad: 'Alta',
  categorias: ['establecimiento'],
  afectaciones: [
    {
      id: 'a1',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      descripcion: 'El acceso principal quedó bajo agua.',
      rigeDesde: '2026-08-01T00:00:00Z',
    },
  ],
  seccionesAlcanzadas: 3,
  alumnosAlcanzados: 74,
  rigeDesde: '2026-08-01T00:00:00Z',
  actualizadaEn: '2026-08-01T00:00:00Z',
}

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

function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/parte?')) {
      return Promise.resolve({ ok: true, json: async () => respuestaParte() } as Response)
    }
    if (url.includes('/historial?')) {
      return Promise.resolve({ ok: true, json: async () => respuestaHistorial() } as Response)
    }
    return Promise.reject(new Error(`URL inesperada: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('FichaParteModal', () => {
  it('no fetchea nada mientras el modal está cerrado', () => {
    const fetchMock = stubFetch()
    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={false}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('muestra servicio, estado del establecimiento, afectaciones y totales', async () => {
    stubFetch()
    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )

    expect(await screen.findByText(/clases suspendidas/i)).toBeInTheDocument()
    expect(screen.getByText(/establecimiento evacuado/i)).toBeInTheDocument()
    expect(screen.getByText('Inundación')).toBeInTheDocument()
    expect(await screen.findByText(/3 secciones · 74 alumnos/)).toBeInTheDocument()
  })

  // Hallazgo 22 / F3.2-V4: datos reales del padrón de la escuela que la ruta
  // ya devuelve para cualquier CUE, tenga o no afectación.
  it('muestra niveles, matrícula total, secciones y turnos en "Datos de la escuela"', async () => {
    stubFetch()
    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )

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

  // Escuela sin datos en el corte vigente: se dice explícitamente, nunca una
  // tabla vacía ni ceros inventados.
  it('muestra "Sin datos del padrón para esta escuela" cuando datosPadron es null', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/parte?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            periodo: { id: 'per1', nombre: 'Invierno 2026' },
            parte: null,
            servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
            afectaciones: [],
            secciones: [],
            datosPadron: null,
            ultimaActualizacion: null,
          }),
        } as Response)
      }
      if (url.includes('/historial?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, movimientos: [] }),
        } as Response)
      }
      return Promise.reject(new Error(`URL inesperada: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={null}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )

    expect(await screen.findByTestId('ficha-parte-sin-padron')).toHaveTextContent(
      'Sin datos del padrón para esta escuela.',
    )
  })

  // Hallazgo 7/22: una escuela sin afectación vigente no tiene que verse como
  // una pantalla vacía o rota: se dice explícitamente que no hay afectaciones.
  it('muestra un mensaje explícito cuando la escuela no tiene afectaciones', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/parte?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            periodo: { id: 'per1', nombre: 'Invierno 2026' },
            parte: null,
            servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
            afectaciones: [],
            secciones: [],
            ultimaActualizacion: null,
          }),
        } as Response)
      }
      if (url.includes('/historial?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, movimientos: [] }),
        } as Response)
      }
      return Promise.reject(new Error(`URL inesperada: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={null}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )

    expect(await screen.findByTestId('ficha-parte-sin-afectaciones')).toHaveTextContent(
      'Sin afectaciones reportadas para esta escuela.',
    )
  })

  // Q6a: una escuela clickeada desde el padrón sin afectación vigente
  // (`parteResumen === null`) igual muestra su identidad en el encabezado,
  // tomada del padrón completo.
  it('muestra nombre y ubicación desde `escuela` aunque no haya parte', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/parte?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            periodo: { id: 'per1', nombre: 'Invierno 2026' },
            parte: null,
            servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
            afectaciones: [],
            secciones: [],
            ultimaActualizacion: null,
          }),
        } as Response)
      }
      if (url.includes('/historial?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, movimientos: [] }),
        } as Response)
      }
      return Promise.reject(new Error(`URL inesperada: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={null}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Escuela 1' })).toBeInTheDocument()
    expect(screen.getByText('1801605-04 · Corrientes, Capital')).toBeInTheDocument()
  })

  it('muestra el botón nominal por afectación sólo cuando mostrarEnlaceNominal es true', async () => {
    stubFetch()
    const onVerAlumnos = vi.fn()
    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
        escuela={escuela}
        mostrarEnlaceNominal={true}
        onVerAlumnosAlcanzados={onVerAlumnos}
        onVerHistorialCompleto={() => {}}
      />,
    )

    // Se espera a que resuelva el fetch (reemplaza el placeholder) antes de
    // clickear, para no clickear un botón del placeholder que ya se desmontó.
    await screen.findByText(/3 secciones · 74 alumnos/)
    const boton = screen.getByRole('button', { name: 'Ver alumnos alcanzados' })
    await userEvent.click(boton)
    expect(onVerAlumnos).toHaveBeenCalledWith('a1')
  })

  it('no muestra el botón nominal cuando mostrarEnlaceNominal es false', async () => {
    stubFetch()
    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )

    await screen.findByText(/3 secciones · 74 alumnos/)
    expect(screen.queryByRole('button', { name: 'Ver alumnos alcanzados' })).not.toBeInTheDocument()
  })

  it('muestra el bloque "qué cambió" con los primeros movimientos y permite ver el historial completo', async () => {
    stubFetch()
    const onVerHistorial = vi.fn()
    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={onVerHistorial}
      />,
    )

    expect(await screen.findByText('Clases normales → Clases suspendidas')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Ver historial completo' }))
    expect(onVerHistorial).toHaveBeenCalledTimes(1)
  })

  it('muestra el placeholder de parteResumen mientras espera el fetch', () => {
    stubFetch()
    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )
    // Antes de que resuelva el fetch, ya se ve el motivo desde parteResumen.
    expect(screen.getByText('Inundación')).toBeInTheDocument()
  })

  it('vuelve a pedir todo si se cierra y se reabre el modal', async () => {
    const fetchMock = stubFetch()
    const { rerender } = render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    rerender(
      <FichaParteModal
        cueAnexo={CUE}
        open={false}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )
    rerender(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
        escuela={escuela}
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
  })
})
