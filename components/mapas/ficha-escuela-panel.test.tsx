// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FichaEscuelaPanel } from './ficha-escuela-panel'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'

const escuela: EscuelaMapaEnriquecida = {
  cueAnexo: '180000123-00', nombre: 'Escuela N.º 123', departamento: 'CAPITAL', localidad: 'Corrientes',
  lat: null, lon: null, niveles: ['Inicial', 'Primario'], alumnos: 1234, gravedad: 3,
  categoriaPrincipal: 'alumnos', clases: 'sin', apoyo: 'virtual', sinActualizar: true,
  ultimaNovedad: '2026-10-05T12:00:00.000Z', alumnosSinClases: 1234,
  situacionesHistoricas: 0,
}

const afectaciones = [{
  id: 'afectacion-1', motivo: 'Inaccesibilidad', categoria: 'alumnos', severidad: 'Alta',
  descripcion: 'Afecta dos aulas', rigeDesde: '2026-10-02T15:00:00.000Z', totales: { secciones: 2, alumnos: 30 },
}]

const movimientos = [
  { id: 'mov-1', tipo: 'reporte_inicial', rol: 'director', creadaEn: '2026-09-01T12:00:00.000Z', rigeDesde: '2026-09-01T12:00:00.000Z', cambios: [] },
  { id: 'mov-2', tipo: 'reporte_inicial', rol: 'director', creadaEn: '2025-09-01T12:00:00.000Z', rigeDesde: '2025-09-01T12:00:00.000Z', cambios: [] },
  { id: 'mov-3', tipo: 'actualizacion', rol: 'director', creadaEn: '2026-09-02T12:00:00.000Z', rigeDesde: '2026-09-02T12:00:00.000Z', cambios: [] },
]

function instalarFetch({ error = false, situaciones = afectaciones }: { error?: boolean; situaciones?: typeof afectaciones } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: !error,
    json: async () => url.includes('/historial') ? { movimientos } : { ok: true, parte: null, afectaciones: situaciones },
  })))
}

function renderFicha(opciones: {
  escuela?: EscuelaMapaEnriquecida
  mostrarEnlaceNominal?: boolean
  onCerrar?: () => void
  onVerAlumnosAlcanzados?: (id: string) => void
  onVerHistorialCompleto?: () => void
} = {}) {
  return render(
    <FichaEscuelaPanel
      escuela={opciones.escuela ?? escuela}
      acceso={<p>Acceso de prueba</p>}
      mostrarEnlaceNominal={opciones.mostrarEnlaceNominal ?? false}
      onCerrar={opciones.onCerrar ?? vi.fn()}
      onVerAlumnosAlcanzados={opciones.onVerAlumnosAlcanzados ?? vi.fn()}
      onVerHistorialCompleto={opciones.onVerHistorialCompleto ?? vi.fn()}
    />,
  )
}

describe('FichaEscuelaPanel', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T15:00:00.000Z'))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('muestra gravedad, cabecera, chips y los bloques desplegables', async () => {
    instalarFetch()
    renderFicha()

    expect(screen.getByText('Gravedad Alta')).toBeInTheDocument()
    expect(screen.getByText('CUE 180000123-00 · Capital · Inicial, Primario · 1.234 alumnos')).toBeInTheDocument()
    expect(screen.getAllByText('Sin clases').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Apoyo virtual').length).toBeGreaterThan(0)
    expect(screen.getByText('Sin actualizar')).toBeInTheDocument()
    expect(screen.getByText('Acceso de prueba')).toBeInTheDocument()
    expect(await screen.findByText((_, element) =>
      element?.textContent === 'Inaccesibilidad de alumnos · desde hace 3 d'
    )).toBeInTheDocument()
    expect(screen.getByText('Acceso').closest('details')).toHaveProperty('open', true)
    expect(screen.getByText('Clases y apoyo pedagógico').closest('details')).toHaveProperty('open', true)
    expect(await screen.findByText('Afecta dos aulas')).toBeInTheDocument()
    expect(screen.getByText('2 situaciones en los últimos 2 años')).toBeInTheDocument()
  })

  it('actualiza el título de situaciones cuando llegan las afectaciones aunque el bloque esté cerrado', async () => {
    let resolverFetch: ((respuesta: { ok: boolean; json: () => Promise<{ ok: true; parte: null; afectaciones: typeof afectaciones }> }) => void) | undefined
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/historial')) return Promise.resolve({ ok: true, json: async () => ({ movimientos }) })
      return new Promise((resolve) => { resolverFetch = resolve })
    }))
    renderFicha()

    expect(screen.getByText('Situaciones').closest('details')).toHaveProperty('open', false)
    expect(screen.getByText('Situaciones').closest('summary')).toBeInTheDocument()

    resolverFetch?.({ ok: true, json: async () => ({ ok: true, parte: null, afectaciones: [
      afectaciones[0], { ...afectaciones[0], id: 'afectacion-2' },
    ] }) })

    expect(await screen.findByText('Situaciones (2 abiertas)')).toBeInTheDocument()
    expect(screen.getByText('Situaciones (2 abiertas)').closest('details')).toHaveProperty('open', false)
  })

  it.each([
    { situaciones: [afectaciones[0]], titulo: 'Situaciones (1 abierta)' },
    { situaciones: [], titulo: 'Situaciones (0 abiertas)' },
  ])('muestra el título "$titulo" según las afectaciones listas', async ({ situaciones, titulo }) => {
    instalarFetch({ situaciones })
    renderFicha()

    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })

  it('muestra clases normales cerradas y la etiqueta Con clases', () => {
    instalarFetch()
    const normal = { ...escuela, clases: 'normal' as const, apoyo: null }
    renderFicha({ escuela: normal })

    expect(screen.getAllByText('Con clases').length).toBeGreaterThan(0)
    expect(screen.getByText('Clases y apoyo pedagógico').closest('details')).toHaveProperty('open', false)
  })

  it('muestra Sin reportes abiertos cuando la gravedad es cero', () => {
    instalarFetch()
    renderFicha({ escuela: { ...escuela, gravedad: 0, categoriaPrincipal: null } })
    expect(screen.getByText('Sin reportes abiertos')).toBeInTheDocument()
  })

  it('usa la situación de mayor severidad cuando no coincide con la gravedad de la escuela', async () => {
    instalarFetch({ situaciones: [
      { ...afectaciones[0], id: 'media-reciente', severidad: 'Media', rigeDesde: '2026-10-04T15:00:00.000Z' },
      { ...afectaciones[0], id: 'media-antigua', severidad: 'Media', rigeDesde: '2026-10-02T15:00:00.000Z' },
      { ...afectaciones[0], id: 'baja-antigua', severidad: 'Baja', rigeDesde: '2026-09-01T15:00:00.000Z' },
    ] })
    renderFicha()

    expect(await screen.findByText((_, element) =>
      element?.textContent === 'Inaccesibilidad de alumnos · desde hace 3 d'
    )).toBeInTheDocument()
  })

  it('vuelve a la lista y abre el historial completo', () => {
    instalarFetch()
    const onCerrar = vi.fn()
    const onVerHistorialCompleto = vi.fn()
    renderFicha({ onCerrar, onVerHistorialCompleto })

    fireEvent.click(screen.getByRole('button', { name: 'Volver a la lista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial' }))

    expect(onCerrar).toHaveBeenCalledOnce()
    expect(onVerHistorialCompleto).toHaveBeenCalledOnce()
  })

  it('cierra con Escape y enfoca volver a la lista al abrirse', () => {
    instalarFetch()
    const onCerrar = vi.fn()
    renderFicha({ onCerrar })

    expect(screen.getByRole('button', { name: 'Volver a la lista' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCerrar).toHaveBeenCalledOnce()
  })

  it('ofrece ver alumnos alcanzados sólo cuando el enlace nominal está habilitado', async () => {
    instalarFetch()
    const onVerAlumnosAlcanzados = vi.fn()
    const { rerender } = renderFicha({ mostrarEnlaceNominal: false, onVerAlumnosAlcanzados })
    expect(await screen.findByText('Afecta dos aulas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver alumnos alcanzados' })).not.toBeInTheDocument()

    rerender(
      <FichaEscuelaPanel escuela={escuela} acceso={<p>Acceso de prueba</p>} mostrarEnlaceNominal
        onCerrar={vi.fn()} onVerAlumnosAlcanzados={onVerAlumnosAlcanzados} onVerHistorialCompleto={vi.fn()} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Ver alumnos alcanzados' }))
    expect(onVerAlumnosAlcanzados).toHaveBeenCalledWith('afectacion-1')
  })

  it('muestra los estados de error de ficha e historial', async () => {
    instalarFetch({ error: true })
    renderFicha()
    expect(await screen.findAllByText('No se pudo cargar la información de la escuela.')).toHaveLength(2)
    expect(screen.getByText('Situaciones').closest('summary')).toBeInTheDocument()
  })

  it('muestra los estados de carga mientras fetch sigue pendiente', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderFicha()
    const secciones = screen.getAllByText('Cargando…')
    expect(secciones).toHaveLength(2)
    expect(screen.getByText('Situaciones').closest('summary')).toBeInTheDocument()
    expect(screen.getByText('Inaccesibilidad de alumnos')).toBeInTheDocument()
  })

  it('no conserva la ficha anterior al cambiar de CUE', async () => {
    instalarFetch()
    const { rerender } = renderFicha()
    expect(await screen.findByText('Afecta dos aulas')).toBeInTheDocument()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    rerender(
      <FichaEscuelaPanel escuela={{ ...escuela, cueAnexo: '180000999-00' }} acceso={<p>Acceso de prueba</p>}
        mostrarEnlaceNominal={false} onCerrar={vi.fn()} onVerAlumnosAlcanzados={vi.fn()} onVerHistorialCompleto={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getAllByText('Cargando…')).toHaveLength(2))
    expect(screen.queryByText('Afecta dos aulas')).not.toBeInTheDocument()
  })
})
