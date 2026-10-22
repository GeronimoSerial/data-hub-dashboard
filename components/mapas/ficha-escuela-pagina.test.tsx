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
    expect(screen.getByText('Justificación de gravedad crítica: Otro: Bloquea la salida de emergencia')).toBeInTheDocument()
    expect(screen.getByText('Justificación de gravedad crítica: Hay riesgo eléctrico, estructural o sanitario')).toBeInTheDocument()
    expect(screen.getAllByText(/Justificación de gravedad crítica:/)).toHaveLength(2)
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

    // El botón nominal abre el modal de alumnos alcanzados
    fireEvent.click(screen.getByTestId('ver-alumnos-af-99'))
    expect(screen.getByTestId('mock-nominal-modal').textContent).toContain('Nominal af-99')
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
