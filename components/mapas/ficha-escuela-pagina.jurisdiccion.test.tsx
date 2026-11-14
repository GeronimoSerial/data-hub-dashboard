// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { FichaEscuelaPagina } from './ficha-escuela-pagina'
import { __reiniciarRegionPublicaClienteParaPruebas, fijarMarcaRegionCliente } from '@/lib/infraestructura/region/publica'
import { marcaPublica } from '@/lib/infraestructura/region/esquema'
import { cargarRegion } from '@/lib/infraestructura/region/registro'
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

afterEach(() => {
  cleanup()
  __reiniciarRegionPublicaClienteParaPruebas()
})

function renderizar() {
  mockUseFichaParte.mockReturnValue({
    estado: { fase: 'listo', datos: { parte: null, afectaciones: [], servicio: { estadoGeneral: 'normal', alcanceVigente: [] }, secciones: [] } },
    historial: { fase: 'listo', movimientos: [] },
  })
  return render(
    <IdiomaProvider idioma="es">
      <FichaEscuelaPagina escuela={crearEscuelaFicha()} mostrarEnlaceNominal={false} />
    </IdiomaProvider>,
  )
}

describe('FichaEscuelaPagina · jurisdicción', () => {
  it('Corrientes conserva "Capital, Corrientes"', () => {
    renderizar()
    expect(screen.getByText('Capital, Corrientes')).toBeVisible()
  })

  it('Manaos muestra la jurisdicción de su configuración', () => {
    fijarMarcaRegionCliente(marcaPublica(cargarRegion('manaos')))
    renderizar()
    expect(screen.getByText('Capital, Amazonas')).toBeVisible()
  })
})
