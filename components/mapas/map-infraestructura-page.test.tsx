// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useEffect, useImperativeHandle, type JSX, type ReactNode } from 'react'
import type { EscuelaMapaPadron, EscuelasMapaPadronResultado, ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { crearParteMapa } from '@/components/test-utils/parte-mapa'
import { territorioCon } from '@/components/test-utils/territorio-mapa'

const CUE = '1801605-04'
// Escuela del padrón SIN afectación vigente (no está en partesPorCue): es el
// caso del hallazgo 7, el click que antes no abría nada.
const CUE_SIN_AFECTACION = '1801605-99'

// La selección registrada por el contenedor llama a
// `mapRef.current?.getMap()?.flyTo(...)`. `vi.hoisted` porque el factory de
// `vi.mock('react-map-gl/maplibre', ...)` lo referencia y ese factory se
// hoistea por encima del resto del archivo.
// Q3: `fitBounds` es el encuadre de la ruta (al elegir una escuela y al
// pulsar "Ver recorrido"). Es un spy además de `flyTo` para poder contar
// cuántas veces se encuadró: encuadrar de más es un bug tan visible como no
// encuadrar.
const { FLY_TO_MOCK, FIT_BOUNDS_MOCK } = vi.hoisted(() => ({
  FLY_TO_MOCK: vi.fn(),
  FIT_BOUNDS_MOCK: vi.fn(),
}))

// T5a: cues que el doble del mapa devuelve como DESAGRUPADAS en
// `querySourceFeatures`. Lista mutable para que un test puntual pueda sumar
// escuelas sin depender de los globales; `beforeEach` la deja en su valor por
// defecto (las dos escuelas del padrón de abajo).
const CUES_DESAGRUPADOS_MOCK = vi.hoisted(() => ({ cues: [] as string[] }))

const PARTE: ParteMapa = crearParteMapa({
  cueAnexo: CUE,
  servicio: 'suspendido',
  estadoEstablecimiento: 'evacuado',
  afectaciones: [
    {
      id: 'a1',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      descripcion: null,
      rigeDesde: '2026-08-01T00:00:00Z',
      creadaEn: '2026-08-01T00:00:00Z',
    },
  ],
  seccionesAlcanzadas: 3,
  alumnosAlcanzados: 74,
})

// F3.2/F3.3/F3.4: este test cubre la ORQUESTACIÓN de los tres modales desde
// map-infraestructura-page (abrir ficha al click, encadenar nominal e
// historial desde la ficha, y que cerrar cualquiera de los tres no toque
// filtros/capas) — no vuelve a probar el contenido interno de cada modal,
// eso ya lo cubren sus propios *.test.tsx. Por eso los tres se mockean acá:
// dobles de prueba que sólo exponen los props que importan para esta
// orquestación (open/id, onOpenChange, y los dos callbacks de encadenado).
// Q3: el bloque territorial llega como un objeto (`accesoTerritorial`) con el
// botón "Ver recorrido"; el doble lo expone sólo cuando la página se lo pasa,
// que es justo cuando hay dominio territorial prendido.
vi.mock('@/components/mapas/ficha-escuela-panel', () => ({
  FichaEscuelaPanel: (props: {
    escuela: { cueAnexo: string }
    acceso: ReactNode
    onCerrar: () => void
    onVerAlumnosAlcanzados: (id: string) => void
    onVerHistorialCompleto: () => void
  }): JSX.Element => (
    <section data-testid="mock-ficha-escuela" data-cue={props.escuela.cueAnexo}>
      <button onClick={props.onCerrar}>Volver a la lista</button>
      <button onClick={() => props.onVerAlumnosAlcanzados('a1')}>abrir-nominal-desde-ficha</button>
      <button onClick={props.onVerHistorialCompleto}>Ver historial</button>
      {props.acceso}
    </section>
  ),
}))

vi.mock('@/components/infraestructura/ficha-acceso-territorial', () => ({
  FichaAccesoTerritorial: (props: { onVerRutaEnMapa?: () => void }): JSX.Element => (
    <button data-testid="ficha-acceso-ver-ruta" onClick={props.onVerRutaEnMapa}>Ver recorrido</button>
  ),
}))

vi.mock('@/components/infraestructura/ficha-territorial', () => ({
  FichaTerritorial: (): JSX.Element => <div data-testid="ficha-territorial" />,
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
    establecimientosParciales: 0,
    centrosDeEvacuados: 0,
    sinActualizar: 0,
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
// patrón que useAlertas: objeto ESTABLE para no re-disparar efectos. Con el
// TIPO real del contrato, no con el que se deduce del literal: `lat`/`lon`
// admiten `null` (escuela del padrón sin geolocalizar) y eso es justo lo que
// necesita el test del aviso del buscador.
const FIXTURE_ESCUELAS_MAPA: EscuelasMapaPadronResultado = {
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
      niveles: ['Primario'],
      alumnos: 74,
      gravedad: 3,
      categoriaPrincipal: 'establecimiento',
      clases: 'evacuado',
      apoyo: null,
      sinActualizar: false,
      ultimaNovedad: PARTE.actualizadaEn,
      alumnosSinClases: 74,
    },
    {
      cueAnexo: CUE_SIN_AFECTACION,
      nombre: 'Escuela sin afectación',
      departamento: 'Capital',
      localidad: 'Corrientes',
      lat: -27.5,
      lon: -58.8,
      estado: 'sin_afectacion_reportada' as const,
      niveles: ['Secundario'],
      alumnos: 20,
      gravedad: 0,
      categoriaPrincipal: null,
      clases: 'normal',
      apoyo: null,
      sinActualizar: false,
      ultimaNovedad: null,
      alumnosSinClases: 0,
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

// T5c2: hooks de las capas territoriales de accesos. El componente los llama
// SIEMPRE (regla de hooks) pero con `habilitado` false cuando el flag
// territorial está apagado. Se registra el flag recibido
// para poder afirmarlo (mismo patrón que `llamadasRadar`).
const llamadasTerritorio = vi.hoisted(() => ({ habilitados: [] as boolean[] }))
const llamadasGeometria = vi.hoisted(() => ({
  cues: [] as (string | null)[],
  habilitados: [] as boolean[],
}))

// Estado mutable del doble de geometría, para poder simular los dos casos
// que el encuadre de la ruta tiene que distinguir: la escuela elegida sin ruta
// (`disponible: false`) y la geometría que llega TARDE, de otra escuela
// (`cueForzado`), que es la carrera contra la que el efecto se protege.
const estadoGeometria = vi.hoisted(() => ({
  disponible: true,
  cueForzado: null as string | null,
}))

// Fixture ESTABLE (misma identidad en cada render): el componente lo consume
// en `useMemo`, así que devolver un literal nuevo cada vez sería ruido.
const TERRITORIO_MAPA_MOCK = territorioCon({}, {}, {
  aislamiento: { fechaExtractoOsm: '2026-01-01', versionJob: '1' },
  susceptibilidad: { fechaCorrida: '2026-01-01' },
})

vi.mock('@/lib/infraestructura/use-territorio-mapa', () => ({
  useTerritorioMapa: (habilitado: boolean) => {
    llamadasTerritorio.habilitados.push(habilitado)
    return habilitado
      ? { data: TERRITORIO_MAPA_MOCK, loading: false, error: null }
      : { data: null, loading: false, error: null }
  },
}))

const GEOMETRIA_ACCESO_MOCK = {
  cueAnexo: CUE,
  disponible: true,
  fechaExtractoOsm: '2026-01-01',
  licencia: 'ODbL',
  atribucion: '© OpenStreetMap contributors' as const,
  ruta: {
    type: 'LineString' as const,
    coordinates: [
      [-58.83, -27.47],
      [-58.8, -27.5],
    ],
  },
  cruces: [],
  resumen: { puente: 0, vado: 0, sinEvidencia: 0 },
}

vi.mock('@/lib/infraestructura/use-geometria-acceso', () => ({
  useGeometriaAcceso: (cueAnexo: string | null, habilitado: boolean) => {
    llamadasGeometria.cues.push(cueAnexo)
    llamadasGeometria.habilitados.push(habilitado)
    if (!habilitado || cueAnexo === null) {
      return { data: null, loading: false, error: null }
    }
    return {
      data: {
        ...GEOMETRIA_ACCESO_MOCK,
        cueAnexo: estadoGeometria.cueForzado ?? cueAnexo,
        disponible: estadoGeometria.disponible,
        // Sin `disponible` la API no manda ruta: `construirRutaAcceso` devuelve
        // null y no hay bbox que encuadrar.
        ...(estadoGeometria.disponible ? {} : { ruta: undefined, cruces: undefined }),
      },
      loading: false,
      error: null,
    }
  },
}))

vi.mock('@/lib/infraestructura/use-exposicion-ruta', () => ({
  useExposicionRuta: () => ({ data: null, loading: false, error: null }),
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
  // T5a: cobertura del mapa por escuela (todo el universo filtrado). Se
  // mantiene sincronizado con `escuelas.items` para los tests que ya
  // esperaban el marcador de CUE; el test de cobertura completa lo reemplaza
  // temporalmente.
  puntos: [
    {
      cueAnexo: CUE,
      horizonteHoras: 24,
      nivelRiesgo: 'alto',
      confianza: 'media',
      nivelRiesgoAcceso: 'alto',
    },
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
  kpis: { riesgoAltoTotal: 1, sinEvidenciaTotal: 2, accesoCondicionado: { escuelas: 3, matricula: 15 } },
}

vi.mock('@/lib/infraestructura/use-radar', () => ({
  useRadar: (_filtros: unknown, activo: boolean) => {
    llamadasRadar.activos.push(activo)
    return activo
      ? { data: RADAR_DATA, loading: false, error: null }
      : { data: null, loading: false, error: null }
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
  // El clic de departamento arrastra coordenadas: el popup de clic se ancla
  // en el `lngLat` del evento, igual que el evento real de MapLibre.
  type MouseEventMock = { features: FeatureMock[]; lngLat?: { lng: number; lat: number } }

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
      onLoad?: () => void
    }
  >(function MapGL(props, ref) {
    useImperativeHandle(
      ref,
      () => ({
        getMap: () => ({
          flyTo: FLY_TO_MOCK,
          fitBounds: FIT_BOUNDS_MOCK,
          resize: vi.fn(),
          stop: vi.fn(),
          // `infra-partes-src` tiene que existir para que
          // `actualizarCuesNoAgrupados` corra; `querySourceFeatures` devuelve
          // los cues de `CUES_DESAGRUPADOS_MOCK` (por defecto, las dos
          // escuelas del padrón) como desagrupadas, así los <Marker> DOM
          // (badge de estado y riesgo) se renderizan en jsdom.
          getSource: (id: string) => (id === 'infra-partes-src' ? {} : undefined),
          querySourceFeatures: () =>
            CUES_DESAGRUPADOS_MOCK.cues.map((cueAnexo) => ({ properties: { cueAnexo } })),
        }),
      }),
      [],
    )
    // El doble no tiene eventos reales de MapLibre: dispara `onLoad` al montar
    // para que el componente calcule `cuesNoAgrupados` y monte los marcadores.
    // Se lee `props.onLoad` (no la referencia capturada) y se depende de `[]`:
    // el evento `onLoad` real de MapLibre se dispara UNA sola vez al terminar de
    // cargar el mapa, nunca de nuevo por cambios de props.
    useEffect(() => {
      props.onLoad?.()
      // eslint-disable-next-line react-hooks/exhaustive-deps -- se dispara una sola vez al montar, como el evento real de MapLibre
    }, [])
    const feature = (layerId: string, properties: Record<string, unknown>): FeatureMock => ({
      layer: { id: layerId },
      properties,
    })
    const clickCases: Array<
      [string, FeatureMock | FeatureMock[], MouseEventMock['lngLat']?]
    > = [
      ['mock-click-parte', feature('infra-partes', { cueAnexo: CUE })],
      ['mock-click-parte-sin-afectacion', feature('infra-partes', { cueAnexo: CUE_SIN_AFECTACION })],
      // El click real ahora acierta el ícono de escuela (capa `symbol`),
      // no el círculo chico de abajo: la feature que MapLibre entrega
      // pertenece a `infra-partes-escuela-icono`.
      ['mock-click-escuela-icono', feature('infra-partes-escuela-icono', { cueAnexo: CUE_SIN_AFECTACION })],
      ['mock-click-departamento', feature('infra-departamentos-relleno', { nombre: 'Capital' }), { lng: -58.8, lat: -27.5 }],
      ['mock-click-departamento-empedrado', feature('infra-departamentos-relleno', { nombre: 'Empedrado' }), { lng: -58.8, lat: -27.5 }],
      ['mock-click-peligro', feature('infra-peligro-fill', { nombre: 'CAPITAL' })],
      // Q3: los íconos territoriales (aislamiento/inundación/cruces) se
      // dibujan ENCIMA del polígono del departamento, así que el click real
      // devuelve las DOS features. El doble reproduce ese caso: si el
      // handler no los atiende con prioridad, gana el departamento y el
      // gesto termina filtrando la provincia en vez de abrir la escuela.
      ['mock-click-aislamiento', [feature('infra-aislamiento-symbol', { cueAnexo: CUE }), feature('infra-departamentos-relleno', { nombre: 'Capital' })], { lng: -58.83, lat: -27.47 }],
      ['mock-click-inundacion', [feature('infra-inundacion-symbol', { cueAnexo: CUE_SIN_AFECTACION }), feature('infra-departamentos-relleno', { nombre: 'Capital' })], { lng: -58.8, lat: -27.5 }],
      ['mock-click-cruce', [feature('infra-cruces-acceso-symbol', { clasificacion: 'sin_evidencia' }), feature('infra-departamentos-relleno', { nombre: 'Capital' })], { lng: -58.81, lat: -27.48 }],
    ]
    return (
      <div data-testid="mock-maplibre">
        {clickCases.map(([testId, target, lngLat]) => (
          <button
            key={testId}
            data-testid={testId}
            onClick={() =>
              props.onClick?.({
                features: Array.isArray(target) ? target : [target],
                ...(lngLat ? { lngLat } : {}),
              })
            }
          />
        ))}
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
    AttributionControl: () => null,
    Popup: (props: { children?: React.ReactNode }) => <>{props.children ?? null}</>,
    // `data` no se renderiza en el DOM real (MapLibre lo consume vía WebGL),
    // pero se expone acá como atributo serializado: es la única forma de
    // inspeccionar, desde un test de integración, qué features terminan en
    // el GeoJSON de cada fuente sin depender del click handler.
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
let seleccionarEscuelaRegistrada: ((escuela: EscuelaMapaPadron) => void) | null = null

type PropsRenderMapa = {
  mostrarEnlaceNominal: boolean
  escuelasMapa: EscuelasMapaPadronResultado | null
  hazardContextEnabled?: boolean
  riskRadarEnabled?: boolean
  pestana: 'actual' | 'radar' | 'planificacion'
  onRegistrarSeleccion?: (fn: ((escuela: EscuelaMapaPadron) => void) | null) => void
}

type OpcionesRenderMapa = Omit<PropsRenderMapa, 'pestana' | 'escuelasMapa'> & {
  pestana?: PropsRenderMapa['pestana']
  escuelasMapa?: PropsRenderMapa['escuelasMapa']
}

async function renderMapa(props: OpcionesRenderMapa) {
  const MapInfraestructuraPage = await cargar()
  seleccionarEscuelaRegistrada = null
  const registrarSeleccion = (fn: ((escuela: EscuelaMapaPadron) => void) | null) => {
    seleccionarEscuelaRegistrada = fn
  }
  let propsActuales: PropsRenderMapa = {
    pestana: 'actual',
    escuelasMapa: FIXTURE_ESCUELAS_MAPA,
    onRegistrarSeleccion: registrarSeleccion,
    ...props,
  }
  const vista = render(<MapInfraestructuraPage {...propsActuales} />)
  const { unmount } = vista
  desmontarMapa = unmount
  return {
    rerender: (cambios: Partial<OpcionesRenderMapa>) => {
      propsActuales = { ...propsActuales, ...cambios }
      vista.rerender(<MapInfraestructuraPage {...propsActuales} />)
    },
  }
}

describe('MapInfraestructuraPage — filtros de padrón', () => {
  it('muestra el vacío cuando el padrón filtrado no tiene reportes', async () => {
    await renderMapa({
      mostrarEnlaceNominal: true,
      escuelasMapa: {
        ...FIXTURE_ESCUELAS_MAPA,
        escuelas: FIXTURE_ESCUELAS_MAPA.escuelas.filter((escuela) => escuela.cueAnexo === CUE_SIN_AFECTACION),
      },
    })
    expect(screen.getByText('Ninguna escuela con reporte para estos filtros.')).toBeInTheDocument()
    desmontarMapa?.()
  })
})

// Invoca la selección registrada por el contenedor y devuelve la ficha ya
// abierta. El buscador se prueba en FiltrosChips; acá se conserva la cobertura
// del vuelo, el encuadre de ruta y el aviso de escuelas sin ubicación.
async function seleccionarPorBuscador(nombre: string) {
  const escuela = FIXTURE_ESCUELAS_MAPA.escuelas.find((item) => item.nombre === nombre)
  if (!escuela || !seleccionarEscuelaRegistrada) throw new Error(`No se registró la selección de ${nombre}`)
  await act(async () => seleccionarEscuelaRegistrada?.(escuela))
  return screen.findByTestId('mock-ficha-escuela')
}

async function cerrarFicha() {
  await userEvent.click(screen.getByRole('button', { name: 'Volver a la lista' }))
  await waitFor(() => expect(screen.queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument())
}

// Viewport del mapa. jsdom arranca en 1024x768, que es justo el breakpoint en
// el que la ficha pasa de panel lateral a hoja inferior: los tests fijan el
// tamaño a propósito para no depender de ese default. `spyOn` sobre el getter
// (y no `vi.stubGlobal`) porque el componente lee `window.innerWidth`: en el
// entorno jsdom de Vitest el global no es el objeto window. `vi.restoreAllMocks`
// del beforeEach los vuelve a dejar como estaban.
// También alcanza para decidir si la ficha es hoja inferior o panel lateral:
// el componente pregunta por matchMedia (breakpoint de 1080px de globals.css) y
// cae al ancho de la ventana cuando el entorno no lo expone — que es lo que
// pasa con el jsdom de esta suite, donde `window.matchMedia` no existe.
function viewport(ancho: number, alto: number) {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(ancho)
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(alto)
}

// Detecta el popup de clic del departamento ("En <depto> hay N escuelas · …").
// Se ancla en la fórmula propia del popup de departamento para no confundirlo
// con los textos del panel lateral o del popup de cluster.
// Se usa como matcher de texto de Testing Library, que la invoca como
// `(contenido, elemento)`: el segundo parámetro es el que lleva el tag. Por eso
// el primero se descarta con `_`.
function esParrafoPopupDepartamento(_contenido: string, elemento: Element | null): boolean {
  if (elemento?.tagName !== 'P') return false
  return /^\s*En .+ hay .+escuelas ·/.test(elemento.textContent ?? '')
}

beforeEach(() => {
  vi.restoreAllMocks()
  // Los spies del doble del mapa son `vi.fn()` de módulo: se limpian a mano
  // para que el conteo de encuadres (`toHaveBeenCalledTimes`) sea el de este
  // test y no la suma de los anteriores.
  FLY_TO_MOCK.mockClear()
  FIT_BOUNDS_MOCK.mockClear()
  estadoGeometria.disponible = true
  estadoGeometria.cueForzado = null
  llamadasRadar.activos.length = 0
    llamadasSnapshot.snapshotIds.length = 0
  llamadasTerritorio.habilitados.length = 0
  llamadasGeometria.cues.length = 0
  llamadasGeometria.habilitados.length = 0
  CUES_DESAGRUPADOS_MOCK.cues.length = 0
  CUES_DESAGRUPADOS_MOCK.cues.push(CUE, CUE_SIN_AFECTACION)
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
  window.history.replaceState({}, '', '/')
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
      expect(screen.getByText('Departamento:').parentElement).toHaveTextContent('Capital')
      await userEvent.click(screen.getByText('Quitar filtro'))
      expect(screen.queryByText('Departamento:')).not.toBeInTheDocument()
    },
    15000,
  )

  it('abre la ficha al hacer click en un parte del mapa', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    expect(screen.queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('mock-click-parte'))
    const ficha = await screen.findByTestId('mock-ficha-escuela')
    expect(ficha).toHaveAttribute('data-cue', CUE)
  })

  // Hallazgo 7 (regresión central de V4): una escuela del padrón SIN
  // afectación vigente tiene que abrir su ficha igual. Antes el handler sólo
  // llamaba a setSeleccionCue si `partesPorCue` ya tenía ese CUE, así que el
  // click no hacía nada.
  it('abre la ficha al hacer click en una escuela del padrón sin afectación', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    expect(screen.queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('mock-click-parte-sin-afectacion'))
    const ficha = await screen.findByTestId('mock-ficha-escuela')
    expect(ficha).toHaveAttribute('data-cue', CUE_SIN_AFECTACION)
    expect(within(screen.getByTestId('panel-lateral')).getByRole('button', { name: 'Volver a la lista' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('.map-ficha-panel')).toBeNull()
  })

  // La capa `symbol` del ícono de escuela es la que el usuario realmente
  // clickea (el círculo queda debajo y es más chico). El handler tiene que
  // reconocer también esa capa, no sólo `infra-partes`. Y como desde Q20 el
  // hover se sacó, ese click abre la ficha y NADA más: ni tooltip, ni popup de
  // departamento (que sólo aparece si el click cae en el polígono).
  it('clickear el ícono de una escuela del padrón abre su ficha y nada más', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    expect(screen.queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('mock-click-escuela-icono'))

    const ficha = await screen.findByTestId('mock-ficha-escuela')
    expect(ficha).toHaveAttribute('data-cue', CUE_SIN_AFECTACION)
    // El click noSeleccionó el departamento que está debajo del ícono.
    expect(screen.queryByText('Departamento:')).not.toBeInTheDocument()
    expect(screen.queryByText(esParrafoPopupDepartamento)).not.toBeInTheDocument()
  })

  it('abre el modal nominal desde la ficha', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-click-parte'))
    await userEvent.click(await screen.findByText('abrir-nominal-desde-ficha'))
    expect(await screen.findByTestId('mock-nominal-modal')).toBeInTheDocument()
    // La ficha sigue abierta: abrir el nominal no la cierra.
    expect(screen.getByTestId('mock-ficha-escuela')).toBeInTheDocument()
  })

  it('abre el modal de historial desde la ficha', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-click-parte'))
    await userEvent.click(await screen.findByRole('button', { name: 'Ver historial' }))
    expect(await screen.findByTestId('mock-historial-modal')).toBeInTheDocument()
  })

  it('cerrar cualquiera de los tres modales no toca los filtros ni las capas visibles', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    // Estado previo: se activa el padrón completo, apagado por defecto.
    const capaPadron = screen.getByRole('checkbox', { name: 'Todas las escuelas' })
    await userEvent.click(capaPadron)
    expect(capaPadron).toBeChecked()

    await userEvent.click(screen.getByTestId('mock-click-parte'))
    await userEvent.click(await screen.findByText('abrir-nominal-desde-ficha'))
    await userEvent.click(await screen.findByRole('button', { name: 'Ver historial' }))

    await userEvent.click(screen.getByText('cerrar-nominal'))
    await waitFor(() => expect(screen.queryByTestId('mock-nominal-modal')).not.toBeInTheDocument())

    await userEvent.click(screen.getByText('cerrar-historial'))
    await waitFor(() => expect(screen.queryByTestId('mock-historial-modal')).not.toBeInTheDocument())

    await cerrarFicha()

    // La capa que se activó antes de abrir los modales sigue activa.
    expect(screen.getByRole('checkbox', { name: 'Todas las escuelas' })).toBeChecked()
  })
})

describe('MapInfraestructuraPage — modo Radar', () => {
  it('muestra el panel lateral de Situación actual y no el panel de Radar', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'actual' })

    expect(await screen.findByTestId('panel-lateral')).toBeInTheDocument()
    expect(screen.queryByTestId('panel-radar')).not.toBeInTheDocument()
  })

  it('muestra un panel de Radar con contenido dentro del panel lateral', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    const panelLateral = await screen.findByTestId('panel-lateral')
    expect(within(panelLateral).getByTestId('panel-radar')).toBeInTheDocument()
    expect(panelLateral).not.toBeEmptyDOMElement()
  })

  it('no dibuja una caja vacía en la columna izquierda del Radar', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    const panelRadar = screen.getByTestId('panel-radar')
    expect(panelRadar).toHaveAttribute('hidden')
    expect(panelRadar).toBeEmptyDOMElement()
  })

  it('no renderiza el conmutador Situación actual / Radar', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'actual' })
    expect(document.querySelector('.map-modo-conmutador')).toBeNull()
  })

  it('con pestana="radar" activa el modo radar sin conmutador', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })
    expect(screen.getByRole('group', { name: 'Variable meteorológica' })).toBeInTheDocument()
    expect(document.querySelector('.map-modo-conmutador')).toBeNull()
  })

  it('con pestana="radar" y el flag apagado se comporta como Situación actual', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: false, pestana: 'radar' })
    expect(screen.queryByRole('group', { name: 'Variable meteorológica' })).not.toBeInTheDocument()
    expect(llamadasRadar.activos.every((activo) => activo === false)).toBe(true)
  })

  it('con el flag ausente NO monta el conmutador ni el selector, y el hook queda inactivo', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    expect(document.querySelector('.map-modo-conmutador')).toBeNull()
    expect(
      screen.queryByRole('group', { name: /horizonte temporal del radar/i }),
    ).not.toBeInTheDocument()

    // El hook se llamó (regla de hooks) pero SIEMPRE con activo=false.
    expect(llamadasRadar.activos.length).toBeGreaterThan(0)
    expect(llamadasRadar.activos.every((activo) => activo === false)).toBe(true)
  })

  it('con el flag en false tampoco monta el conmutador', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: false })
    expect(document.querySelector('.map-modo-conmutador')).toBeNull()
    expect(llamadasRadar.activos.every((activo) => activo === false)).toBe(true)
  })

  it('con el flag en true y pestaña Situación actual no dispara el radar', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })

    expect(document.querySelector('.map-modo-conmutador')).toBeNull()

    // Aún en Radar desactivado: hook inactivo y sin selector de horizonte.
    expect(
      screen.queryByRole('group', { name: /horizonte temporal del radar/i }),
    ).not.toBeInTheDocument()
    expect(llamadasRadar.activos.at(-1)).toBe(false)
  })

  it('con Radar activo no consulta el radar de riesgo y muestra los controles meteorológicos', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    expect(llamadasRadar.activos.at(-1)).toBe(false)
    expect(screen.getByRole('group', { name: 'Variable meteorológica' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lluvia (mm)' })).toBeInTheDocument()
    expect(screen.queryByTestId('radar-kpi-riesgo-alto')).not.toBeInTheDocument()
  })

  it('al volver a Situación actual deja el hook inactivo otra vez', async () => {
    const { rerender } = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })
    expect(llamadasRadar.activos.at(-1)).toBe(false)

    rerender({ pestana: 'actual' })
    expect(llamadasRadar.activos.at(-1)).toBe(false)
    expect(screen.queryByRole('group', { name: 'Variable meteorológica' })).not.toBeInTheDocument()
  })

  it('Radar no monta paneles de explicación de riesgo legados', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    expect(screen.queryByTestId('risk-explanation-panel')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('mock-click-peligro'))
    expect(screen.queryByTestId('risk-explanation-departamento')).not.toBeInTheDocument()
    // La ficha de partes NO se abrió: son estados independientes.
    expect(screen.queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()
  })

  it('no dibuja marcadores escolares de riesgo en el radar meteorológico', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    // El punto de riesgo ahora es un <Marker> DOM (ícono Lucide) con su
    // propio onClick, no una capa circle de MapLibre.
    expect(screen.queryByRole('button', { name: `Riesgo alto: ${CUE}` })).not.toBeInTheDocument()
    expect(screen.queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()
  })

  it('no monta el marcador de riesgo legado', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    expect(screen.queryByRole('button', { name: `Riesgo alto: ${CUE}` })).not.toBeInTheDocument()
    // La fuente/capas circle viejas de riesgo compuesto desaparecieron. La de
    // acceso (`infra-riesgo-acceso-src`) sigue intacta, es otra dimensión.
    expect(screen.queryByTestId('mock-source-infra-riesgo-src')).not.toBeInTheDocument()
  })

  // T5a: la capa de riesgo cubre TODO el universo filtrado (`puntos`), no sólo
  // la página 1 del ranking (`escuelas.items`, 50 filas) ni las escuelas con
  // parte (`dataVisible.partes`). Acá `escuelas.items` trae UNA escuela
  // mientras `puntos` trae tres que sólo existen en el padrón y no tienen
  // parte: las tres tienen que dibujar su marcador. Antes de T5a no se
  // dibujaba ninguna (no estaban en `items` ni en `partes`).
  it('no muestra puntos del riesgo escolar en el radar meteorológico', async () => {
    const CUES_SIN_PARTE = ['1801605-96', '1801605-97', '1801605-98']
    const puntosOriginales = RADAR_DATA.puntos
    for (const cueAnexo of CUES_SIN_PARTE) {
      FIXTURE_ESCUELAS_MAPA.escuelas.push({
        cueAnexo,
        nombre: `Escuela sin parte ${cueAnexo}`,
        departamento: 'Capital',
        localidad: 'Corrientes',
        lat: -27.5,
        lon: -58.8,
        estado: 'sin_afectacion_reportada' as const,
        niveles: ['Primario'],
        alumnos: 12,
        gravedad: 0,
        categoriaPrincipal: null,
        clases: 'normal',
        apoyo: null,
        sinActualizar: false,
        ultimaNovedad: null,
        alumnosSinClases: 0,
      })
      CUES_DESAGRUPADOS_MOCK.cues.push(cueAnexo)
    }
    RADAR_DATA.puntos = CUES_SIN_PARTE.map((cueAnexo) => ({
      cueAnexo,
      horizonteHoras: 24,
      nivelRiesgo: 'alto',
      confianza: 'media',
      nivelRiesgoAcceso: 'alto',
    }))

    try {
      await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

      for (const cueAnexo of CUES_SIN_PARTE) expect(screen.queryByRole('button', { name: `Riesgo alto: ${cueAnexo}` })).not.toBeInTheDocument()
    } finally {
      FIXTURE_ESCUELAS_MAPA.escuelas.splice(2)
      CUES_DESAGRUPADOS_MOCK.cues.length = 2
      RADAR_DATA.puntos = puntosOriginales
    }
  })

  it('no pide detalles del riesgo escolar desde el radar meteorológico', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    // Sin escuela seleccionada el hook se llama con null (no dispara fetch).
    expect(llamadasSnapshot.snapshotIds.at(-1)).toBeNull()

    expect(llamadasSnapshot.snapshotIds.at(-1)).toBeNull()
    expect(screen.queryByTestId('risk-explanation-factores')).not.toBeInTheDocument()
  })

  it('Radar sustituye las capas de riesgo por el radar meteorológico', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })
    expect(screen.getByRole('group', { name: 'Variable meteorológica' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: /niveles de peligro meteorológico/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /todas las escuelas/i })).not.toBeInTheDocument()
  })
})

describe('M1: clic de departamento y buscador de escuelas', () => {
  // El popup de departamento arma su texto con <strong> intercalados ("En
  // <strong>Capital</strong> hay <strong>10</strong> escuelas…"), así que el
  // matcher por defecto de getByText (que sólo mira los text nodes DIRECTOS)
  // no lo ve. Se matchea por tagName + textContent completo del <p>.
  const esParrafoHover = (element: Element | null): boolean =>
    element?.tagName === 'P' &&
    /En Capital hay 10 escuelas/.test(element.textContent ?? '')
  const popupHover = () => screen.queryByText((_contenido, element) => esParrafoHover(element))
  const esperarSinPopupHover = () =>
    waitFor(() => expect(popupHover()).not.toBeInTheDocument())

  it('clic de departamento muestra total, afectadas y porcentaje, y se cierra con Esc', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    expect(popupHover()).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('mock-click-departamento'))

    const popup = await screen.findByText((_contenido, element) => esParrafoHover(element))
    expect(popup).toHaveTextContent('En Capital hay 10 escuelas')
    expect(popup).toHaveTextContent('3 están afectadas')
    expect(popup).toHaveTextContent('30%')

    await userEvent.keyboard('{Escape}')
    await esperarSinPopupHover()
  })

  it('clickear el mismo departamento de nuevo cierra el popup', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-click-departamento'))
    expect(await screen.findByText((_contenido, element) => esParrafoHover(element))).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('mock-click-departamento'))
    await esperarSinPopupHover()
  })

  it('clickear otro departamento reemplaza el popup', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-click-departamento'))
    expect(await screen.findByText((_contenido, element) => esParrafoHover(element))).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('mock-click-departamento-empedrado'))
    await esperarSinPopupHover()
  })

  // Q20: el hover se sacó; estos dos casos ahora clickean una escuela/cluster.
  // El clic sobre la escuela abre su ficha (no un tooltip) y el clic sobre un
  // cluster dispara el zoom de expansión, así que el popup de departamento no
  // aplica: se borran los tests "el tooltip X gana al de departamento" porque
  // ya no hay tooltips de hover.

  it('al cambiar de modo se limpia el popup de departamento (no queda clavado)', async () => {
    const { rerender } = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true })

    await userEvent.click(screen.getByTestId('mock-click-departamento'))
    expect(await screen.findByText((_contenido, element) => esParrafoHover(element))).toBeInTheDocument()

    rerender({ pestana: 'radar' })
    await esperarSinPopupHover()
  })

  it('buscar y seleccionar una escuela sin afectación hace flyTo al punto y abre la ficha', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })
    await seleccionarPorBuscador('Escuela sin afectación')

    expect(FLY_TO_MOCK).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-58.8, -27.5] }),
    )
    // Hallazgo 7: sin afectación reportada igual se abre la ficha de la
    // escuela (la ausencia de parte la resuelve el propio modal).
    const ficha = await screen.findByTestId('mock-ficha-escuela')
    expect(ficha).toHaveAttribute('data-cue', CUE_SIN_AFECTACION)
  })
})

describe('M2: panel de situación actual con padrón', () => {
  it('muestra los indicadores del padrón y sus reportes', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    const panel = screen.getByTestId('panel-lateral')
    expect(within(panel).getByText('Situación actual')).toBeInTheDocument()
    expect(within(panel).getByText('Escuelas con reporte').previousElementSibling).toHaveTextContent('1')
    expect(within(panel).getByText('Sin clases', { selector: '.map-sitact__kpi span' }).parentElement).toHaveTextContent('1')
    expect(within(panel).getByRole('button', { name: /Escuela 1/ })).toBeInTheDocument()
  })

  it('actualiza el panel cuando recibe el padrón filtrado', async () => {
    const escuelasFiltradas = {
      ...FIXTURE_ESCUELAS_MAPA,
      escuelas: [],
    }
    const { rerender } = await renderMapa({ mostrarEnlaceNominal: true })

    rerender({ escuelasMapa: escuelasFiltradas })

    const panel = screen.getByTestId('panel-lateral')
    expect(within(panel).getByText('Escuelas con reporte').previousElementSibling).toHaveTextContent('0')
    expect(within(panel).getByText('Ninguna escuela con reporte para estos filtros.')).toBeInTheDocument()
    desmontarMapa?.()
  })

  it('la casilla de "Todas las escuelas" arranca destildada', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    const checkbox = screen.getByRole('checkbox', { name: /todas las escuelas/i })
    expect(checkbox).not.toBeChecked()
  })

  it('tildar la casilla mantiene visible el panel de situación actual', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(
      screen.getByRole('checkbox', { name: /todas las escuelas/i }),
    )

    expect(screen.getByText('Situación actual')).toBeInTheDocument()
  })
})

describe('MapInfraestructuraPage — capas del radar de riesgo anteriores', () => {
  it('oculta el selector de riesgo escolar al activar Radar meteorológico', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    expect(screen.getByRole('group', { name: 'Variable meteorológica' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /riesgo pronosticado de llegar/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('mock-source-infra-riesgo-acceso-src')).not.toBeInTheDocument()
  })

  it('no permite montar la capa de acceso antigua desde Radar', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    expect(screen.queryByTestId('mock-source-infra-riesgo-acceso-src')).not.toBeInTheDocument()
  })


})

describe('MapInfraestructuraPage — capas territoriales de accesos (T5c2)', () => {
  it('con el flag apagado no monta el control ni la leyenda y el hook territorial queda inactivo', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    // Ni un elemento nuevo del dominio territorial en el DOM.
    expect(screen.queryByText('Capas territoriales')).not.toBeInTheDocument()
    expect(screen.queryByTestId('leyenda-ruta')).not.toBeInTheDocument()

    // El hook se llama (regla de hooks) pero SIEMPRE con habilitado=false.
    expect(llamadasTerritorio.habilitados.length).toBeGreaterThan(0)
    expect(llamadasTerritorio.habilitados.every((habilitado) => habilitado === false)).toBe(true)
  })

  it('con el flag prendido monta el control y habilita el hook territorial', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    expect(screen.getByText('Capas territoriales')).toBeInTheDocument()
    expect(screen.queryByLabelText(/agua estimada por crecida de río/i)).not.toBeInTheDocument()
    expect(llamadasTerritorio.habilitados.at(-1)).toBe(true)
  })

  it('al seleccionar una escuela pide su geometría y la leyenda muestra la ruta disponible', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    await userEvent.click(screen.getByTestId('mock-click-parte'))

    // Geometría SÓLO de la escuela seleccionada, con el flag prendido.
    expect(llamadasGeometria.cues).toContain(CUE)
    expect(llamadasGeometria.habilitados.at(-1)).toBe(true)

    const bloque = await screen.findByTestId('leyenda-ruta-disponible')
    expect(bloque).toHaveTextContent('Camino calculado · Escuela 1')
  })


})

// Q1: la ficha abierta/cerrada pasó a ser un estado DISTINTO del de selección.
// Antes, cerrarla (X o Esc) borraba `seleccionCue` y con él el resaltado, la
// ruta de acceso y su leyenda, sin ninguna forma de volver atrás salvo elegir
// otra escuela. Estos tests fijan el contrato nuevo: cerrar la ficha conserva
// la selección y deja un grupo de acciones para reabrirla o quitarla.
describe('Q1: cerrar la ficha conserva la selección', () => {
  it('cerrar la ficha no borra la selección: la ruta sigue y aparece "Ver ficha"', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    const ficha = await seleccionarPorBuscador('Escuela 1')
    expect(ficha).toHaveAttribute('data-cue', CUE)

    // Con la escuela elegida, la leyenda muestra la ruta disponible.
    expect(await screen.findByTestId('leyenda-ruta-disponible')).toBeInTheDocument()

    await cerrarFicha()

    // La selección NO se fue con la ficha: la ruta de la escuela sigue dibujada
    // y la leyenda la sigue describiendo.
    expect(screen.getByTestId('leyenda-ruta-disponible')).toBeInTheDocument()
    expect(within(screen.getByTestId('panel-lateral')).getByText('Situación actual')).toBeInTheDocument()
    // Y hay una forma explícita de volver a la ficha.
    expect(screen.getByTestId('reabrir-ficha')).toBeInTheDocument()
  })

  it('"Ver ficha" reabre la ficha y el grupo de acciones desaparece', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await seleccionarPorBuscador('Escuela 1')
    await cerrarFicha()

    await userEvent.click(screen.getByTestId('reabrir-ficha'))

    const ficha = await screen.findByTestId('mock-ficha-escuela')
    expect(ficha).toHaveAttribute('data-cue', CUE)
    expect(screen.queryByTestId('reabrir-ficha')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quitar-seleccion')).not.toBeInTheDocument()
  })

  it('"Quitar selección" borra la selección completa (sin ruta y sin grupo)', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    await seleccionarPorBuscador('Escuela 1')
    expect(await screen.findByTestId('leyenda-ruta-disponible')).toBeInTheDocument()

    await cerrarFicha()

    await userEvent.click(screen.getByTestId('quitar-seleccion'))

    // Sin selección no hay ruta disponible, no hay ficha y no queda el grupo
    // flotando sobre el mapa.
    expect(screen.queryByTestId('leyenda-ruta-disponible')).not.toBeInTheDocument()
    expect(screen.queryByTestId('leyenda-ruta-sin-seleccion')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reabrir-ficha')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quitar-seleccion')).not.toBeInTheDocument()
  })

  it('volver a elegir la MISMA escuela reabre la ficha que estaba cerrada', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await seleccionarPorBuscador('Escuela 1')
    await cerrarFicha()

    // Mismo cue, distinto cue no: si la selección no limpiara el estado de
    // "ficha cerrada", la segunda búsqueda no abriría nada.
    const ficha = await seleccionarPorBuscador('Escuela 1')
    expect(ficha).toHaveAttribute('data-cue', CUE)
  })

  it('el grupo sólo existe con selección viva y ficha cerrada', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    // Sin selección no hay grupo.
    expect(screen.queryByTestId('quitar-seleccion')).not.toBeInTheDocument()

    await seleccionarPorBuscador('Escuela 1')
    // Con la ficha abierta tampoco: el grupo es para el estado "cerrada".
    expect(screen.queryByTestId('quitar-seleccion')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Volver a la lista' }))
    expect(await screen.findByTestId('quitar-seleccion')).toBeInTheDocument()
    // Ambos botones son botones de verdad, no <div> con onClick.
    expect(screen.getByTestId('reabrir-ficha').tagName).toBe('BUTTON')
    expect(screen.getByTestId('reabrir-ficha')).toHaveAttribute('type', 'button')
    expect(screen.getByTestId('reabrir-ficha')).toHaveAttribute(
      'aria-label',
      'Reabrir la ficha de Escuela 1',
    )
  })

  it('el shell marca data-ficha-abierta según el estado real de la ficha', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })
    const shell = screen.getByTestId('mock-maplibre').closest('.map-shell')
    expect(shell).toHaveAttribute('data-ficha-abierta', 'false')

    await seleccionarPorBuscador('Escuela 1')
    await waitFor(() => expect(shell).toHaveAttribute('data-ficha-abierta', 'true'))

    await userEvent.click(screen.getByRole('button', { name: 'Volver a la lista' }))
    // Cerrada con selección viva: el atributo dice "false" pero el grupo
    // sigue — es lo que permite al CSS correr los controles de capas.
    await waitFor(() => expect(shell).toHaveAttribute('data-ficha-abierta', 'false'))
    expect(screen.getByTestId('reabrir-ficha')).toBeInTheDocument()
  })

  it('mantiene visible la columna izquierda y permite seleccionar una escuela', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    const cajon = document.getElementById('infra-left-stack')
    expect(cajon).not.toHaveAttribute('data-open')
    expect(screen.queryByRole('button', { name: 'Buscar escuelas' })).not.toBeInTheDocument()

    await seleccionarPorBuscador('Escuela 1')

    expect(await screen.findByTestId('mock-ficha-escuela')).toBeInTheDocument()
  })

  it('la leyenda de accesos va antes del panel de situación actual', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    // La leyenda explica las capas territoriales y cambia con la selección: al
    // final del panel quedaba empujada debajo del pliegue de indicadores y el
    // usuario nunca la veía.
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Dificultad para llegar por camino (0 a 3)' }),
    )

    const leyenda = await screen.findByTestId('leyenda-aislamiento')
    const panelActual = screen.getByText('Situación actual')
    expect(
      leyenda.compareDocumentPosition(panelActual) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

// Q3: encuadre de la ruta de acceso. Elegir una escuela vuela a zoom 14 sobre
// ella, así que una ruta de decenas de kilómetros quedaba como un trazo
// vertical de un píxel: el mapa nunca encuadraba el recorrido que la ficha
// acaba de describir. Estos tests fijan las tres respuestas que el
// componente tiene que dar: encuadrar cuando la geometría llega, encuadrar
// cuando el usuario lo pide explícitamente, y NO encuadrar cuando no hay
// nada que encuadrar.
describe('Q3: encuadre de la ruta de acceso', () => {
  it('al elegir una escuela encuadra la ruta una sola vez, con el padding del viewport', async () => {
    viewport(1440, 900)
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    await seleccionarPorBuscador('Escuela 1')

    // Un único encuadre: el de la ruta que acaba de llegar.
    expect(FIT_BOUNDS_MOCK).toHaveBeenCalledTimes(1)
    const [bbox, opciones] = FIT_BOUNDS_MOCK.mock.calls[0]
    // El bbox es el de la geometría del doble ([-58.83,-27.47] → [-58.8,-27.5]).
    expect(bbox).toEqual([
      [-58.83, -27.5],
      [-58.8, -27.47],
    ])
    // Con la ficha abierta, el padding deja libre la columna izquierda (400)
    // y la ficha, su toggle y el margen derecho (574px): la ruta queda en la
    // franja que el usuario realmente ve.
    expect(opciones).toEqual({
      padding: { top: 60, bottom: 60, left: 400, right: 356 },
      duration: 700,
    })
  })

  it('no encuadra una geometría que es de otra escuela (respuesta tarde)', async () => {
    // El doble devuelve geometría de OTRO cue que la que se acaba de elegir:
    // es la carrera entre el pedido y una selección nueva. Encadrarla dejaría
    // al usuario mirando la ruta de la escuela anterior.
    estadoGeometria.cueForzado = '1801605-00'
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    await seleccionarPorBuscador('Escuela 1')

    expect(FIT_BOUNDS_MOCK).not.toHaveBeenCalled()
    // El vuelo a la escuela se mantiene: es la respuesta honesta.
    expect(FLY_TO_MOCK).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-58.83, -27.47] }),
    )
  })

  it('sin ruta disponible no encuadra nada y deja el vuelo a la escuela', async () => {
    estadoGeometria.disponible = false
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    await seleccionarPorBuscador('Escuela 1')

    expect(FIT_BOUNDS_MOCK).not.toHaveBeenCalled()
    expect(FLY_TO_MOCK).toHaveBeenCalled()
  })

  it('con la capa de ruta apagada no se pide geometría ni se encuadra', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    const casilla = screen.getByRole('checkbox', { name: /camino y cruces de agua/i })
    await userEvent.click(casilla)
    await seleccionarPorBuscador('Escuela 1')

    // La capa apagada significa "no me muestres la ruta": ni geometría ni
    // encuadre. El vuelo a la escuela es lo que corresponde.
    expect(casilla).not.toBeChecked()
    expect(llamadasGeometria.habilitados.at(-1)).toBe(false)
    expect(FIT_BOUNDS_MOCK).not.toHaveBeenCalled()
  })

  it('"Ver recorrido" encuadra al instante con la ruta ya encendida', async () => {
    viewport(1440, 900)
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })
    await seleccionarPorBuscador('Escuela 1')
    // Se descarta el encuadre automático de la selección para verificar sólo
    // el del botón.
    FIT_BOUNDS_MOCK.mockClear()

    await userEvent.click(screen.getByTestId('ficha-acceso-ver-ruta'))

    expect(FIT_BOUNDS_MOCK).toHaveBeenCalledTimes(1)
    expect(FIT_BOUNDS_MOCK).toHaveBeenCalledWith(
      [
        [-58.83, -27.5],
        [-58.8, -27.47],
      ],
      {
        padding: { top: 60, bottom: 60, left: 400, right: 356 },
        duration: 600,
      },
    )
    // En pantalla ancha la ficha es un panel lateral que no tapa la ruta: se
    // queda abierta.
    expect(screen.getByTestId('mock-ficha-escuela')).toBeInTheDocument()
  })

  it('"Ver recorrido" con la ruta apagada enciende la capa y encuadra cuando llega', async () => {
    viewport(1440, 900)
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })
    await seleccionarPorBuscador('Escuela 1')

    const casilla = screen.getByRole('checkbox', { name: /camino y cruces de agua/i })
    await userEvent.click(casilla)
    expect(llamadasGeometria.habilitados.at(-1)).toBe(false)
    FIT_BOUNDS_MOCK.mockClear()

    await userEvent.click(screen.getByTestId('ficha-acceso-ver-ruta'))

    expect(casilla).toBeChecked()
    await waitFor(() => expect(FIT_BOUNDS_MOCK).toHaveBeenCalledTimes(1))
  })

  it('"Ver recorrido" en pantalla angosta cierra la ficha y conserva la selección', async () => {
    viewport(500, 900)
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })
    await seleccionarPorBuscador('Escuela 1')

    const casilla = screen.getByRole('checkbox', { name: /camino y cruces de agua/i })
    await userEvent.click(casilla)
    FIT_BOUNDS_MOCK.mockClear()

    await userEvent.click(screen.getByTestId('ficha-acceso-ver-ruta'))

    // La hoja inferior tapaba la ruta entera, así que se cierra… pero la
    // selección vive: el grupo flotante devuelve la ficha.
    expect(screen.queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()
    expect(screen.getByTestId('reabrir-ficha')).toBeInTheDocument()
    expect(casilla).toBeChecked()
    await waitFor(() => expect(FIT_BOUNDS_MOCK).toHaveBeenCalledTimes(1))
  })

  it('"Quitar selección" limpia el aviso de la escuela sin ubicación', async () => {
    const ESCUELA_SIN_UBICACION: EscuelaMapaPadron = {
      cueAnexo: '1801605-77',
      nombre: 'Escuela del interior',
      departamento: 'Empedrado',
      localidad: 'Empedrado',
      lat: null,
      lon: null,
      estado: 'sin_afectacion_reportada',
      niveles: ['Primario'],
      alumnos: 0,
      gravedad: 0,
      categoriaPrincipal: null,
      clases: 'normal',
      apoyo: null,
      sinActualizar: false,
      ultimaNovedad: null,
      alumnosSinClases: 0,
    }
    // Se usa un array nuevo para no alterar el fixture compartido con otros tests.
    const padronOriginal = FIXTURE_ESCUELAS_MAPA.escuelas
    FIXTURE_ESCUELAS_MAPA.escuelas = [...padronOriginal, ESCUELA_SIN_UBICACION]

    try {
      await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

      await seleccionarPorBuscador('Escuela del interior')

      // Antes el handler salía en silencio: ficha nenhuma, explicación
      // ninguna. Ahora se explica por qué no se puede señalar.
      const aviso = await screen.findByTestId('aviso-busqueda-sin-ubicacion')
      expect(aviso).toHaveTextContent('La escuela "Escuela del interior" no tiene ubicación cargada')
      expect(aviso).toHaveTextContent('se muestra la ficha, pero no se puede señalar en el mapa')
      expect(await screen.findByTestId('mock-ficha-escuela')).toHaveAttribute(
        'data-cue',
        ESCUELA_SIN_UBICACION.cueAnexo,
      )
      // Sin punto al que volar: no hay flyTo que finja una señalización.
      expect(FLY_TO_MOCK).not.toHaveBeenCalled()

      // Con una escuela ubicada el aviso desaparece: no queda pegado.
      await seleccionarPorBuscador('Escuela 1')
      expect(screen.queryByTestId('aviso-busqueda-sin-ubicacion')).not.toBeInTheDocument()

      // Y con la ficha cerrada, "Quitar selección" también lo limpia.
      await userEvent.click(screen.getByRole('button', { name: 'Volver a la lista' }))
      await userEvent.click(await screen.findByTestId('quitar-seleccion'))
      expect(screen.queryByTestId('aviso-busqueda-sin-ubicacion')).not.toBeInTheDocument()
    } finally {
      FIXTURE_ESCUELAS_MAPA.escuelas = padronOriginal
    }
  })
})

describe('Task 4: cambiar de pestaña a Radar', () => {
  it('con una ficha abierta, pasar a Radar muestra su panel y oculta la ficha de Situación actual', async () => {
    const { rerender } = await renderMapa({
      mostrarEnlaceNominal: true,
      riskRadarEnabled: true,
      pestana: 'actual',
    })
    await seleccionarPorBuscador('Escuela 1')

    rerender({ pestana: 'radar' })

    const panel = screen.getByTestId('panel-lateral')
    expect(panel).not.toBeEmptyDOMElement()
    expect(within(panel).getByTestId('panel-radar')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()
  })

  it('mantiene el mismo mapa montado al cambiar a Radar', async () => {
    const { rerender } = await renderMapa({
      mostrarEnlaceNominal: true,
      riskRadarEnabled: true,
      pestana: 'actual',
    })
    const mapa = screen.getByTestId('mock-maplibre')

    rerender({ pestana: 'radar' })

    expect(screen.getByTestId('mock-maplibre')).toBe(mapa)
  })

  it('al volver a Situación actual conserva la selección y permite reabrir la ficha', async () => {
    const { rerender } = await renderMapa({
      mostrarEnlaceNominal: true,
      riskRadarEnabled: true,
      pestana: 'actual',
    })
    await seleccionarPorBuscador('Escuela 1')
    await cerrarFicha()

    rerender({ pestana: 'radar' })
    expect(within(screen.getByTestId('panel-lateral')).getByTestId('panel-radar')).toBeInTheDocument()

    rerender({ pestana: 'actual' })

    const panel = screen.getByTestId('panel-lateral')
    expect(panel).not.toBeEmptyDOMElement()
    expect(within(panel).queryByTestId('panel-radar')).not.toBeInTheDocument()
    expect(screen.getByTestId('reabrir-ficha')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('reabrir-ficha'))
    expect(await screen.findByTestId('mock-ficha-escuela')).toHaveAttribute('data-cue', CUE)
  })
})

// Q3: los íconos de las capas territoriales (aislamiento, inundación y cruces
// de agua) se dibujan ENCIMA del polígono del departamento y no estaban en
// `capasInteractivas`: el click caía en el departamento y terminaba
// filtrando la provincia entera en vez de abrir la escuela del ícono.
describe('Q3: los íconos territoriales no caen en el departamento', () => {
  it('clickear el ícono de aislamiento abre esa escuela y no filtra el departamento', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Dificultad para llegar por camino (0 a 3)' }),
    )

    await userEvent.click(screen.getByTestId('mock-click-aislamiento'))

    expect(await screen.findByTestId('mock-ficha-escuela')).toHaveAttribute('data-cue', CUE)
    expect(screen.queryByText('Departamento:')).not.toBeInTheDocument()
    expect(screen.queryByText('Quitar filtro')).not.toBeInTheDocument()
    expect(screen.queryByText(esParrafoPopupDepartamento)).not.toBeInTheDocument()
  })

  it('no ofrece el toggle ni la capa de agua estimada', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })
    expect(screen.queryByRole('checkbox', { name: /Agua estimada por crecida de río/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('mock-layer-infra-inundacion-symbol')).not.toBeInTheDocument()
  })

  it('clickear un cruce de agua muestra su popup con el matiz del "sin puente"', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    await userEvent.click(screen.getByTestId('mock-click-cruce'))

    expect(await screen.findByText(/Cruce de agua: Sin puente registrado/)).toBeInTheDocument()
    // "Sin puente registrado" NO afirma que falte el puente: sólo que OSM no
    // tiene el tag. El popup lo dice, o el director se lleva una conclusión
    // equivocada.
    expect(screen.getByText(/No hay puente cargado en el mapa en este cruce/)).toBeInTheDocument()
    expect(screen.getByText(/puede existir sin estar cargado/)).toBeInTheDocument()
    // Un cruce es un dato, no una selección: no abre ficha ni filtra.
    expect(screen.queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()
    expect(screen.queryByText('Departamento:')).not.toBeInTheDocument()
    expect(screen.queryByText(esParrafoPopupDepartamento)).not.toBeInTheDocument()

    // Cualquier otro clic lo cierra (mismo criterio que el popup de
    // departamento).
    await userEvent.click(screen.getByTestId('mock-click-parte'))
    await waitFor(() => expect(screen.queryByText(/Cruce de agua: Sin puente registrado/)).not.toBeInTheDocument())
  })
})

// Task 13c: la ficha comparte la columna izquierda, así que el encuadre de la
// ruta reserva siempre la misma zona del mapa, con ficha abierta o cerrada.
describe('paddingEncuadre', () => {
  async function paddingEncuadre() {
    const mod = await import('./map-infraestructura-page')
    return mod.paddingEncuadre
  }

  it('reserva la columna izquierda y conserva el padding con la ficha abierta', async () => {
    viewport(1440, 900)
    const calcular = await paddingEncuadre()

    expect(calcular()).toEqual({ top: 60, bottom: 60, left: 400, right: 356 })
  })

  it('no agrega una hoja inferior en pantallas de 721 a 1080px', async () => {
    viewport(1024, 768)
    const calcular = await paddingEncuadre()

    expect(calcular()).toEqual({ top: 60, bottom: 60, left: 400, right: 356 })
  })

  it('hasta 720px no reserva la columna izquierda', async () => {
    viewport(500, 800)
    const calcular = await paddingEncuadre()

    expect(calcular()).toEqual({ top: 60, bottom: 60, left: 60, right: 60 })
  })

  it('recorta en proporción cuando el padding excede el ancho máximo', async () => {
    viewport(800, 900)
    const calcular = await paddingEncuadre()

    const padding = calcular()
    const { left = 0, right = 0 } = padding
    expect(left + right).toBe(640)
    expect(padding).toEqual({ top: 60, bottom: 60, left: 339, right: 301 })
  })

  it('recorta en proporción cuando el padding excede el alto máximo', async () => {
    viewport(1024, 100)
    const calcular = await paddingEncuadre()

    const padding = calcular()
    const { top = 0, bottom = 0 } = padding
    expect(top + bottom).toBe(80)
    expect(padding).toEqual({ top: 40, bottom: 40, left: 400, right: 356 })
  })
})
