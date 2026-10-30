// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FichaEscuelaPanel } from './ficha-escuela-panel'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { TINTA_POR_SEVERIDAD } from '@/components/infraestructura/estado-actual-severidad'
import type { AfectacionFicha, SolucionadaFicha } from '@/lib/infraestructura/use-ficha-parte'
import type { EscuelaMapaEnriquecida, GravedadMapa } from '@/lib/infraestructura/mapa/tipos'
import type { Severidad } from '@/lib/infraestructura/validacion'
import type { MovimientoHistorial } from '@/components/infraestructura/historial-movimiento'

vi.mock('@/components/infraestructura/ficha-territorial', () => ({
  FichaTerritorial: ({ cueAnexo }: { cueAnexo: string; onEstado?: (estado: string) => void }) => (
    <div data-testid="ficha-territorial-mock">{cueAnexo}</div>
  ),
}))

vi.mock('@/components/infraestructura/riesgo-escuela', () => ({
  RiesgoEscuela: ({ horizonte, planificacion }: { horizonte: number; planificacion: { etiquetaVista: string; etiquetaNivel: string }[] | null }) => (
    <div data-testid="riesgo-escuela-mock">{`${horizonte}|${planificacion?.[0]?.etiquetaNivel ?? '-'}|${planificacion?.[0]?.etiquetaVista ?? '-'}`}</div>
  ),
}))

const escuela: EscuelaMapaEnriquecida = {
  cueAnexo: '180000123-00', nombre: 'Escuela N.º 123', departamento: 'CAPITAL', localidad: 'Corrientes',
  lat: null, lon: null, niveles: ['Inicial', 'Primario'], alumnos: 1234, gravedad: 3,
  categoriaPrincipal: 'alumnos', clases: 'sin', apoyo: 'virtual', sinActualizar: true,
  ultimaNovedad: '2026-10-05T12:00:00.000Z', alumnosSinClases: 1234,
  situacionesHistoricas: 0, solucionadasRecientes: 0,
}

const afectaciones: AfectacionFicha[] = [{
  id: 'afectacion-1', motivo: 'Inaccesibilidad', categoria: 'alumnos', severidad: 'Alta',
  impactoAlumnos: { afectados: 30, matricula: 50, porcentaje: 60, prioridad: 'Alta', corteId: 1, version: 1 },
  descripcion: 'Dos aulas sin acceso', rigeDesde: '2026-10-02T15:00:00.000Z', creadaEn: '2026-10-02T15:00:00.000Z', causadaPorId: null, totales: { secciones: 2, alumnos: 30 },
}]

const solucionadas: SolucionadaFicha[] = [{
  id: 'solucionada-1', motivo: 'Techo reparado', severidad: 'Alta', retiradaEn: '2026-10-03T15:00:00.000Z',
}]

const movimientos: MovimientoHistorial[] = [
  { id: 'mov-1', tipo: 'reporte_inicial', rol: 'director', creadaEn: '2026-09-01T12:00:00.000Z', rigeDesde: '2026-09-01T12:00:00.000Z', titulo: 'Se informó Inaccesibilidad', cambios: ['Se informó Inaccesibilidad'], severidad: 'Alta' },
  { id: 'mov-2', tipo: 'actualizacion', rol: 'director', creadaEn: '2026-09-02T12:00:00.000Z', rigeDesde: '2026-09-02T12:00:00.000Z', titulo: 'Cambió el alcance de Inaccesibilidad', cambios: ['Se actualizó el alcance de Inaccesibilidad: 1 sección más'], severidad: 'Alta' },
  { id: 'mov-3', tipo: 'confirmacion', rol: 'director', creadaEn: '2026-09-03T12:00:00.000Z', rigeDesde: '2026-09-03T12:00:00.000Z', titulo: 'Situación confirmada', cambios: ['Sigue igual: "Inaccesibilidad"'], severidad: 'Alta' },
]

function instalarFetch({ error = false, situaciones = afectaciones, recientes, estadoEstablecimiento = 'habitual' }: { error?: boolean; situaciones?: AfectacionFicha[]; recientes?: SolucionadaFicha[]; estadoEstablecimiento?: 'habitual' | 'parcial' | 'evacuado' } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: !error,
    json: async () => url.includes('/api/infraestructura/adjuntos')
      ? { movements: [] }
      : url.includes('/historial') ? { movimientos } : { ok: true, parte: { actualizadaEn: '2026-10-05T12:00:00.000Z', estadoEstablecimiento }, afectaciones: situaciones, ...(recientes === undefined ? {} : { recientes }) },
  })))
}

function renderFicha(opciones: {
  escuela?: EscuelaMapaEnriquecida
  mostrarEnlaceNominal?: boolean
  onCerrar?: () => void
  onVerAlumnosAlcanzados?: (id: string) => void
  onVerHistorialCompleto?: () => void
  urlFichaCompleta?: string
} = {}) {
  return render(
    <FichaEscuelaPanel
      escuela={opciones.escuela ?? escuela}
      acceso={<p>Acceso de prueba</p>}
      mostrarEnlaceNominal={opciones.mostrarEnlaceNominal ?? false}
      onCerrar={opciones.onCerrar ?? vi.fn()}
      onVerAlumnosAlcanzados={opciones.onVerAlumnosAlcanzados ?? vi.fn()}
      onVerHistorialCompleto={opciones.onVerHistorialCompleto ?? vi.fn()}
      urlFichaCompleta={opciones.urlFichaCompleta}
    />,
  )
}

describe('FichaEscuelaPanel', () => {
  it('actualiza la banda con la prioridad calculada, aunque el mapa conserve una gravedad anterior', async () => {
    instalarFetch({ situaciones: [{
      ...afectaciones[0], severidad: 'Crítica',
      impactoAlumnos: { afectados: 3, matricula: 5, porcentaje: 60, prioridad: 'Media', corteId: 1, version: 1 },
    }] })
    renderFicha({ escuela: { ...escuela, gravedad: 4 } })
    expect(await screen.findByText('Prioridad Media')).toBeInTheDocument()
    expect(screen.queryByText('Prioridad Crítica')).not.toBeInTheDocument()
    expect(document.querySelector('.map-ficha-escuela__gravedad')).toHaveStyle({ backgroundColor: colorSeveridad('Media') })
  })

  it('no conserva la gravedad anterior cuando no se puede calcular la prioridad', async () => {
    instalarFetch({ situaciones: [{
      ...afectaciones[0], severidad: 'Crítica',
      impactoAlumnos: { afectados: 0, matricula: 5, porcentaje: null, prioridad: null, corteId: 1, version: 1 },
    }] })
    renderFicha({ escuela: { ...escuela, gravedad: 4 } })
    expect(await screen.findAllByText('Sin datos para calcular la prioridad')).toHaveLength(2)
    expect(document.querySelector('.map-ficha-escuela__gravedad')).toBeNull()
  })

  it('no muestra una justificación manual anterior para la prioridad calculada de alumnos', async () => {
    instalarFetch({ situaciones: [{
      ...afectaciones[0], severidad: 'Crítica', justificacionCritica: 'otro',
      justificacionCriticaDetalle: 'Justificación anterior',
      impactoAlumnos: { afectados: 700, matricula: 1000, porcentaje: 70, prioridad: 'Crítica', corteId: 1, version: 1 },
    }] })
    renderFicha()
    expect(await screen.findByText('Prioridad Crítica')).toBeInTheDocument()
    expect(screen.queryByText('Justificación de gravedad')).not.toBeInTheDocument()
    expect(screen.queryByText('Justificación anterior')).not.toBeInTheDocument()
  })

  it.each([
    { codigo: 'riesgo_fisico', detalle: null, texto: 'Hay riesgo eléctrico, estructural o sanitario' },
    { codigo: 'otro', detalle: 'Cayó un árbol sobre el aula', texto: 'Otro: Cayó un árbol sobre el aula' },
  ] as const)('muestra la justificación crítica $codigo con su etiqueta y detalle', async ({ codigo, detalle, texto }) => {
    instalarFetch({ situaciones: [{
      ...afectaciones[0], categoria: 'establecimiento', severidad: 'Crítica', impactoAlumnos: undefined,
      justificacionCritica: codigo, justificacionCriticaDetalle: detalle ?? undefined,
    }] })
    renderFicha()
    expect(await screen.findByText('Justificación de gravedad')).toBeInTheDocument()
    expect(screen.getByText(texto.includes(': ') ? texto.slice(texto.indexOf(': ') + 2) : texto)).toBeInTheDocument()
  })
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

  it('muestra la ficha de peligro hidrometeorológico de la escuela seleccionada', async () => {
    instalarFetch()
    renderFicha()

    const seccion = screen.getByRole('heading', { name: 'Lluvia y río: datos de apoyo' }).closest('section')
    expect(seccion).not.toBeNull()
    expect(seccion).toContainElement(screen.getByTestId('ficha-territorial-mock'))
    expect(screen.getByTestId('ficha-territorial-mock')).toHaveTextContent(escuela.cueAnexo)
  })

  it('pasa al bloque de riesgo el mismo horizonte del Radar y el mismo nivel de Planificación', () => {
    instalarFetch()
    render(
      <FichaEscuelaPanel
        escuela={escuela}
        acceso={null}
        mostrarEnlaceNominal={false}
        onCerrar={vi.fn()}
        onVerAlumnosAlcanzados={vi.fn()}
        onVerHistorialCompleto={vi.fn()}
        horizonteRiesgo={24}
        planificacion={[{ etiquetaVista: 'Inundación', etiquetaNivel: 'Alto' }]}
      />,
    )
    expect(screen.getByTestId('riesgo-escuela-mock')).toHaveTextContent('24|Alto|Inundación')
  })

  it('muestra gravedad, cabecera, chips y los bloques desplegables', async () => {
    instalarFetch()
    renderFicha()

    expect(screen.getByText('Prioridad Alta')).toBeInTheDocument()
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
    expect(situaciones).toHaveTextContent('30 de 50 alumnos · 60% · Prioridad Alta')
    expect(situaciones).toHaveTextContent('2 secciones · 30 alumnos')
    expect(situaciones).toHaveTextContent('Desde2 de octubre, 12:00')
    expect(situaciones).toHaveTextContent('Causada porInundación')
    expect(situaciones).toHaveTextContent('Observación registrada en el reporte:Dos aulas sin acceso')
    expect(situaciones?.querySelector('blockquote p')?.textContent).toBe('Dos aulas sin acceso')
    expect(situaciones).not.toHaveTextContent('Afecta')
    expect(situaciones?.querySelectorAll('strong')).toHaveLength(1)
    expect(situaciones).toHaveTextContent('Última novedad: hace 3 h')
  })

  it('muestra la justificación crítica y el detalle de otro, pero omite justificaciones no críticas', async () => {
    instalarFetch({ situaciones: [
      { ...afectaciones[0], categoria: 'establecimiento', severidad: 'Crítica', justificacionCritica: 'mas_personas' },
      { ...afectaciones[0], id: 'afectacion-2', categoria: 'establecimiento', motivo: 'Riesgo eléctrico', severidad: 'Crítica', justificacionCritica: 'otro', justificacionCriticaDetalle: 'Cableado expuesto' },
      { ...afectaciones[0], id: 'afectacion-3', categoria: 'establecimiento', motivo: 'Filtración', justificacionCritica: 'riesgo_fisico' },
    ] })
    renderFicha()

    const situaciones = (await screen.findByText('Situaciones (3 abiertas)')).closest('details')
    expect(situaciones).toHaveTextContent('Justificación de gravedadAfecta a más personas o secciones de lo habitual')
    expect(situaciones).toHaveTextContent('Justificación de gravedadOtro')
    expect(situaciones).toHaveTextContent('Detalle de la justificaciónCableado expuesto')
    expect(screen.getAllByText('Justificación de gravedad')).toHaveLength(2)
  })

  it('muestra la justificación en la vista previa usada cuando hay enlace a la ficha completa', async () => {
    instalarFetch({ situaciones: [
      {
        ...afectaciones[0],
        categoria: 'establecimiento',
        severidad: 'Crítica',
        justificacionCritica: 'otro',
        justificacionCriticaDetalle: 'Cableado expuesto',
      },
    ] })
    renderFicha({ escuela: { ...escuela, gravedad: 4 }, urlFichaCompleta: '/escuelas/180000123-00' })

    const justificacion = await screen.findByTestId('preview-justificacion-critica')
    expect(justificacion).toHaveTextContent('Justificación de gravedad: Otro · Cableado expuesto')
    expect(screen.getByTestId('vista-previa-escuela')).toBeInTheDocument()
  })

  it('muestra las situaciones solucionadas recientes con gravedad y fecha absoluta', async () => {
    instalarFetch({ recientes: solucionadas })
    renderFicha()

    const recientes = await screen.findByText('Solucionadas recientemente (1)')
    const desplegable = recientes.closest('details')
    expect(desplegable).toHaveTextContent('Techo reparado')
    expect(desplegable).toHaveTextContent('Gravedad que teníaAlta')
    expect(desplegable).toHaveTextContent('Solucionada3 de octubre, 12:00')
    expect(desplegable).toHaveProperty('open', false)
  })

  it.each([[], undefined])('no muestra el desplegable si recientes es %s', async (recientes) => {
    instalarFetch({ recientes })
    renderFicha()

    await screen.findByText('Situaciones (1 abierta)')
    expect(screen.queryByText(/Solucionadas recientemente/)).not.toBeInTheDocument()
  })

  it('abre el desplegable de soluciones cuando no hay situaciones abiertas', async () => {
    instalarFetch({ situaciones: [], recientes: solucionadas })
    renderFicha({ escuela: { ...escuela, gravedad: 0, categoriaPrincipal: null } })

    expect(screen.getByText('Sin situaciones abiertas')).toBeInTheDocument()
    const recientes = await screen.findByText('Solucionadas recientemente (1)')
    expect(recientes.closest('details')).toHaveProperty('open', true)
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
    // "hoy" depende del reloj: se fija en el mismo día (Buenos Aires) que rigeDesde.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T18:00:00-03:00'))
    instalarFetch({ situaciones: [{
      ...afectaciones[0], rigeDesde: '2026-10-05T15:00:00.000Z', creadaEn: '2026-10-05T15:00:00.000Z',
    }] })
    renderFicha()

    expect(await screen.findByText((_, element) =>
      element?.textContent === 'Inaccesibilidad de alumnos · desde hoy, 12:00'
    )).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('muestra clases normales cerradas con la etiqueta de servicio compartida', () => {
    instalarFetch()
    const normal = { ...escuela, clases: 'normal' as const, apoyo: null }
    renderFicha({ escuela: normal })

    expect(screen.getAllByText('Funcionamiento habitual').length).toBeGreaterThan(0)
    expect(screen.getByText('Clases y asistencia pedagógica').closest('details')).toHaveProperty('open', false)
  })

  it('muestra el dato ausente de asistencia sin repetir el rótulo y conserva la etiqueta completa en el chip', () => {
    instalarFetch()
    renderFicha({ escuela: { ...escuela, apoyo: 'sin_dato' } })

    const chip = screen.getAllByText('Asistencia pedagógica sin dato').find((element) => element.classList.contains('map-sitact__pill--neutro'))
    expect(chip).toBeDefined()
    expect(chip).toHaveClass('map-sitact__pill--neutro')
    expect(screen.getByText('Asistencia pedagógica').nextElementSibling).toHaveTextContent('Sin dato')
  })

  it('muestra No se brinda bajo el rótulo de asistencia pedagógica', () => {
    instalarFetch()
    renderFicha({ escuela: { ...escuela, apoyo: 'no' } })

    expect(screen.getByText('Asistencia pedagógica').nextElementSibling).toHaveTextContent('No se brinda')
    expect(screen.getByText('Asistencia pedagógica').nextElementSibling).not.toHaveTextContent('Asistencia pedagógica')
    expect(screen.getAllByText('No se brinda asistencia pedagógica').length).toBeGreaterThan(0)
  })

  it('usa chips compartidos que permiten envolver el texto en dos líneas', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const reglaPill = css.match(/\.map-sitact__pill\s*\{[^}]*\}/)?.[0]

    expect(reglaPill).toContain('white-space: normal')
    expect(reglaPill).not.toContain('white-space: nowrap')
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
      { ...afectaciones[0], id: 'reciente', motivo: 'Inundación', categoria: 'establecimiento', impactoAlumnos: undefined, severidad: 'Alta', rigeDesde: '2026-10-04T15:00:00.000Z' },
      { ...afectaciones[0], id: 'antigua', motivo: 'Inaccesibilidad', categoria: 'establecimiento', impactoAlumnos: undefined, severidad: 'Alta', rigeDesde: '2026-10-02T15:00:00.000Z' },
    ] })
    renderFicha()

    expect(await screen.findByText((_, element) =>
      element?.textContent === 'Afecta al establecimiento · desde 4 de octubre, 12:00'
    )).toBeInTheDocument()
  })

  it('prioriza una situación de mayor severidad sobre una más reciente', async () => {
    instalarFetch({ situaciones: [
      { ...afectaciones[0], id: 'alta-antigua', categoria: 'alumnos', severidad: 'Alta', rigeDesde: '2026-10-02T15:00:00.000Z' },
      { ...afectaciones[0], id: 'media-reciente', motivo: 'Inundación', categoria: 'establecimiento', impactoAlumnos: undefined, severidad: 'Media', rigeDesde: '2026-10-04T15:00:00.000Z' },
    ] })
    renderFicha()

    expect(await screen.findByText((_, element) =>
      element?.textContent === 'Inaccesibilidad de alumnos · desde 2 de octubre, 12:00'
    )).toBeInTheDocument()
  })

  it('desempata por creadaEn más reciente cuando rigeDesde coincide', async () => {
    instalarFetch({ situaciones: [
      { ...afectaciones[0], id: 'creada-antigua', categoria: 'establecimiento', impactoAlumnos: undefined, creadaEn: '2026-10-03T15:00:00.000Z' },
      { ...afectaciones[0], id: 'creada-reciente', motivo: 'Inundación', categoria: 'establecimiento', impactoAlumnos: undefined, creadaEn: '2026-10-04T15:00:00.000Z' },
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

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar ficha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial' }))

    expect(onCerrar).toHaveBeenCalledOnce()
    expect(onVerHistorialCompleto).toHaveBeenCalledOnce()
  })

  it('al abrirse enfoca el título y Escape cierra la ficha', () => {
    instalarFetch()
    const onCerrar = vi.fn()
    renderFicha({ onCerrar })

    const titulo = screen.getByRole('heading', { name: escuela.nombre })
    const volver = screen.getByRole('button', { name: 'Cerrar ficha' })
    expect(titulo).toHaveAttribute('tabindex', '-1')
    expect(titulo).toHaveFocus()
    expect(volver).not.toHaveFocus()
    expect(volver.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCerrar).toHaveBeenCalledOnce()
  })

  it('quita el anillo del título y reserva el del botón para foco visible', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const reglaTitulo = css.match(/\.map-ficha-escuela__head h2:focus\s*\{[^}]*\}/)?.[0]
    const reglaVolver = css.match(/\.map-ficha-escuela__back:focus-visible\s*\{[^}]*\}/)?.[0]

    expect(reglaTitulo).toContain('outline: none')
    expect(css).not.toMatch(/\.map-ficha-escuela__back:focus(?!-visible)\s*\{[^}]*outline\s*:/)
    expect(reglaVolver).toContain('outline: 2px solid var(--ink)')
    expect(reglaVolver).toContain('outline-offset: 2px')
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

  it('en un instituto cuenta carreras, sin niveles GE y sin enlace a alumnos alcanzados', async () => {
    const instituto = { ...escuela, niveles: [], alumnos: 83, carreras: 2 }
    const situacionesInstituto: AfectacionFicha[] = [{
      ...afectaciones[0]!, categoria: 'establecimiento', totales: { secciones: 0, alumnos: 1084, carreras: 2 },
    }]
    instalarFetch({ situaciones: situacionesInstituto })
    renderFicha({ escuela: instituto, mostrarEnlaceNominal: true })
    expect(await screen.findByText(/2 carreras/)).toBeInTheDocument()
    expect(screen.queryByText(/Inicial, Primario/)).not.toBeInTheDocument()
    expect(screen.queryByText(/secciones/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver alumnos alcanzados' })).not.toBeInTheDocument()
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

describe('FichaEscuelaPanel — comedor y posible centro de evacuados', () => {
  beforeEach(() => { instalarFetch() })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it.each([
    ['desayuno_almuerzo', 'Comedor: desayuno y almuerzo'],
    ['solo_desayuno', 'Comedor: solo desayuno'],
    ['solo_almuerzo', 'Comedor: solo almuerzo'],
    ['sin_servicio', 'Comedor: sin servicio registrado'],
  ] as const)('muestra %s como "%s"', (comedor, texto) => {
    renderFicha({ escuela: { ...escuela, comedor } })
    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it('sin dato de comedor en la escuela no inventa ninguna línea de comedor', () => {
    renderFicha()
    expect(screen.queryByText(/^Comedor:/)).not.toBeInTheDocument()
  })

  it('una escuela apta sin antecedentes aclara que no hay datos de riesgo', () => {
    renderFicha({ escuela: { ...escuela, posibleCentroEvacuados: true, posibleCentroSinAntecedentes: true } })
    expect(screen.getByText('Posible centro de evacuados (sin antecedentes de riesgo)')).toBeInTheDocument()
  })

  it('una escuela apta muestra la insignia "Posible centro de evacuados"; una no apta no', () => {
    const { unmount } = renderFicha({ escuela: { ...escuela, posibleCentroEvacuados: true } })
    expect(screen.getByText('Posible centro de evacuados')).toBeInTheDocument()
    unmount()
    renderFicha({ escuela: { ...escuela, posibleCentroEvacuados: false } })
    expect(screen.queryByText('Posible centro de evacuados')).not.toBeInTheDocument()
  })

  it('la insignia es distinta del estado reportado "Usado como centro de evacuados"', () => {
    renderFicha({ escuela: { ...escuela, clases: 'centro', posibleCentroEvacuados: true } })
    expect(screen.getAllByText('Usado como centro de evacuados').length).toBeGreaterThan(0)
    expect(screen.getByText('Posible centro de evacuados')).toBeInTheDocument()
  })
})
