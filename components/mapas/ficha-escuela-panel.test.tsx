// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FichaEscuelaPanel } from './ficha-escuela-panel'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { TINTA_POR_SEVERIDAD } from '@/components/infraestructura/estado-actual-severidad'
import type { AfectacionFicha } from '@/lib/infraestructura/use-ficha-parte'
import type { EscuelaMapaEnriquecida, GravedadMapa } from '@/lib/infraestructura/mapa/tipos'
import type { Severidad } from '@/lib/infraestructura/validacion'
import type { MovimientoHistorial } from '@/components/infraestructura/historial-movimiento'

const escuela: EscuelaMapaEnriquecida = {
  cueAnexo: '180000123-00', nombre: 'Escuela N.º 123', departamento: 'CAPITAL', localidad: 'Corrientes',
  lat: null, lon: null, niveles: ['Inicial', 'Primario'], alumnos: 1234, gravedad: 3,
  categoriaPrincipal: 'alumnos', clases: 'sin', apoyo: 'virtual', sinActualizar: true,
  ultimaNovedad: '2026-10-05T12:00:00.000Z', alumnosSinClases: 1234,
  situacionesHistoricas: 0,
}

const afectaciones: AfectacionFicha[] = [{
  id: 'afectacion-1', motivo: 'Inaccesibilidad', categoria: 'alumnos', severidad: 'Alta',
  descripcion: 'Dos aulas sin acceso', rigeDesde: '2026-10-02T15:00:00.000Z', creadaEn: '2026-10-02T15:00:00.000Z', causadaPorId: null, totales: { secciones: 2, alumnos: 30 },
}]

const movimientos: MovimientoHistorial[] = [
  { id: 'mov-1', tipo: 'reporte_inicial', rol: 'director', creadaEn: '2026-09-01T12:00:00.000Z', rigeDesde: '2026-09-01T12:00:00.000Z', titulo: 'Se informó Inaccesibilidad', cambios: ['Se informó Inaccesibilidad'], severidad: 'Alta' },
  { id: 'mov-2', tipo: 'actualizacion', rol: 'director', creadaEn: '2026-09-02T12:00:00.000Z', rigeDesde: '2026-09-02T12:00:00.000Z', titulo: 'Cambió el alcance de Inaccesibilidad', cambios: ['Se actualizó el alcance de Inaccesibilidad: 1 sección más'], severidad: 'Alta' },
  { id: 'mov-3', tipo: 'confirmacion', rol: 'director', creadaEn: '2026-09-03T12:00:00.000Z', rigeDesde: '2026-09-03T12:00:00.000Z', titulo: 'Situación confirmada', cambios: ['Sigue igual: "Inaccesibilidad"'], severidad: 'Alta' },
]

function instalarFetch({ error = false, situaciones = afectaciones, estadoEstablecimiento = 'habitual' }: { error?: boolean; situaciones?: AfectacionFicha[]; estadoEstablecimiento?: 'habitual' | 'parcial' | 'evacuado' } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: !error,
    json: async () => url.includes('/historial') ? { movimientos } : { ok: true, parte: { actualizadaEn: '2026-10-05T12:00:00.000Z', estadoEstablecimiento }, afectaciones: situaciones },
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

  const gravedadesYSeveridades: Array<{ gravedad: GravedadMapa; severidad: Severidad }> = [
    { gravedad: 2, severidad: 'Media' },
    { gravedad: 4, severidad: 'Crítica' },
  ]

  it.each(gravedadesYSeveridades)('usa la tinta y el fondo de la severidad $severidad', ({ gravedad, severidad }) => {
    instalarFetch()
    renderFicha({ escuela: { ...escuela, gravedad } })

    const banda = document.querySelector('.map-ficha-escuela__gravedad')
    expect(banda).toHaveStyle({
      color: TINTA_POR_SEVERIDAD[severidad],
      backgroundColor: colorSeveridad(severidad),
    })
  })

  it('muestra gravedad, cabecera, chips y los bloques desplegables', async () => {
    instalarFetch()
    renderFicha()

    expect(screen.getByText('Gravedad Alta')).toBeInTheDocument()
    expect(screen.getByText('CUE 180000123-00 · Capital · Inicial, Primario · 1.234 alumnos')).toBeInTheDocument()
    expect(screen.getAllByText('Funcionamiento interrumpido').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Asistencia pedagógica: clase virtual').length).toBeGreaterThan(0)
    expect(screen.getByText('Sin actualizar')).toBeInTheDocument()
    expect(screen.getByText('Acceso de prueba')).toBeInTheDocument()
    expect(await screen.findByText((_, element) =>
      element?.textContent === 'Inaccesibilidad de alumnos · desde 2 de octubre, 12:00'
    )).toBeInTheDocument()
    expect(screen.getByText('Acceso').closest('details')).toHaveProperty('open', true)
    expect(screen.getByText('Clases y asistencia pedagógica').closest('details')).toHaveProperty('open', true)
    expect(screen.getByText('Asistencia pedagógica').tagName).toBe('DT')
    expect(await screen.findByText('Dos aulas sin acceso')).toBeInTheDocument()
  })

  it('muestra los campos de cada situación y la última novedad una sola vez', async () => {
    instalarFetch({ situaciones: [
      { ...afectaciones[0], causadaPorId: 'afectacion-2' },
      { ...afectaciones[0], id: 'afectacion-2', motivo: 'Inundación', descripcion: null, severidad: 'Media' },
    ] })
    renderFicha()
    const situaciones = (await screen.findByText('Situaciones (2 abiertas)')).closest('details')

    expect(await screen.findByText('Inaccesibilidad')).toBeInTheDocument()
    expect(situaciones).toHaveTextContent('Gravedad Alta')
    expect(situaciones).toHaveTextContent('2 secciones · 30 alumnos')
    expect(situaciones).toHaveTextContent('Desde2 de octubre, 12:00')
    expect(situaciones).toHaveTextContent('Causada porInundación')
    expect(situaciones).toHaveTextContent('DescripciónDos aulas sin acceso')
    expect(situaciones).not.toHaveTextContent('Afecta')
    expect(situaciones?.querySelectorAll('strong')).toHaveLength(1)
    expect(situaciones).toHaveTextContent('Última novedad: hace 3 h')
  })

  it('muestra el estado del edificio cuando hay una situación abierta de establecimiento', async () => {
    instalarFetch({
      estadoEstablecimiento: 'parcial',
      situaciones: [{ ...afectaciones[0], categoria: 'establecimiento' }],
    })
    renderFicha()
    const clases = screen.getByText('Clases y asistencia pedagógica').closest('details')
    expect(await screen.findByText('Edificio')).toBeInTheDocument()
    expect(clases).toHaveTextContent('EdificioUso parcial')
  })

  it('oculta el estado del edificio cuando sólo hay situaciones abiertas de alumnos', async () => {
    instalarFetch({ estadoEstablecimiento: 'evacuado' })
    renderFicha()
    const clases = screen.getByText('Clases y asistencia pedagógica').closest('details')
    expect(await screen.findByText('Inaccesibilidad')).toBeInTheDocument()
    expect(clases).not.toHaveTextContent('Edificio')
    expect(clases).not.toHaveTextContent('Evacuado')
  })

  it('muestra el total de situaciones y el movimiento en la línea de tiempo', async () => {
    instalarFetch()
    renderFicha({ escuela: { ...escuela, situacionesHistoricas: 1 } })

    expect(await screen.findByText('Se informó Inaccesibilidad')).toBeInTheDocument()
    expect(screen.getByText('1 situación registrada')).toBeInTheDocument()
    expect(screen.queryByText('Sigue igual: "Inaccesibilidad"')).not.toBeInTheDocument()
  })

  it('muestra el total de situaciones en plural', async () => {
    instalarFetch()
    renderFicha({ escuela: { ...escuela, situacionesHistoricas: 3 } })

    expect(await screen.findByText('3 situaciones registradas')).toBeInTheDocument()
  })

  it('indica cuando no hay situaciones registradas', async () => {
    instalarFetch()
    renderFicha({ escuela: { ...escuela, situacionesHistoricas: 0 } })

    expect(await screen.findByText('Sin situaciones registradas')).toBeInTheDocument()
  })

  it('actualiza el título de situaciones cuando llegan las afectaciones aunque el bloque esté cerrado', async () => {
    let resolverFetch: ((respuesta: { ok: boolean; json: () => Promise<{ ok: true; parte: null; afectaciones: AfectacionFicha[] }> }) => void) | undefined
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

  it('muestra desde hoy cuando la situación principal rige hoy', async () => {
    instalarFetch({ situaciones: [{
      ...afectaciones[0], rigeDesde: '2026-10-05T15:00:00.000Z', creadaEn: '2026-10-05T15:00:00.000Z',
    }] })
    renderFicha()

    expect(await screen.findByText((_, element) =>
      element?.textContent === 'Inaccesibilidad de alumnos · desde hoy, 12:00'
    )).toBeInTheDocument()
  })

  it('muestra clases normales cerradas con la etiqueta de servicio compartida', () => {
    instalarFetch()
    const normal = { ...escuela, clases: 'normal' as const, apoyo: null }
    renderFicha({ escuela: normal })

    expect(screen.getAllByText('Funcionamiento habitual').length).toBeGreaterThan(0)
    expect(screen.getByText('Clases y asistencia pedagógica').closest('details')).toHaveProperty('open', false)
  })

  it('muestra el dato ausente de asistencia con el chip neutro y la etiqueta compartida', () => {
    instalarFetch()
    renderFicha({ escuela: { ...escuela, apoyo: 'sin_dato' } })

    const chip = screen.getAllByText('Asistencia pedagógica sin dato').find((element) => element.classList.contains('map-sitact__pill--neutro'))
    expect(chip).toBeDefined()
    expect(chip).toHaveClass('map-sitact__pill--neutro')
    expect(screen.getByText('Asistencia pedagógica').nextElementSibling).toHaveTextContent('Asistencia pedagógica sin dato')
  })

  it('muestra Sin situaciones abiertas y el CTA de carga cuando la gravedad es cero', () => {
    instalarFetch()
    renderFicha({ escuela: { ...escuela, gravedad: 0, categoriaPrincipal: null } })
    expect(screen.getByText('Sin situaciones abiertas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cargar una situación' })).toHaveAttribute('href', '/infraestructura/cargar?cue=180000123-00')
  })

  it('ofrece actualizar el parte cuando hay situaciones abiertas', () => {
    instalarFetch()
    renderFicha()
    expect(screen.getByRole('link', { name: 'Actualizar el parte' })).toHaveAttribute('href', '/infraestructura/cargar?cue=180000123-00')
  })

  it('usa la situación de igual gravedad con rigeDesde más reciente', async () => {
    instalarFetch({ situaciones: [
      { ...afectaciones[0], id: 'reciente', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', rigeDesde: '2026-10-04T15:00:00.000Z' },
      { ...afectaciones[0], id: 'antigua', motivo: 'Inaccesibilidad', categoria: 'alumnos', severidad: 'Alta', rigeDesde: '2026-10-02T15:00:00.000Z' },
    ] })
    renderFicha()

    expect(await screen.findByText((_, element) =>
      element?.textContent === 'Afecta al establecimiento · desde 4 de octubre, 12:00'
    )).toBeInTheDocument()
  })

  it('prioriza una situación de mayor severidad sobre una más reciente', async () => {
    instalarFetch({ situaciones: [
      { ...afectaciones[0], id: 'alta-antigua', categoria: 'alumnos', severidad: 'Alta', rigeDesde: '2026-10-02T15:00:00.000Z' },
      { ...afectaciones[0], id: 'media-reciente', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Media', rigeDesde: '2026-10-04T15:00:00.000Z' },
    ] })
    renderFicha()

    expect(await screen.findByText((_, element) =>
      element?.textContent === 'Inaccesibilidad de alumnos · desde 2 de octubre, 12:00'
    )).toBeInTheDocument()
  })

  it('desempata por creadaEn más reciente cuando rigeDesde coincide', async () => {
    instalarFetch({ situaciones: [
      { ...afectaciones[0], id: 'creada-antigua', categoria: 'alumnos', creadaEn: '2026-10-03T15:00:00.000Z' },
      { ...afectaciones[0], id: 'creada-reciente', motivo: 'Inundación', categoria: 'establecimiento', creadaEn: '2026-10-04T15:00:00.000Z' },
    ] })
    renderFicha()

    expect(await screen.findByText((_, element) =>
      element?.textContent === 'Afecta al establecimiento · desde 2 de octubre, 12:00'
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
    expect(await screen.findByText('Dos aulas sin acceso')).toBeInTheDocument()
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
    expect(screen.getByText('Inaccesibilidad de alumnos', { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByText(/desde/)).not.toBeInTheDocument()
  })

  it('no conserva la ficha anterior al cambiar de CUE', async () => {
    instalarFetch()
    const { rerender } = renderFicha()
    expect(await screen.findByText('Dos aulas sin acceso')).toBeInTheDocument()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    rerender(
      <FichaEscuelaPanel escuela={{ ...escuela, cueAnexo: '180000999-00' }} acceso={<p>Acceso de prueba</p>}
        mostrarEnlaceNominal={false} onCerrar={vi.fn()} onVerAlumnosAlcanzados={vi.fn()} onVerHistorialCompleto={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getAllByText('Cargando…')).toHaveLength(2))
    expect(screen.queryByText('Dos aulas sin acceso')).not.toBeInTheDocument()
  })
})
