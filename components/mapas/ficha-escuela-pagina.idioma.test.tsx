// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
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
  RiesgoEscuela: () => <div>Riesgo</div>,
}))

vi.mock('@/components/infraestructura/ficha-territorial', () => ({
  FichaTerritorial: () => <div>Territorial</div>,
}))

vi.mock('@/components/infraestructura/fotos/galeria-evidencia', () => ({
  GaleriaEvidencia: () => <div>Evidencia</div>,
}))

vi.mock('@/components/infraestructura/alcance-nominal-modal', () => ({
  AlcanceNominalModal: () => null,
}))

function crearEscuelaFicha(overrides: Partial<EscuelaFichaEnriquecida> = {}): EscuelaFichaEnriquecida {
  return {
    cueAnexo: '1801605-00',
    nombre: 'Escuela N° 105 Sarmiento',
    departamento: 'CAPITAL',
    localidad: 'Corrientes',
    lat: -27.47,
    lon: -58.83,
    ubicacionDisponible: false,
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

function renderizar(idioma: 'es' | 'pt') {
  mockUseFichaParte.mockReturnValue({
    estado: { fase: 'listo', datos: { parte: null, afectaciones: [], servicio: { estadoGeneral: 'normal', alcanceVigente: [] }, secciones: [] } },
    historial: { fase: 'listo', movimientos: [] },
  })
  return render(
    <IdiomaProvider idioma={idioma}>
      <FichaEscuelaPagina escuela={crearEscuelaFicha()} mostrarEnlaceNominal={false} />
    </IdiomaProvider>,
  )
}

describe('FichaEscuelaPagina · idioma', () => {
  it('mantiene en español la cabecera, las pestañas y los avisos de la ficha', () => {
    renderizar('es')

    expect(screen.getByText('Ubicación no disponible en el mapa')).toBeVisible()
    expect(screen.getByText('Cargar una situación')).toBeVisible()
    const tabs = within(screen.getByRole('navigation', { name: 'Secciones de la ficha' }))
    expect(tabs.getByText('Situaciones (0)')).toBeVisible()
    expect(tabs.getByText('Bitácora')).toBeVisible()
    expect(tabs.getByText('Pronóstico y riesgo')).toBeVisible()
  })

  it('muestra la cabecera, las pestañas y los avisos de la ficha en portugués de Brasil', () => {
    renderizar('pt')

    expect(screen.getByText('Localização não disponível no mapa')).toBeVisible()
    expect(screen.getByText('Registrar uma situação')).toBeVisible()
    expect(screen.getByRole('navigation', { name: 'Seções da ficha' })).toBeVisible()
    const tabs = within(screen.getByRole('navigation', { name: 'Seções da ficha' }))
    expect(tabs.getByText('Situações (0)')).toBeVisible()
    expect(tabs.getByText('Registro')).toBeVisible()
    expect(tabs.getByText('Previsão e risco')).toBeVisible()
  })
})
