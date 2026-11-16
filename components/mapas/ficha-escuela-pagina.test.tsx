// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FichaEscuelaPagina } from './ficha-escuela-pagina'
import type { EscuelaFichaEnriquecida } from '@/lib/infraestructura/parte-mapa'

const mockUseFichaParte = vi.fn()

vi.mock('@/lib/infraestructura/use-ficha-parte', () => ({
  useFichaParte: (...args: unknown[]) => mockUseFichaParte(...args),
}))

vi.mock('@/components/infraestructura/borradores/use-draft-counts', () => ({
  useDraftCounts: () => ({ counts: new Map(), loading: false, error: false }),
}))

vi.mock('@/lib/infraestructura/use-territorio-mapa', () => ({
  useTerritorioMapa: () => ({ data: null, loading: false, error: null }),
}))

vi.mock('@/lib/infraestructura/use-geometria-acceso', () => ({
  useGeometriaAcceso: () => ({ data: null, loading: false, error: null }),
}))

vi.mock('@/lib/infraestructura/use-exposicion-ruta', () => ({
  useExposicionRuta: () => ({ data: null, loading: false, error: null }),
}))

vi.mock('@/components/infraestructura/riesgo-escuela', () => ({
  RiesgoEscuela: ({ cueAnexo }: { cueAnexo: string }) => (
    <div data-testid="mock-riesgo-escuela">Riesgo {cueAnexo}</div>
  ),
}))

vi.mock('@/components/infraestructura/ficha-territorial', () => ({
  FichaTerritorial: ({ cueAnexo }: { cueAnexo: string }) => (
    <div data-testid="mock-ficha-territorial">Territorial {cueAnexo}</div>
  ),
}))

vi.mock('@/components/infraestructura/fotos/galeria-evidencia', () => ({
  GaleriaEvidencia: ({ cue }: { cue: string }) => (
    <div data-testid="mock-galeria-evidencia">Evidencia {cue}</div>
  ),
}))

vi.mock('@/components/infraestructura/alcance-nominal-modal', () => ({
  AlcanceNominalModal: ({ afectacionId }: { afectacionId: string | null }) =>
    afectacionId ? <div data-testid="mock-nominal-modal">Nominal {afectacionId}</div> : null,
}))

function crearEscuelaFicha(
  overrides: Partial<EscuelaFichaEnriquecida> = {},
): EscuelaFichaEnriquecida {
  return {
    cueAnexo: '1801605-00',
    nombre: 'Escuela N° 105 Sarmiento',
    departamento: 'CAPITAL',
    localidad: 'Corrientes',
    lat: -27.47,
    lon: -58.83,
    ubicacionDisponible: true,
    estado: 'sin_afectacion_reportada',
    niveles: ['Primaria'],
    alumnos: 420,
    gravedad: 0,
    categoriaPrincipal: null,
    clases: 'normal',
    apoyo: null,
    sinActualizar: false,
    ultimaNovedad: null,
    alumnosSinClases: 0,
    situacionesHistoricas: 2,
    solucionadasRecientes: 0,
    ...overrides,
  }
}

describe('FichaEscuelaPagina', () => {
  it('usa la severidad vigente y no conserva el funcionamiento del mapa anterior', () => {
    mockUseFichaParte.mockReturnValue({ estado: { fase: 'listo', datos: { parte: null, afectaciones: [], servicio: { estadoGeneral: 'normal', alcanceVigente: [] }, secciones: [] } }, historial: { fase: 'listo', movimientos: [] } })
    render(<FichaEscuelaPagina escuela={crearEscuelaFicha({ gravedad: 4 })} mostrarEnlaceNominal={false} />)
    expect(screen.getByText('Sin afectaciones reportadas')).toBeVisible()
    expect(screen.getByText('Sin información de clases')).toBeVisible()
    expect(screen.queryByText('Funcionamiento habitual')).not.toBeInTheDocument()
  })

  it.each([true, false])('muestra funcionamiento crítico con información de clases %s', (informadas) => {
    const afectacion = { id: 'critical-live', categoria: 'establecimiento', severidad: 'Crítica', motivo: 'Inundación', descripcion: null, causadaPorId: null, rigeDesde: '2026-04-10T08:00:00Z', creadaEn: '2026-04-10T08:00:00Z', totales: { secciones: 1, alumnos: 10 } }
    const alcance = informadas ? [{ id: 's1', parteId: 'p1', tipo: 'establecimiento', referenciaId: null, estado: 'normal', rigeDesde: '2026-04-10T08:00:00Z', creadaEn: '2026-04-10T08:00:00Z', retiradaEn: null }] : []
    mockUseFichaParte.mockReturnValue({ estado: { fase: 'listo', datos: { parte: { id: 'p1', estadoEstablecimiento: 'habitual' }, afectaciones: [afectacion], servicio: { estadoGeneral: 'normal', alcanceVigente: alcance }, secciones: [] } }, historial: { fase: 'listo', movimientos: [] } })
    render(<FichaEscuelaPagina escuela={crearEscuelaFicha({ gravedad: 1 })} mostrarEnlaceNominal={false} />)
    expect(screen.getByText('Funcionamiento críticamente afectado')).toBeVisible()
    expect(screen.getByText(informadas ? 'Clases normales' : 'Sin información de clases')).toBeVisible()
    expect(screen.queryByText('Funcionamiento habitual')).not.toBeInTheDocument()
  })
  it('muestra la justificación crítica de la situación principal y de las secundarias', () => {
    const base = {
      categoria: 'establecimiento', severidad: 'Crítica', descripcion: null,
      causadaPorId: null, rigeDesde: '2026-04-10T08:00:00Z', creadaEn: '2026-04-10T08:00:00Z',
      totales: { secciones: 1, alumnos: 10 },
    }
    mockUseFichaParte.mockReturnValue({
      estado: { fase: 'listo', datos: { parte: null, afectaciones: [
        { ...base, id: 'critical-1', motivo: 'Árbol caído', justificacionCritica: 'otro', justificacionCriticaDetalle: 'Bloquea la salida de emergencia' },
        { ...base, id: 'critical-2', motivo: 'Cables expuestos', justificacionCritica: 'riesgo_fisico', justificacionCriticaDetalle: null },
        { ...base, id: 'legacy', motivo: 'Sin justificación registrada' },
      ] } },
      historial: { fase: 'listo', movimientos: [] },
    })
    render(<FichaEscuelaPagina escuela={crearEscuelaFicha({ gravedad: 4 })} mostrarEnlaceNominal={false} />)
    expect(screen.getByText(/Bloquea la salida de emergencia/)).toBeInTheDocument()
    expect(screen.getByText('Hay riesgo eléctrico, estructural o sanitario')).toBeInTheDocument()
  })
  afterEach(() => {
    cleanup()
  })

  it('muestra "Volver al mapa" preservando contexto cuando viene del mapa y "Actualizar el parte" con volver', () => {
    mockUseFichaParte.mockReturnValue({
      estado: {
        fase: 'listo',
        datos: {
          periodo: { id: 'p1', nombre: 'ENOS' },
          parte: {
            id: 'parte-1',
            cueAnexo: '1801605-00',
            estadoEstablecimiento: 'parcial',
            estadoEstablecimientoRigeDesde: '2026-04-10T10:00:00Z',
            asistenciaPedagogica: null,
            actualizadaEn: '2026-04-10T10:00:00Z',
          },
          servicio: 'parcial',
          afectaciones: [
            {
              id: 'af-99',
              motivo: 'Filtraciones en techo',
              categoria: 'establecimiento',
              severidad: 'Alta',
              descripcion: 'Sector norte clausurado',
              causadaPorId: null,
              rigeDesde: '2026-04-10T08:00:00Z',
              creadaEn: '2026-04-10T08:00:00Z',
              totales: { secciones: 2, alumnos: 55 },
            },
          ],
          secciones: [],
          datosPadron: null,
          recientes: [],
          ultimaActualizacion: '2026-04-10T10:00:00Z',
        },
      },
      historial: {
        fase: 'listo',
        movimientos: [
          {
            id: 'mov-1',
            tipo: 'reporte_inicial',
            rol: 'director',
            rigeDesde: '2026-04-10T08:00:00Z',
            creadaEn: '2026-04-10T08:00:00Z',
            cambios: ['Se reportó Filtraciones en techo (Alta)'],
          },
        ],
      },
    })

    const escuela = crearEscuelaFicha({
      estado: 'afectada',
      gravedad: 3,
      categoriaPrincipal: 'establecimiento',
      clases: 'parcial',
      sinActualizar: true,
    })

    render(
      <FichaEscuelaPagina
        escuela={escuela}
        mostrarEnlaceNominal={true}
        searchParams={{
          origen: 'mapa',
          pestana: 'actual',
          departamento: 'CAPITAL',
          gravedad: '3',
        }}
      />,
    )

    const volver = screen.getByTestId('volver-al-mapa')
    expect(volver.textContent).toContain('Volver al mapa')
    expect(volver.getAttribute('href')).toContain('/mapas/infraestructura?')
    expect(volver.getAttribute('href')).toContain('cue=1801605-00')
    expect(volver.getAttribute('href')).toContain('depto=CAPITAL')

    const actualizar = screen.getByTestId('accion-actualizar-parte')
    expect(actualizar.textContent).toBe('Actualizar el parte')
    expect(actualizar.getAttribute('href')).toContain('/infraestructura/cargar?cue=1801605-00&volver=')

    // El historial se muestra inline en la página
    expect(screen.getByTestId('seccion-historial-inline').textContent).toContain(
      'Se reportó Filtraciones en techo (Alta)',
    )
    expect(screen.getByTestId('situacion-observacion')).toHaveTextContent('«Sector norte clausurado»')

    // El botón nominal abre el modal de alumnos alcanzados
    fireEvent.click(screen.getByTestId('ver-alumnos-af-99'))
    expect(screen.getByTestId('mock-nominal-modal').textContent).toContain('Nominal af-99')
  })

  it('muestra las justificaciones de situaciones críticas principales y secundarias', () => {
    mockUseFichaParte.mockReturnValue({
      estado: {
        fase: 'listo',
        datos: {
          periodo: null,
          parte: null,
          afectaciones: [
            {
              id: 'af-principal', motivo: 'Riesgo eléctrico', categoria: 'establecimiento', severidad: 'Crítica',
              justificacionCritica: 'otro', justificacionCriticaDetalle: 'Cableado expuesto',
              descripcion: null, causadaPorId: null, rigeDesde: '2026-04-10T08:00:00Z', creadaEn: '2026-04-10T08:00:00Z',
              totales: { secciones: 0, alumnos: 0 },
            },
            {
              id: 'af-secundaria', motivo: 'Sin agua', categoria: 'establecimiento', severidad: 'Crítica',
              justificacionCritica: 'mas_personas', descripcion: null, causadaPorId: null,
              rigeDesde: '2026-04-10T08:00:00Z', creadaEn: '2026-04-10T08:00:00Z', totales: { secciones: 0, alumnos: 0 },
            },
          ],
          recientes: [],
        },
      },
      historial: { fase: 'listo', movimientos: [] },
    })

    render(<FichaEscuelaPagina escuela={crearEscuelaFicha({ estado: 'afectada', gravedad: 4 })} mostrarEnlaceNominal={false} />)

    expect(screen.getByText(/Cableado expuesto/)).toBeInTheDocument()
    expect(screen.getByText(/Afecta a más personas o secciones de lo habitual/)).toBeInTheDocument()
  })

  it('muestra "Ir al mapa" en entrada directa sin origen=mapa, oculta enlace nominal si no tiene permiso y avisa falta de ubicación', () => {
    mockUseFichaParte.mockReturnValue({
      estado: {
        fase: 'listo',
        datos: {
          periodo: null,
          parte: null,
          afectaciones: [],
          recientes: [],
          datosPadron: null,
        },
      },
      historial: {
        fase: 'listo',
        movimientos: [],
      },
    })

    const escuela = crearEscuelaFicha({
      lat: null,
      lon: null,
      ubicacionDisponible: false,
    })

    render(
      <FichaEscuelaPagina
        escuela={escuela}
        mostrarEnlaceNominal={false}
        searchParams={{}}
      />,
    )

    const irAlMapa = screen.getByTestId('volver-al-mapa')
    expect(irAlMapa.textContent).toContain('Ir al mapa')
    expect(irAlMapa.getAttribute('href')).toBe('/mapas/infraestructura?cue=1801605-00#actual')
    expect(screen.getByTestId('abrir-mapa').getAttribute('href')).toBe(
      '/mapas/infraestructura?cue=1801605-00&enfocar=1#actual',
    )

    expect(screen.getByTestId('ficha-sin-ubicacion').textContent).toContain(
      'Ubicación no disponible en el mapa',
    )
    expect(screen.getByTestId('ficha-sin-reporte').textContent).toContain(
      'Sin reporte activo (la ausencia de reporte no confirma normalidad)',
    )
  })

})

describe('FichaEscuelaPagina — bitácora y evolución', () => {
  afterEach(cleanup)

  const afectacion = {
    id: 'af-1', motivo: 'Anegamiento', categoria: 'establecimiento', severidad: 'Crítica', descripcion: null,
    causadaPorId: null, rigeDesde: '2026-11-10T11:30:00Z', creadaEn: '2026-11-10T11:30:00Z', totales: { secciones: 3, alumnos: 84 },
  }
  const evento = (tipo: string, texto: string, paso: string) => ({ tipo, afectacionId: 'af-1', motivo: 'Anegamiento', texto, paso })
  const movimientos = [
    { id: 'm1', tipo: 'reporte_inicial', rol: 'director', creadaEn: '2026-11-10T11:30:00Z', rigeDesde: '2026-11-10T11:30:00Z', titulo: 'Se informó Anegamiento', cambios: [], eventos: [evento('nueva', 'Nueva: Anegamiento · media', 'Media · 1 secc.')] },
    { id: 'm2', tipo: 'actualizacion', rol: 'supervisor', creadaEn: '2026-11-12T10:50:00Z', rigeDesde: '2026-11-12T01:00:00Z', titulo: 'Cambió la gravedad', cambios: [], eventos: [evento('gravedad', 'Anegamiento pasó a crítica', '↑ Crítica')] },
    { id: 'm3', tipo: 'confirmacion', rol: 'director', creadaEn: '2026-11-14T12:12:00Z', rigeDesde: '2026-11-14T12:12:00Z', titulo: 'Situación confirmada', cambios: ['Sigue igual: "Anegamiento"'], eventos: [evento('confirmada', 'Anegamiento sigue igual', 'Sigue igual')] },
  ]
  const llamadas = [
    { id: 'l1', callerNombre: 'Operadora', justificacion: 'Seguimiento', respuestaDirector: 'Mañana bombean', creadaEn: '2026-11-13T20:40:00Z' },
  ]

  function renderConHistorial(conLlamadas: boolean) {
    mockUseFichaParte.mockReturnValue({
      estado: { fase: 'listo', datos: { parte: { id: 'p1', estadoEstablecimiento: 'habitual' }, afectaciones: [afectacion], servicio: { estadoGeneral: 'normal', alcanceVigente: [] }, secciones: [] } },
      historial: { fase: 'listo', movimientos },
    })
    render(
      <FichaEscuelaPagina
        escuela={crearEscuelaFicha({ gravedad: 4 })}
        mostrarEnlaceNominal={false}
        llamadasCallCenter={conLlamadas ? llamadas : undefined}
      />,
    )
  }

  it('shows the latest confirmation in the status strip and the log', () => {
    renderConHistorial(false)
    expect(screen.getByTestId('ficha-ultimo-movimiento')).toHaveTextContent('Anegamiento: Sigue igual')
    const primera = screen.getByTestId('seccion-historial-inline').querySelector('li')
    expect(primera).toHaveTextContent(/^Anegamiento · Sigue igual/)
  })

  it('draws the situation evolution newest first, with date, time and the supervisor', () => {
    renderConHistorial(false)
    const pasos = [...screen.getByRole('list', { name: 'Evolución' }).querySelectorAll('li')]
    expect(pasos.map((paso) => paso.textContent)).toEqual([
      expect.stringContaining('Sigue igual'),
      expect.stringMatching(/12\/11 \d{2}:\d{2}↑ Crítica · Supervisor/),
      expect.stringContaining('Media · 1 secc.'),
    ])
    expect(pasos[0]).toHaveAttribute('aria-current', 'step')
  })

  it('notes a back-dated load and supervisor in the log', () => {
    renderConHistorial(false)
    expect(screen.getByTestId('seccion-historial-inline')).toHaveTextContent(/Supervisor · rige desde/)
  })

  it('merges call-center calls into the log and filters them', () => {
    renderConHistorial(true)
    const bitacora = screen.getByTestId('seccion-historial-inline')
    expect(bitacora).toHaveTextContent('Llamada · Operadora')
    expect(bitacora).toHaveTextContent('«Mañana bombean»')
    expect(screen.getByTestId('ficha-ultimo-movimiento')).toHaveTextContent('Última llamada')
    fireEvent.click(screen.getByRole('button', { name: 'Llamadas' }))
    expect(bitacora).not.toHaveTextContent('Sigue igual')
    expect(bitacora).toHaveTextContent('Llamada · Operadora')
  })

  it('hides call filters for viewers without call-center access', () => {
    renderConHistorial(false)
    expect(screen.queryByRole('button', { name: 'Llamadas' })).not.toBeInTheDocument()
  })
})

describe('FichaEscuelaPagina — comedor y posible centro de evacuados', () => {
  afterEach(cleanup)

  const renderPagina = (overrides: Parameters<typeof crearEscuelaFicha>[0]) => render(
    <FichaEscuelaPagina escuela={crearEscuelaFicha(overrides)} mostrarEnlaceNominal={false} searchParams={{}} />,
  )

  it.each([
    ['desayuno_almuerzo', 'Desayuno y almuerzo'],
    ['solo_desayuno', 'Solo desayuno'],
    ['solo_almuerzo', 'Solo almuerzo'],
    ['sin_servicio', 'Sin servicio registrado'],
  ] as const)('muestra el comedor %s', (comedor, valor) => {
    renderPagina({ comedor })
    expect(screen.getByText('Comedor').nextElementSibling).toHaveTextContent(valor)
  })

  it('sin dato de comedor no muestra la fila', () => {
    renderPagina({})
    expect(screen.queryByText('Comedor')).not.toBeInTheDocument()
  })

  it.each([
    [{ posibleCentroEvacuados: true }],
    [{ posibleCentroEvacuados: true, posibleCentroSinAntecedentes: true as const }],
    [{ posibleCentroEvacuados: false }],
  ])('does not show the computed evacuation-center suggestion (%o)', (marcas) => {
    renderPagina(marcas)
    expect(screen.queryByText('Posible centro de evacuados')).not.toBeInTheDocument()
  })
})

describe('FichaEscuelaPagina — zero and just-now values', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('hides enrollment counts when the school reports no students', () => {
    const afectacion = { id: 'a0', categoria: 'establecimiento', severidad: 'Media', motivo: 'Inundación', descripcion: null, causadaPorId: null, rigeDesde: '2026-04-10T08:00:00Z', creadaEn: '2026-04-10T08:00:00Z', totales: { secciones: 0, alumnos: 0 } }
    mockUseFichaParte.mockReturnValue({ estado: { fase: 'listo', datos: { parte: { id: 'p1', estadoEstablecimiento: 'habitual' }, afectaciones: [afectacion], servicio: { estadoGeneral: 'normal', alcanceVigente: [] }, secciones: [] } }, historial: { fase: 'listo', movimientos: [] } })
    render(<FichaEscuelaPagina escuela={crearEscuelaFicha({ alumnos: 0, gravedad: 2 })} mostrarEnlaceNominal={false} />)
    expect(screen.queryByText(/0 alumnos/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 de 0/)).not.toBeInTheDocument()
    expect(screen.getByText(/CUE 1801605-00/)).toBeVisible()
  })

  it('says "recién" instead of "hace 0 min" for a report updated under a minute ago', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-04-10T08:00:30Z'))
    mockUseFichaParte.mockReturnValue({ estado: { fase: 'listo', datos: { parte: { id: 'p1', estadoEstablecimiento: 'habitual', actualizadaEn: '2026-04-10T08:00:00Z' }, afectaciones: [], servicio: { estadoGeneral: 'normal', alcanceVigente: [] }, secciones: [] } }, historial: { fase: 'listo', movimientos: [] } })
    render(<FichaEscuelaPagina escuela={crearEscuelaFicha()} mostrarEnlaceNominal={false} />)
    expect(screen.getByTestId('ficha-ultimo-movimiento')).toHaveTextContent('Última novedad recién')
    expect(screen.queryByText(/hace 0 min/)).not.toBeInTheDocument()
  })
})

describe('FichaEscuelaPagina — which situation is newest', () => {
  afterEach(cleanup)

  const base = { categoria: 'establecimiento', descripcion: null, causadaPorId: null, totales: { secciones: 1, alumnos: 10 } }
  const grave = { ...base, id: 'grave', motivo: 'Inundación', severidad: 'Crítica', rigeDesde: '2026-11-09T10:00:00Z', creadaEn: '2026-11-09T10:00:00Z' }
  const vieja = { ...base, id: 'vieja', motivo: 'Filtración', severidad: 'Baja', rigeDesde: '2026-11-10T10:00:00Z', creadaEn: '2026-11-10T10:00:00Z' }
  const nueva = { ...base, id: 'nueva', motivo: 'Corte de luz', severidad: 'Media', rigeDesde: '2026-11-12T10:00:00Z', creadaEn: '2026-11-12T10:00:00Z' }
  const evento = (afectacionId: string, motivo: string, tipo: string, paso: string) => ({ tipo, afectacionId, motivo, texto: `${motivo} ${paso}`, paso })
  const movimientos = [
    { id: 'm1', tipo: 'reporte_inicial', rol: 'director', creadaEn: '2026-11-09T10:00:00Z', rigeDesde: '2026-11-09T10:00:00Z', titulo: '', cambios: [], eventos: [evento('grave', 'Inundación', 'nueva', 'Crítica · 1 secc.')] },
    { id: 'm2', tipo: 'actualizacion', rol: 'director', creadaEn: '2026-11-10T10:00:00Z', rigeDesde: '2026-11-10T10:00:00Z', titulo: '', cambios: [], eventos: [evento('vieja', 'Filtración', 'nueva', 'Baja · 1 secc.')] },
    { id: 'm3', tipo: 'actualizacion', rol: 'director', creadaEn: '2026-11-12T10:00:00Z', rigeDesde: '2026-11-12T10:00:00Z', titulo: '', cambios: [], eventos: [evento('nueva', 'Corte de luz', 'nueva', 'Media · 1 secc.')] },
  ]

  it('orders every open situation by its last change, newest first, regardless of severity', () => {
    mockUseFichaParte.mockReturnValue({
      estado: { fase: 'listo', datos: { parte: { id: 'p1', estadoEstablecimiento: 'habitual' }, afectaciones: [vieja, grave, nueva], servicio: { estadoGeneral: 'normal', alcanceVigente: [] }, secciones: [] } },
      historial: { fase: 'listo', movimientos },
    })
    render(<FichaEscuelaPagina escuela={crearEscuelaFicha({ gravedad: 4 })} mostrarEnlaceNominal={false} />)
    const tarjetas = [...document.querySelectorAll('#situaciones article')]
    expect(tarjetas.map((tarjeta) => tarjeta.querySelector('h2')?.textContent)).toEqual(['Corte de luz', 'Filtración', 'Inundación'])
    expect(tarjetas[0]).toHaveAttribute('data-testid', 'ficha-incidente')
    expect(tarjetas[0].querySelector('time')).toHaveTextContent(/12\/11/)
    expect(tarjetas[2]).toHaveTextContent(/Cargada 9\/11/)
    expect(screen.getByText('Por último cambio, más reciente primero')).toBeVisible()
  })

  it('puts the situation in bold as the subject of each log line', () => {
    mockUseFichaParte.mockReturnValue({
      estado: { fase: 'listo', datos: { parte: { id: 'p1', estadoEstablecimiento: 'habitual' }, afectaciones: [vieja, grave, nueva], servicio: { estadoGeneral: 'normal', alcanceVigente: [] }, secciones: [] } },
      historial: { fase: 'listo', movimientos },
    })
    render(<FichaEscuelaPagina escuela={crearEscuelaFicha({ gravedad: 4 })} mostrarEnlaceNominal={false} />)
    const filas = [...screen.getByTestId('seccion-historial-inline').querySelectorAll('li')]
    expect(filas.map((fila) => fila.querySelector('strong')?.textContent)).toEqual(['Corte de luz', 'Filtración', 'Inundación'])
    expect(filas[0]).toHaveTextContent('Se cargó · Media · 1 secc.')
  })
})
