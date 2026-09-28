// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle, type JSX } from 'react'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import type { RespuestaReplay } from '@/lib/infraestructura/use-replay'

const CUE = '1801605-04'
// Escuela del padrón SIN afectación vigente (no está en partesPorCue): es el
// caso del hallazgo 7, el click que antes no abría nada.
const CUE_SIN_AFECTACION = '1801605-99'

// M1: el buscador de escuelas llama a `mapRef.current?.getMap()?.flyTo(...)`
// al seleccionar un resultado. `vi.hoisted` porque el factory de
// `vi.mock('react-map-gl/maplibre', ...)` lo referencia y ese factory se
// hoistea por encima del resto del archivo.
const { FLY_TO_MOCK } = vi.hoisted(() => ({ FLY_TO_MOCK: vi.fn() }))

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
    cueAnexo: string
    onOpenChange: (open: boolean) => void
    onVerAlumnosAlcanzados: (id: string) => void
    onVerHistorialCompleto: () => void
  }): JSX.Element | null =>
    props.open ? (
      <div data-testid="mock-ficha-modal" data-cue={props.cueAnexo}>
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

// M1: el mapa ahora se alimenta del padrón completo vía useEscuelasMapa
// (afectadas + sin afectación reportada), no sólo de las escuelas con parte.
// El mock global de `fetch` devuelve un FeatureCollection (no la forma
// EscuelasMapaResultado), así que este hook también se dobla acá — mismo
// patrón que useAlertas: objeto ESTABLE para no re-disparar efectos.
const FIXTURE_ESCUELAS_MAPA = {
  escuelas: [
    {
      cueAnexo: CUE,
      nombre: 'Escuela 1',
      departamento: 'Capital',
      localidad: 'Corrientes',
      lat: -27.47,
      lon: -58.83,
      estado: 'afectada' as const,
      parte: PARTE,
    },
    {
      cueAnexo: CUE_SIN_AFECTACION,
      nombre: 'Escuela sin afectación',
      departamento: 'Capital',
      localidad: 'Corrientes',
      lat: -27.5,
      lon: -58.8,
      estado: 'sin_afectacion_reportada' as const,
    },
  ],
  sinUbicacion: [],
  totalPadron: 2,
}

vi.mock('@/lib/infraestructura/use-escuelas-mapa', () => ({
  useEscuelasMapa: () => ({ data: FIXTURE_ESCUELAS_MAPA, loading: false, error: null }),
}))

// M1: totales por departamento que alimentan el popup de hover. La clave
// `departamento` va NORMALIZADA (`normalizarNombreDepartamento('Capital')` =
// 'CAPITAL') porque así es como el componente indexa el Map de totales y
// busca al hacer hover. Objeto ESTABLE (mismo patrón que el resto de los
// mocks de datos) para no re-disparar memos/efectos.
const FIXTURE_TOTALES_MAPA = {
  departamentos: [
    {
      departamento: 'CAPITAL',
      departamentoOriginal: 'Capital',
      totalEscuelas: 10,
      escuelasAfectadas: 3,
      porcentajeAfectadas: 30,
    },
  ],
  provincia: { totalEscuelas: 10, escuelasAfectadas: 3, porcentajeAfectadas: 30 },
}

vi.mock('@/lib/infraestructura/use-totales-mapa', () => ({
  useTotalesMapa: () => ({ data: FIXTURE_TOTALES_MAPA, loading: false, error: null }),
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
        nivelRiesgoAcceso: 'alto',
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

const llamadasReplay = vi.hoisted(() => ({ activos: [] as boolean[] }))
const FIXTURE_REPLAY: RespuestaReplay = { cuadros: [{ instante: '2026-09-20T00:00:00Z', nivelesPeligro: [], snapshotRiesgo: { runId: 'run-1', publicadoEn: '2026-09-20T00:00:00Z', porEscuela: [] }, afectacionesConfirmadas: [], lluviaObservada: [], saludFuentes: [] }], vacios: [{ snapshotRiesgo: false, peligro: false, lluvia: false }], siguienteDesde: null }
vi.mock('@/lib/infraestructura/use-replay', () => ({
  useReplay: (_filtros: unknown, activo: boolean) => {
    llamadasReplay.activos.push(activo)
    return activo ? { data: FIXTURE_REPLAY, loading: false, error: null } : { data: null, loading: false, error: null }
  },
}))

// Mock del hook de detalle por snapshot (follow-up 4 del Gate de E4): el
// hook real haría un fetch real que este archivo no necesita ejercitar (ya
// está cubierto por `use-riesgo-snapshot.test.tsx`); acá sólo se verifica que
// el componente pase los 3 estados (factores/cargando/error) al panel.
const llamadasSnapshot = vi.hoisted(() => ({ snapshotIds: [] as (string | null)[] }))
const SNAPSHOT_DETALLE = vi.hoisted(() => ({
  factores: [
    {
      tipo: 'amenaza',
      fuente: 'ensemble ECMWF',
      variable: 'precipitacion_72h',
      valor: 45,
      unidad: 'mm',
      contribucion: 0.3,
      peso: 0.5,
      explicacion: 'Precipitación sobre P95',
      observadoEn: '2026-09-26T06:00:00Z',
    },
  ],
}))

vi.mock('@/lib/infraestructura/use-riesgo-snapshot', () => ({
  useRiesgoSnapshot: (snapshotId: string | null) => {
    llamadasSnapshot.snapshotIds.push(snapshotId)
    return snapshotId === null
      ? { data: null, loading: false, error: null }
      : { data: SNAPSHOT_DETALLE, loading: false, error: null }
  },
}))

// react-map-gl/maplibre necesita WebGL, que no existe en jsdom: se reemplaza
// por un doble mínimo que expone un botón para simular el click sobre el
// punto del parte (equivalente a queryRenderedFeatures + interactiveLayerIds
// del componente real) y deja pasar el resto de los hijos sin más.
vi.mock('react-map-gl/maplibre', () => {
  type FeatureMock = { layer?: { id: string }; properties: Record<string, unknown> }
  type MouseEventMock = { features: FeatureMock[] }
  type HoverEventMock = { features: FeatureMock[]; lngLat: { lng: number; lat: number } }

  // M1: el componente guarda `mapRef` con `useRef<MapRef>(null)` y lo pasa
  // como `ref` a <MapGL>. El doble tiene que exponer `getMap()` (el
  // componente lo usa para `.resize()`/`.stop()` al cambiar de pestaña y para
  // `.flyTo()` al seleccionar una escuela del buscador). `FLY_TO_MOCK` vive
  // en una variable de test (vi.hoisted) para poder afirmar sus argumentos.
  const MapGL = forwardRef<
    unknown,
    {
      children?: React.ReactNode
      onClick?: (event: MouseEventMock) => void
      onMouseMove?: (event: HoverEventMock) => void
      onMouseLeave?: () => void
    }
  >(function MapGL(props, ref) {
    useImperativeHandle(
      ref,
      () => ({
        getMap: () => ({
          flyTo: FLY_TO_MOCK,
          resize: vi.fn(),
          stop: vi.fn(),
          getSource: () => undefined,
          querySourceFeatures: () => [],
        }),
      }),
      [],
    )
    return (
      <div data-testid="mock-maplibre">
        <button
          data-testid="mock-click-parte"
          onClick={() => props.onClick?.({ features: [{ layer: { id: 'infra-partes' }, properties: { cueAnexo: CUE } }] })}
        />
        <button
          data-testid="mock-click-parte-sin-afectacion"
          onClick={() =>
            props.onClick?.({
              features: [{ layer: { id: 'infra-partes' }, properties: { cueAnexo: CUE_SIN_AFECTACION } }],
            })
          }
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
        <button
          data-testid="mock-hover-departamento"
          onClick={() =>
            props.onMouseMove?.({
              features: [{ layer: { id: 'infra-departamentos-relleno' }, properties: { nombre: 'Capital' } }],
              lngLat: { lng: -58.8, lat: -27.5 },
            })
          }
        />
        {/* V3: simula el hover que MapLibre entrega cuando el cursor está sobre
            una escuela o un cluster: el relleno del departamento SIEMPRE está
            debajo, así que el evento trae AMBAS features y la prioridad del
            componente tiene que elegir la escuela/cluster. */}
        <button
          data-testid="mock-hover-escuela"
          onClick={() =>
            props.onMouseMove?.({
              features: [
                { layer: { id: 'infra-departamentos-relleno' }, properties: { nombre: 'Capital' } },
                {
                  layer: { id: 'infra-partes' },
                  properties: {
                    cueAnexo: CUE,
                    nombre: 'Escuela 1',
                    estado: 'afectada',
                    severidad: 'Alta',
                    servicio: 'suspendido',
                    esEvacuado: false,
                    esCentroEvacuados: false,
                    sinReportar: false,
                  },
                },
              ],
              lngLat: { lng: -58.8, lat: -27.5 },
            })
          }
        />
        <button
          data-testid="mock-hover-cluster"
          onClick={() =>
            props.onMouseMove?.({
              features: [
                { layer: { id: 'infra-departamentos-relleno' }, properties: { nombre: 'Capital' } },
                {
                  layer: { id: 'infra-partes-cluster' },
                  properties: { point_count: 7, severidadRango: 2, escuelasAfectadas: 3 },
                },
              ],
              lngLat: { lng: -58.8, lat: -27.5 },
            })
          }
        />
        <button data-testid="mock-mouse-leave" onClick={() => props.onMouseLeave?.()} />
        {props.children}
      </div>
    )
  })
  return {
    __esModule: true,
    default: MapGL,
    Layer: () => null,
    Marker: (props: { children?: React.ReactNode }) => <>{props.children ?? null}</>,
    NavigationControl: () => null,
    Popup: (props: { children?: React.ReactNode }) => <>{props.children ?? null}</>,
    // `data` no se renderiza en el DOM real (MapLibre lo consume vía WebGL),
    // pero se expone acá como atributo serializado: es la única forma de
    // inspeccionar, desde un test de integración, qué features terminan en
    // el GeoJSON de cada fuente (p. ej. `infra-replay-riesgo-src`) sin
    // depender del click handler (que para Replay ni siquiera está cableado).
    Source: (props: { id?: string; data?: unknown; children?: React.ReactNode }) => (
      <div data-testid={`mock-source-${props.id ?? 'sin-id'}`} data-geojson={JSON.stringify(props.data)}>
        {props.children ?? null}
      </div>
    ),
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
  replayEnabled?: boolean
}) {
  const MapInfraestructuraPage = await cargar()
  const { unmount } = render(<MapInfraestructuraPage {...props} />)
  desmontarMapa = unmount
}

beforeEach(() => {
  vi.restoreAllMocks()
  llamadasRadar.activos.length = 0
  llamadasReplay.activos.length = 0
  llamadasSnapshot.snapshotIds.length = 0
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
    const ficha = await screen.findByTestId('mock-ficha-modal')
    expect(ficha).toHaveAttribute('data-cue', CUE)
  })

  // Hallazgo 7 (regresión central de V4): una escuela del padrón SIN
  // afectación vigente tiene que abrir su ficha igual. Antes el handler sólo
  // llamaba a setSeleccionCue si `partesPorCue` ya tenía ese CUE, así que el
  // click no hacía nada.
  it('abre la ficha al hacer click en una escuela del padrón sin afectación', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    expect(screen.queryByTestId('mock-ficha-modal')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('mock-click-parte-sin-afectacion'))
    const ficha = await screen.findByTestId('mock-ficha-modal')
    expect(ficha).toHaveAttribute('data-cue', CUE_SIN_AFECTACION)
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
    // Sin run anterior, el briefing es la línea honesta de primer resumen.
    expect(screen.getByTestId('radar-briefing')).toHaveTextContent(/Primer resumen del día/i)
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

  it('al seleccionar una escuela del radar pide el detalle por snapshotId y muestra sus factores', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })
    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))

    // Sin escuela seleccionada el hook se llama con null (no dispara fetch).
    expect(llamadasSnapshot.snapshotIds.at(-1)).toBeNull()

    await userEvent.click(screen.getByTestId('mock-click-riesgo'))
    await screen.findByTestId('risk-explanation-cue')

    // El snapshotId de la escuela del radar (RADAR_DATA.escuelas.items[0]),
    // no un id inventado por la integración.
    expect(llamadasSnapshot.snapshotIds).toContain('s1')

    const factores = screen.getByTestId('risk-explanation-factores')
    expect(factores).toHaveTextContent('Amenaza')
    expect(factores).toHaveTextContent('ensemble ECMWF')
    expect(factores).toHaveTextContent('45 mm')
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
      screen.getByRole('checkbox', { name: /todas las escuelas \(padrón\)/i }),
    ).toBeInTheDocument()
  })
})

describe('MapInfraestructuraPage — modo Replay', () => {
  it('con el flag apagado no muestra el botón Replay y el hook nunca recibe activo=true', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })
    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument()
    expect(llamadasReplay.activos.every((activo) => activo === false)).toBe(true)
  })

  // MENOR (revisión N1): el test original sólo probaba que se restauraba el
  // MODO (a), sin ninguna aserción de que también volvieran el horizonte (b)
  // y la selección de departamento (c) — las tres cosas que
  // `volverDeReplay`/`estadoPrevioReplayRef` prometen restaurar.
  it('al volver del modo Replay se restauran modo, horizonte y selección de departamento previos', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, replayEnabled: true })
    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))
    await userEvent.click(screen.getByRole('button', { name: '72 h' }))
    await userEvent.click(screen.getByTestId('mock-click-peligro'))
    expect(await screen.findByTestId('risk-explanation-departamento')).toHaveTextContent('CAPITAL')

    await userEvent.click(screen.getByRole('button', { name: 'Replay' }))
    expect(llamadasReplay.activos.at(-1)).toBe(true)

    const botonVolver = screen.getByRole('button', { name: /volver a la situación actual/i })
    await userEvent.click(botonVolver)

    expect(screen.getByRole('button', { name: 'Radar' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Situación actual' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '72 h' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('risk-explanation-departamento')).toHaveTextContent('CAPITAL')
  })

  // MAYOR 1 (revisión N1): `cambiarModo` no reseteaba `playingReplay` al
  // salir de Replay por el CONMUTADOR (a diferencia de "Volver", que sí lo
  // hacía). Sin el fix, reproducir un cuadro, salir por el conmutador y
  // volver a entrar dejaba `playing=true` heredado de la visita anterior, y
  // el intervalo de auto-avance arrancaba solo sin que el usuario tocara
  // "Reproducir" de nuevo.
  it('salir de Replay por el conmutador detiene la reproducción (no sólo "Volver")', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, replayEnabled: true })
    await userEvent.click(screen.getByRole('button', { name: 'Replay' }))

    await userEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
    expect(screen.getByRole('button', { name: 'Pausar' })).toHaveAttribute('aria-pressed', 'true')

    // Sale por el conmutador, NO por "Volver a la situación actual".
    await userEvent.click(screen.getByRole('button', { name: 'Situación actual' }))
    await userEvent.click(screen.getByRole('button', { name: 'Replay' }))

    expect(screen.getByRole('button', { name: 'Reproducir' })).toHaveAttribute('aria-pressed', 'false')
  })

  // MAYOR 2 (revisión N1): las coordenadas de los puntos de riesgo/afectación
  // del replay salían de `dataVisible` (filtrado por el departamento elegido
  // en "Situación actual"), no del padrón completo de M1 (`useEscuelasMapa`).
  // Una escuela sin parte vigente hoy — y por lo tanto ausente de
  // `dataVisible.partes` — no se dibujaba en Replay aunque el cuadro
  // reproducido tuviera snapshot de riesgo para su cueAnexo. El fix usa
  // `dataEscuelasMapa` (padrón completo, sin ese filtro) como fuente de
  // coordenadas para Replay.
  it('las coordenadas de Replay salen del padrón completo, no de dataVisible filtrado', async () => {
    const CUE_OTRO_DEPTO = '1801699-01'
    FIXTURE_ESCUELAS_MAPA.escuelas.push({
      cueAnexo: CUE_OTRO_DEPTO,
      nombre: 'Escuela de Empedrado',
      departamento: 'Empedrado',
      localidad: 'Empedrado',
      lat: -27.9,
      lon: -58.8,
      estado: 'sin_afectacion_reportada' as const,
    })
    FIXTURE_REPLAY.cuadros[0].snapshotRiesgo!.porEscuela.push({
      cueAnexo: CUE_OTRO_DEPTO,
      nivelRiesgo: 'alto',
      horizonteHoras: 24,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { nombre: 'Capital' }, geometry: null },
            { type: 'Feature', properties: { nombre: 'Empedrado' }, geometry: null },
          ],
        }),
      }),
    )

    try {
      await renderMapa({ mostrarEnlaceNominal: true, replayEnabled: true })
      await userEvent.click(screen.getByRole('button', { name: 'Replay' }))

      const selectDepartamento = await screen.findByLabelText('Departamento')
      await userEvent.selectOptions(selectDepartamento, 'Empedrado')

      const fuenteRiesgo = await screen.findByTestId('mock-source-infra-replay-riesgo-src')
      const geojson = JSON.parse(fuenteRiesgo.getAttribute('data-geojson') ?? '{}')
      const cues = (geojson.features ?? []).map(
        (feature: { properties: { cueAnexo: string } }) => feature.properties.cueAnexo,
      )
      // La escuela de Empedrado nunca tuvo un ParteMapa (no está en
      // dataVisible.partes), pero SÍ está en el padrón completo con
      // coordenadas: tiene que aparecer.
      expect(cues).toContain(CUE_OTRO_DEPTO)
    } finally {
      FIXTURE_ESCUELAS_MAPA.escuelas.pop()
      FIXTURE_REPLAY.cuadros[0].snapshotRiesgo!.porEscuela.pop()
    }
  })
})

describe('M1: hover de departamento y buscador de escuelas', () => {
  // El popup de hover arma su texto con <strong> intercalados ("En
  // <strong>Capital</strong> hay <strong>10</strong> escuelas…"), así que el
  // matcher por defecto de getByText (que sólo mira los text nodes DIRECTOS)
  // no lo ve. Se matchea por tagName + textContent completo del <p>.
  const esParrafoHover = (element: Element | null): boolean =>
    element?.tagName === 'P' &&
    /En Capital hay 10 escuelas/.test(element.textContent ?? '')

  it('hover de departamento muestra total, afectadas y porcentaje, y desaparece al salir', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    expect(
      screen.queryByText((_contenido, element) => esParrafoHover(element)),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('mock-hover-departamento'))

    const popup = await screen.findByText((_contenido, element) => esParrafoHover(element))
    expect(popup).toHaveTextContent('En Capital hay 10 escuelas')
    expect(popup).toHaveTextContent('3 están afectadas')
    expect(popup).toHaveTextContent('30%')

    await userEvent.click(screen.getByTestId('mock-mouse-leave'))
    await waitFor(() =>
      expect(
        screen.queryByText((_contenido, element) => esParrafoHover(element)),
      ).not.toBeInTheDocument(),
    )
  })

  it('sobre una escuela, el tooltip de escuela gana al de departamento', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-hover-escuela'))

    const popup = await screen.findByText(
      (_contenido, element) =>
        element?.tagName === 'P' && /Escuela 1/.test(element.textContent ?? ''),
    )
    expect(popup).toHaveTextContent('Escuela 1')
    expect(popup).toHaveTextContent('Severidad: Alta')
    // Servicio suspendido participa siempre del badge, aunque la capa de
    // evacuación esté apagada: mismo criterio que el ícono dibujado.
    expect(popup).toHaveTextContent('Estado: Servicio suspendido')
    // El tooltip de departamento NO se muestra a la vez.
    expect(
      screen.queryByText((_contenido, element) => esParrafoHover(element)),
    ).not.toBeInTheDocument()
  })

  it('sobre un cluster, el tooltip de cluster gana al de departamento y muestra conteo y severidad', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-hover-cluster'))

    const popup = await screen.findByText(
      (_contenido, element) =>
        element?.tagName === 'P' && /escuelas agrupadas/.test(element.textContent ?? ''),
    )
    expect(popup).toHaveTextContent('7 escuelas agrupadas')
    // severidadRango 2 = SEVERIDADES[2] = 'Alta'.
    expect(popup).toHaveTextContent('Severidad máxima: Alta')
    expect(
      screen.queryByText((_contenido, element) => esParrafoHover(element)),
    ).not.toBeInTheDocument()
  })

  it('al cambiar de modo se limpia el tooltip (no queda clavado)', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })

    await userEvent.click(screen.getByTestId('mock-hover-departamento'))
    expect(
      await screen.findByText((_contenido, element) => esParrafoHover(element)),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))
    await waitFor(() =>
      expect(
        screen.queryByText((_contenido, element) => esParrafoHover(element)),
      ).not.toBeInTheDocument(),
    )
  })

  it('buscar y seleccionar una escuela sin afectación hace flyTo al punto y abre la ficha', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    // El aria-label completo distingue el buscador de escuelas del filtro
    // homónimo del panel de leyenda ("Buscar escuela" + placeholder corto).
    const input = screen.getByLabelText(/Buscar escuela por nombre, CUE/i)
    await userEvent.type(input, 'Escuela sin afectación')

    await userEvent.click(await screen.findByText(/Escuela sin afectación/i))

    expect(FLY_TO_MOCK).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-58.8, -27.5] }),
    )
    // Hallazgo 7: sin afectación reportada igual se abre la ficha de la
    // escuela (la ausencia de parte la resuelve el propio modal).
    const ficha = await screen.findByTestId('mock-ficha-modal')
    expect(ficha).toHaveAttribute('data-cue', CUE_SIN_AFECTACION)
  })
})

describe('M2: capa de padrón apagada por defecto', () => {
  it('el indicador de totales se ve aunque la capa de padrón esté apagada', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    const indicador = screen.getByTestId('infra-totales-indicador')
    expect(indicador).toHaveTextContent(/10 escuelas/)
    expect(indicador).toHaveTextContent(/3 afectadas/)
    expect(indicador).toHaveTextContent(/30%/)
  })

  it('la casilla de "Todas las escuelas (padrón)" arranca destildada', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    const checkbox = screen.getByRole('checkbox', { name: /todas las escuelas \(padrón\)/i })
    expect(checkbox).not.toBeChecked()
  })

  it('tildar la casilla no hace desaparecer el indicador de totales', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    const antes = screen.getByTestId('infra-totales-indicador').textContent
    await userEvent.click(
      screen.getByRole('checkbox', { name: /todas las escuelas \(padrón\)/i }),
    )

    const despues = screen.getByTestId('infra-totales-indicador')
    expect(despues).toBeInTheDocument()
    expect(despues.textContent).toBe(antes)
  })
})

describe('MapInfraestructuraPage — capa Riesgo de acceso', () => {
  it('apagada por defecto: el checkbox existe sin marcar y la fuente de la capa no está montada', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })
    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))

    const checkbox = screen.getByRole('checkbox', { name: /riesgo de acceso/i })
    expect(checkbox).not.toBeChecked()
    expect(screen.queryByTestId('mock-source-infra-riesgo-acceso-src')).not.toBeInTheDocument()
  })

  it('el toggle monta y desmonta la capa', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })
    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))

    const checkbox = screen.getByRole('checkbox', { name: /riesgo de acceso/i })
    await userEvent.click(checkbox)
    expect(screen.getByTestId('mock-source-infra-riesgo-acceso-src')).toBeInTheDocument()

    await userEvent.click(checkbox)
    expect(screen.queryByTestId('mock-source-infra-riesgo-acceso-src')).not.toBeInTheDocument()
  })

  it('oculta en modo Replay aunque el toggle esté prendido', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, replayEnabled: true })
    await userEvent.click(screen.getByRole('button', { name: 'Radar' }))

    await userEvent.click(screen.getByRole('checkbox', { name: /riesgo de acceso/i }))
    expect(screen.getByTestId('mock-source-infra-riesgo-acceso-src')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Replay' }))
    expect(screen.queryByTestId('mock-source-infra-riesgo-acceso-src')).not.toBeInTheDocument()
  })
})
