// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import EscuelaFichaRoute from './page'
import type { EscuelaFichaEnriquecida } from '@/lib/infraestructura/parte-mapa'

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const mockNotFound = vi.fn(() => {
  throw new Error('NOT_FOUND')
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: () => mockNotFound(),
}))

const mockGetSessionUser = vi.fn()
vi.mock('@/lib/session', () => ({
  getSessionUser: () => mockGetSessionUser(),
}))

const mockLoadRecursoAccessByRuta = vi.fn()
vi.mock('@/lib/db/recurso-access', () => ({
  loadRecursoAccessByRuta: (...args: unknown[]) => mockLoadRecursoAccessByRuta(...args),
}))

vi.mock('@/lib/db/seed', () => ({
  ensureSeeded: vi.fn().mockResolvedValue(undefined),
}))

const mockPuedeVerNominal = vi.fn()
vi.mock('@/lib/infraestructura/permiso-nominal', () => ({
  puedeVerNominal: (...args: unknown[]) => mockPuedeVerNominal(...args),
}))

vi.mock('@/lib/infraestructura/riesgo/flags', () => ({
  hazardContextEnabled: () => true,
}))

const mockObtenerEscuelaFichaEnriquecida = vi.fn()
vi.mock('@/lib/infraestructura/parte-mapa', () => ({
  obtenerEscuelaFichaEnriquecida: (...args: unknown[]) =>
    mockObtenerEscuelaFichaEnriquecida(...args),
}))

vi.mock('@/components/mapas/ficha-escuela-pagina', () => ({
  FichaEscuelaPagina: (props: {
    escuela: EscuelaFichaEnriquecida
    mostrarEnlaceNominal: boolean
  }) => (
    <div data-testid="mock-ficha-pagina">
      <span>{props.escuela.nombre}</span>
      <span>nominal:{String(props.mostrarEnlaceNominal)}</span>
    </div>
  ),
}))

const ESCUELA_MOCK: EscuelaFichaEnriquecida = {
  cueAnexo: '1801605-00',
  nombre: 'Escuela N° 105 Sarmiento',
  departamento: 'CAPITAL',
  localidad: 'Corrientes',
  lat: -27.47,
  lon: -58.83,
  ubicacionDisponible: true,
  estado: 'sin_afectacion_reportada',
  niveles: ['Primaria'],
  alumnos: 320,
  gravedad: 0,
  categoriaPrincipal: null,
  clases: 'normal',
  apoyo: null,
  sinActualizar: false,
  ultimaNovedad: null,
  alumnosSinClases: 0,
  situacionesHistoricas: 0,
  solucionadasRecientes: 0,
}

describe('EscuelaFichaRoute (/mapas/infraestructura/escuelas/[cue])', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadRecursoAccessByRuta.mockResolvedValue({
      recurso: { id: 'r1' },
      access: {
        audiencia: 'autenticados',
        audienciaNivelJurIds: [],
        audienciaUserIds: [],
      },
    })
    mockPuedeVerNominal.mockResolvedValue(false)
  })

  afterEach(() => {
    cleanup()
  })

  it('redirige a /login con callbackUrl cuando no hay sesión', async () => {
    mockGetSessionUser.mockResolvedValue(null)

    await expect(
      EscuelaFichaRoute({
        params: Promise.resolve({ cue: '1801605-00' }),
      }),
    ).rejects.toThrow('REDIRECT:/login?callbackUrl=%2Fmapas%2Finfraestructura%2Fescuelas%2F1801605-00')
  })

  it('redirige a /forbidden cuando el rol tiene alcance ninguno (ej. operador_establecimiento)', async () => {
    mockGetSessionUser.mockResolvedValue({
      id: 'u1',
      role: 'operador_establecimiento',
      banned: false,
      nivelJurIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    })

    await expect(
      EscuelaFichaRoute({
        params: Promise.resolve({ cue: '1801605-00' }),
      }),
    ).rejects.toThrow('REDIRECT:/forbidden')
  })

  it('invoca notFound() cuando el CUE no existe o queda fuera del alcance del usuario', async () => {
    mockGetSessionUser.mockResolvedValue({
      id: 'u-dir',
      role: 'director_nivel',
      banned: false,
      nivelJurIds: [2],
      accesoRecursos: 'todos',
      recursoIds: [],
    })
    mockObtenerEscuelaFichaEnriquecida.mockResolvedValue({ estado: 'no_encontrada' })

    await expect(
      EscuelaFichaRoute({
        params: Promise.resolve({ cue: '1809999-00' }),
      }),
    ).rejects.toThrow('NOT_FOUND')
  })

  it('renderiza FichaEscuelaPagina con los datos enriquecidos cuando el acceso y alcance son válidos', async () => {
    mockGetSessionUser.mockResolvedValue({
      id: 'u-consulta',
      role: 'consulta',
      banned: false,
      nivelJurIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    })
    mockPuedeVerNominal.mockResolvedValue(true)
    mockObtenerEscuelaFichaEnriquecida.mockResolvedValue({
      estado: 'ok',
      escuela: ESCUELA_MOCK,
    })

    const jsx = await EscuelaFichaRoute({
      params: Promise.resolve({ cue: '1801605-00' }),
      searchParams: Promise.resolve({ origen: 'mapa', departamento: 'CAPITAL' }),
    })

    render(jsx)

    expect(screen.getByTestId('mock-ficha-pagina').textContent).toContain(
      'Escuela N° 105 Sarmiento',
    )
    expect(screen.getByTestId('mock-ficha-pagina').textContent).toContain('nominal:true')
  })
})
