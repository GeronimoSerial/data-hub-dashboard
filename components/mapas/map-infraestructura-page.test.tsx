// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { JSX } from 'react'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'

const CUE = '1801605-04'

const PARTE: ParteMapa = {
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
      descripcion: null,
      rigeDesde: '2026-08-01T00:00:00Z',
    },
  ],
  seccionesAlcanzadas: 3,
  alumnosAlcanzados: 74,
  rigeDesde: '2026-08-01T00:00:00Z',
  actualizadaEn: '2026-08-01T00:00:00Z',
}

// F3.2/F3.3/F3.4: este test cubre la ORQUESTACIÓN de los tres modales desde
// map-infraestructura-page (abrir ficha al click, encadenar nominal e
// historial desde la ficha, y que cerrar cualquiera de los tres no toque
// filtros/capas) — no vuelve a probar el contenido interno de cada modal,
// eso ya lo cubren sus propios *.test.tsx. Por eso los tres se mockean acá:
// dobles de prueba que sólo exponen los props que importan para esta
// orquestación (open/id, onOpenChange, y los dos callbacks de encadenado).
vi.mock('@/components/infraestructura/ficha-parte-modal', () => ({
  FichaParteModal: (props: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onVerAlumnosAlcanzados: (id: string) => void
    onVerHistorialCompleto: () => void
  }): JSX.Element | null =>
    props.open ? (
      <div data-testid="mock-ficha-modal">
        <button onClick={() => props.onOpenChange(false)}>cerrar-ficha</button>
        <button onClick={() => props.onVerAlumnosAlcanzados('a1')}>abrir-nominal-desde-ficha</button>
        <button onClick={() => props.onVerHistorialCompleto()}>abrir-historial-desde-ficha</button>
      </div>
    ) : null,
}))

vi.mock('@/components/infraestructura/alcance-nominal-modal', () => ({
  AlcanceNominalModal: (props: {
    afectacionId: string | null
    onOpenChange: (open: boolean) => void
  }): JSX.Element | null =>
    props.afectacionId ? (
      <div data-testid="mock-nominal-modal">
        <button onClick={() => props.onOpenChange(false)}>cerrar-nominal</button>
      </div>
    ) : null,
}))

vi.mock('@/components/infraestructura/historial-parte-modal', () => ({
  HistorialParteModal: (props: {
    cueAnexo: string | null
    onOpenChange: (open: boolean) => void
  }): JSX.Element | null =>
    props.cueAnexo ? (
      <div data-testid="mock-historial-modal">
        <button onClick={() => props.onOpenChange(false)}>cerrar-historial</button>
      </div>
    ) : null,
}))

vi.mock('@/lib/map-worker', () => ({ ensureMapWorker: () => {} }))

// Objeto ESTABLE (misma identidad en cada llamada al hook): el componente
// real tiene un useEffect que depende de `data` (dispara un setTimeout(0)
// para fijar `ahoraMs`) — si el mock devolviera un literal nuevo en cada
// render, ese efecto se re-disparía en cada click de este test y podía dejar
// un setTimeout pendiente sin desmontar, que revienta al correr después de
// que Vitest ya cerró el entorno jsdom de este archivo ("window is not
// defined" en otro test, mucho más difícil de diagnosticar ahí).
const FIXTURE_RESPUESTA = {
  partes: [PARTE],
  indicadores: {
    escuelas: 1,
    conServicioSuspendido: 1,
    conServicioParcial: 0,
    evacuadas: 1,
    centrosDeEvacuados: 0,
    sinReportar: 0,
    alumnosAlcanzados: 74,
    seccionesAlcanzadas: 3,
  },
}

vi.mock('@/lib/infraestructura/use-alertas', () => ({
  useAlertas: () => ({ data: FIXTURE_RESPUESTA, loading: false, error: null }),
}))

// Mock del hook del radar (E4). Registra cada invocación con su flag `activo`
// para poder afirmar que NO se dispara en modo "Situación actual" ni con el
// flag apagado: el componente puede llamar al hook siempre (regla de hooks),
// pero con activo=false el hook real no hace fetch — acá se verifica el
// contrato del lado del componente (el activo que recibe) y del hook
// (devolver null/vacío sin datos).
const llamadasRadar = vi.hoisted(() => ({ activos: [] as boolean[] }))

const RADAR_DATA = {
  corte: {
    runId: 'run-1',
    publicadoEn: '2026-09-26T06:00:00Z',
    modeloVersion: 'v0',
  },
  cobertura: { procesadas: 100, conEvidencia: 90, sinEvidencia: 10 },
  departamentos: [
    { departamento: 'CAPITAL', peorNivel: 'rojo', horizonteHoras: 24, celdas: 2 },
    { departamento: 'CAPITAL', peorNivel: 'verde', horizonteHoras: 72, celdas: 2 },
  ],
  escuelas: {
    items: [
      {
        snapshotId: 's1',
        cueAnexo: CUE,
        departamento: 'CAPITAL',
        horizonteHoras: 24,
        evidenciaValida: true,
        scoreRiesgo: 0.8,
        nivelRiesgo: 'alto',
        scoreAmenaza: 0.7,
        scoreVulnerabilidad: 0.6,
        confianza: 'media',
        exposicionMatricula: 0,
        exposicionSecciones: 0,
        calculadoEn: '2026-09-26T06:00:00Z',
        validoHasta: '2026-09-27T06:00:00Z',
      },
    ],
    page: 1,
    pageSize: 50,
    total: 1,
    totalPages: 1,
  },
  kpis: { riesgoAltoTotal: 1, sinEvidenciaTotal: 0 },
}

vi.mock('@/lib/infraestructura/use-radar', () => ({
  useRadar: (_filtros: unknown, activo: boolean) => {
    llamadasRadar.activos.push(activo)
    return activo
      ? { data: RADAR_DATA, loading: false, error: null }
      : { data: null, loading: false, error: null }
  },
}))

// react-map-gl/maplibre necesita WebGL, que no existe en jsdom: se reemplaza
// por un doble mínimo que expone un botón para simular el click sobre el
// punto del parte (equivalente a queryRenderedFeatures + interactiveLayerIds
// del componente real) y deja pasar el resto de los hijos sin más.
vi.mock('react-map-gl/maplibre', () => {
  function MapGL(props: {
    children?: React.ReactNode
    onClick?: (event: { features: Array<{ layer?: { id: string }; properties: Record<string, string> }> }) => void
  }) {
    return (
      <div data-testid="mock-maplibre">
        <button
          data-testid="mock-click-parte"
          onClick={() => props.onClick?.({ features: [{ layer: { id: 'infra-partes' }, properties: { cueAnexo: CUE } }] })}
        />
        <button
          data-testid="mock-click-departamento"
          onClick={() => props.onClick?.({ features: [{ layer: { id: 'infra-departamentos-relleno' }, properties: { nombre: 'Capital' } }] })}
        />
        <button
          data-testid="mock-click-peligro"
          onClick={() => props.onClick?.({ features: [{ layer: { id: 'infra-peligro-fill' }, properties: { nombre: 'CAPITAL' } }] })}
        />
        <button
          data-testid="mock-click-riesgo"
          onClick={() => props.onClick?.({ features: [{ layer: { id: 'infra-riesgo-circle' }, properties: { cueAnexo: CUE } }] })}
        />
        {props.children}
      </div>
    )
  }
  return {
    __esModule: true,
    default: MapGL,
    Layer: () => null,
    Marker: (props: { children?: React.ReactNode }) => <>{props.children ?? null}</>,
    NavigationControl: () => null,
    Popup: (props: { children?: React.ReactNode }) => <>{props.children ?? null}</>,
    Source: (props: { children?: React.ReactNode }) => <>{props.children ?? null}</>,
  }
})

async function cargar() {
  const { default: MapInfraestructuraPage } = await import('./map-infraestructura-page')
  return MapInfraestructuraPage
}

// El componente real tiene un efecto con un setTimeout(0) (para `ahoraMs`) y
// un fetch a DEPARTAMENTOS_URL: si un test terminara sin desmontar, ese
// timeout podía dispararse después de que Vitest cerrara el entorno jsdom de
// ESTE archivo, reventando en otro test con "window is not defined". Por eso
// cada test desmonta explícitamente al final en vez de confiar en que el
// próximo `render()` lo reemplace.
let desmontarMapa: (() => void) | null = null

async function renderMapa(props: {
  mostrarEnlaceNominal: boolean
  riskRadarEnabled?: boolean
}) {
  const MapInfraestructuraPage = await cargar()
  const { unmount } = render(<MapInfraestructuraPage {...props} />)
  desmontarMapa = unmount
}

beforeEach(() => {
  vi.restoreAllMocks()
  llamadasRadar.activos.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    }),
  )
})

afterEach(() => {
  desmontarMapa?.()
  desmontarMapa = null
  document.body.innerHTML = ''
})

describe('MapInfraestructuraPage — orquestación de modales', () => {
  // E5 Ola 0: intermitente detectado (1/3 corridas completas de `pnpm test`
  // falló acá con "Test timed out in 5000ms"). No es una condición de carrera
  // real del componente — no hay estado que dependa del fetch de
  // departamentosRaw para este flujo (el filtro se setea directo en el click
  // handler) — sino el timeout por defecto de Vitest (5s) quedando corto bajo
  // carga de máquina para un test con dos userEvent.click reales sobre un
  // árbol con varios efectos/mocks async encadenados. Se sube el timeout de
  // ESTE test puntual en vez de tocar el default global.
  it(
    'filtra por departamento al hacer click y permite quitar el filtro',
    async () => {
      await renderMapa({ mostrarEnlaceNominal: true })
      await userEvent.click(screen.getByTestId('mock-click-departamento'))
      expect(screen.getByText('Departamento:')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Capital' })).toBeInTheDocument()
      await userEvent.click(screen.getByText('Quitar filtro'))
      expect(screen.queryByText('Departamento:')).not.toBeInTheDocument()
    },
    15000,
  )

  it('abre la ficha al hacer click en un parte del mapa', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    expect(screen.queryByTestId('mock-ficha-modal')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('mock-click-parte'))
    expect(await screen.findByTestId('mock-ficha-modal')).toBeInTheDocument()
  })

  it('abre el modal nominal desde la ficha', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-click-parte'))
    await userEvent.click(await screen.findByText('abrir-nominal-desde-ficha'))
    expect(await screen.findByTestId('mock-nominal-modal')).toBeInTheDocument()
    // La ficha sigue abierta: abrir el nominal no la cierra.
    expect(screen.getByTestId('mock-ficha-modal')).toBeInTheDocument()
  })

  it('abre el modal de historial desde la ficha', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-click-parte'))
    await userEvent.click(await screen.findByText('abrir-historial-desde-ficha'))
    expect(await screen.findByTestId('mock-historial-modal')).toBeInTheDocument()
  })

  it('cerrar cualquiera de los tres modales no toca los filtros ni las capas visibles', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    // Estado previo: se activa la capa "sin reportar", apagada por defecto.
    const capaSinReportar = screen.getByRole('checkbox', { name: /sin reportar/i })
    await userEvent.click(capaSinReportar)
    expect(capaSinReportar).toBeChecked()

    await userEvent.click(screen.getByTestId('mock-click-parte'))
    await userEvent.click(await screen.findByText('abrir-nominal-desde-ficha'))
    await userEvent.click(await screen.findByText('abrir-historial-desde-ficha'))

    await userEvent.click(screen.getByText('cerrar-nominal'))
    await waitFor(() => expect(screen.queryByTestId('mock-nominal-modal')).not.toBeInTheDocument())

    await userEvent.click(screen.getByText('cerrar-historial'))
    await waitFor(() => expect(screen.queryByTestId('mock-historial-modal')).not.toBeInTheDocument())

    await userEvent.click(screen.getByText('cerrar-ficha'))
    await waitFor(() => expect(screen.queryByTestId('mock-ficha-modal')).not.toBeInTheDocument())

    // La capa que se activó antes de abrir los modales sigue activa.
    expect(screen.getByRole('checkbox', { name: /sin reportar/i })).toBeChecked()
  })
})

describe('MapInfraestructuraPage — modo Radar', () => {
  it('con el flag ausente NO monta el conmutador ni el selector, y el hook queda inactivo', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    // Ni un elemento nuevo del modo Radar en el DOM.
    expect(screen.queryByRole('button', { name: 'Radar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Situación actual' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: /horizonte temporal del radar/i }),
    ).not.toBeInTheDocument()

    // El hook se llamó (regla de hooks) pero SIEMPRE con activo=false.
    expect(llamadasRadar.activos.length).toBeGreaterThan(0)
    expect(llamadasRadar.activos.every((activo) => activo === false)).toBe(true)
  })

  it('con el flag en false tampoco monta el conmutador', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: false })
    expect(screen.queryByRole('button', { name: 'Radar' })).not.toBeInTheDocument()
    expect(llamadasRadar.activos.every((activo) => activo === false)).toBe(true)
  })

  it('con el flag en true muestra el conmutador, arranca en Situación actual y no dispara el radar', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })

    const botonRadar = screen.getByRole('button', { name: 'Radar' })
    const botonActual = screen.getByRole('button', { name: 'Situación actual' })
    expect(botonActual).toHaveAttribute('aria-pressed', 'true')
    expect(botonRadar).toHaveAttribute('aria-pressed', 'false')

    // Aún en Radar desactivado: hook inactivo y sin selector de horizonte.
    expect(
      screen.queryByRole('group', { name: /horizonte temporal del radar/i }),
    ).not.toBeInTheDocument()
    expect(llamadasRadar.activos.at(-1)).toBe(false)
  })

  it('al activar Radar consulta el hook, muestra horizonte, KPIs y briefing', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })

    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))

    expect(llamadasRadar.activos.at(-1)).toBe(true)
    expect(
      screen.getByRole('group', { name: /horizonte temporal del radar/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('radar-kpi-riesgo-alto')).toHaveTextContent('1')
    expect(screen.getByTestId('radar-briefing')).toBeInTheDocument()
    // Sin run anterior, el briefing es la línea honesta de primer corte.
    expect(screen.getByTestId('radar-briefing')).toHaveTextContent(/primer corte disponible/i)
  })

  it('al volver a Situación actual deja el hook inactivo otra vez', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })

    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))
    expect(llamadasRadar.activos.at(-1)).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Situación actual' }))
    expect(llamadasRadar.activos.at(-1)).toBe(false)
    expect(
      screen.queryByRole('group', { name: /horizonte temporal del radar/i }),
    ).not.toBeInTheDocument()
  })

  it('click en un departamento del radar abre el panel de explicación por departamento', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })
    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))

    expect(screen.queryByTestId('risk-explanation-panel')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('mock-click-peligro'))
    expect(await screen.findByTestId('risk-explanation-departamento')).toHaveTextContent('CAPITAL')
    // La ficha de partes NO se abrió: son estados independientes.
    expect(screen.queryByTestId('mock-ficha-modal')).not.toBeInTheDocument()
  })

  it('click en una escuela del radar abre el panel de explicación por escuela, sin mezclar con seleccionCue', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })
    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))

    await userEvent.click(screen.getByTestId('mock-click-riesgo'))
    expect(await screen.findByTestId('risk-explanation-cue')).toHaveTextContent(CUE)
    // Estado independiente del modo actual: sin ficha de partes abierta.
    expect(screen.queryByTestId('mock-ficha-modal')).not.toBeInTheDocument()
  })

  it('en modo Radar las capas base del mapa siguen montadas (decisión: sumar, no reemplazar)', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })

    // En "Situación actual" la leyenda de peligro no aparece; en Radar sí.
    expect(
      screen.queryByRole('list', { name: /niveles de peligro meteorológico/i }),
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))
    expect(
      screen.getByRole('list', { name: /niveles de peligro meteorológico/i }),
    ).toBeInTheDocument()
    // El checkbox de la capa de partes sigue presente: no se desmontó.
    expect(
      screen.getByRole('checkbox', { name: /escuelas con afectación vigente/i }),
    ).toBeInTheDocument()
  })
})
