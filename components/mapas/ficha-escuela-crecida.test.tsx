// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { FichaEscuelaPagina } from './ficha-escuela-pagina'
import { presentarReferenciaEstudio } from '@/lib/infraestructura/riesgo/presentacion-crecida'
import type { EscuelaFichaEnriquecida } from '@/lib/infraestructura/parte-mapa'
import type { FactorMotor } from '@/lib/infraestructura/riesgo/explicar-snapshot'

vi.mock('@/lib/infraestructura/use-ficha-parte', () => ({
  useFichaParte: () => ({ estado: { fase: 'cargando' }, historial: { fase: 'cargando' } }),
}))
vi.mock('@/components/infraestructura/borradores/use-draft-counts', () => ({
  useDraftCounts: () => ({ counts: new Map(), loading: false, error: false }),
}))
vi.mock('@/lib/infraestructura/use-territorio-mapa', () => ({ useTerritorioMapa: () => ({ data: null }) }))
vi.mock('@/lib/infraestructura/use-geometria-acceso', () => ({ useGeometriaAcceso: () => ({ data: null }) }))
vi.mock('@/lib/infraestructura/use-exposicion-ruta', () => ({ useExposicionRuta: () => ({ data: null }) }))
vi.mock('@/components/infraestructura/ficha-territorial', () => ({ FichaTerritorial: () => null }))
vi.mock('@/components/infraestructura/fotos/galeria-evidencia', () => ({ GaleriaEvidencia: () => null }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('carga el gráfico real dentro de la ficha 1800818-00 aunque el riesgo publicado sea v0.3', async () => {
  const escuela: EscuelaFichaEnriquecida = {
    cueAnexo: '1800818-00', nombre: 'Escuela de prueba 1800818-00', departamento: 'ITUZAINGO', localidad: 'ITUZAINGO',
    lat: null, lon: null, ubicacionDisponible: false, estado: 'sin_afectacion_reportada', niveles: ['Primaria'],
    alumnos: 0, gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false,
    ultimaNovedad: null, alumnosSinClases: 0, situacionesHistoricas: 0, solucionadasRecientes: 0,
  }
  const rio: FactorMotor = {
    tipo: 'amenaza', fuente: 'rio-prefectura', variable: 'altura_rio', valor: 4.8, unidad: 'm', contribucion: 10,
    explicacion: 'Rio parana en pna-ituzaingo: 4.8m, estado evacuacion', observadoEn: null,
  }
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    snapshot: { nivelRiesgo: 'alto', scoreRiesgo: 75, horizonteHoras: 72, calculadoEn: '2026-10-16T14:16:51Z' },
    factores: [rio], crecidaRio: presentarReferenciaEstudio(escuela.cueAnexo, [rio]),
  }) })
  vi.stubGlobal('fetch', fetchMock)

  render(<FichaEscuelaPagina escuela={escuela} mostrarEnlaceNominal={false} />)

  const grafico = await screen.findByRole('region', { name: 'Referencia de crecida del río' })
  const ficha = screen.getByRole('main', { name: 'Ficha completa de Escuela de prueba 1800818-00' })
  expect(ficha).toContainElement(grafico)
  expect(grafico.closest('aside')).toHaveAttribute('aria-label', 'Territorio y clima')
  expect(within(grafico).getByRole('figure')).toHaveTextContent('15,47 m')
  expect(grafico).toHaveTextContent('280 m de la escuela')
  expect(grafico).toHaveTextContent('+11,87 m')
  expect(grafico).toHaveTextContent('Referencia del estudio')
  expect(grafico).toHaveTextContent('todavía no se puede estimar la probabilidad')
  expect(fetchMock).toHaveBeenCalledWith('/api/infraestructura/riesgo/escuela/1800818-00?horizonte=72')
})
