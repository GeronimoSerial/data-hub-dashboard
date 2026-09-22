// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FichaParteModal } from './ficha-parte-modal'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'

const CUE = '1801605-04'

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
  document.body.innerHTML = ''
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

  it('muestra el botón nominal por afectación sólo cuando mostrarEnlaceNominal es true', async () => {
    stubFetch()
    const onVerAlumnos = vi.fn()
    render(
      <FichaParteModal
        cueAnexo={CUE}
        open={true}
        onOpenChange={() => {}}
        parteResumen={parteResumen}
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
        mostrarEnlaceNominal={false}
        onVerAlumnosAlcanzados={() => {}}
        onVerHistorialCompleto={() => {}}
      />,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
  })
})
