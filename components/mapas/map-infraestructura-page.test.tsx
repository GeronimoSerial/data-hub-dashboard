// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type JSX, type ReactNode } from 'react'
import { colorRiesgo } from '@/lib/infraestructura/mapa/radar'
import { colorNivelPlan } from '@/lib/infraestructura/mapa/planificacion'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import type { EscuelaMapaPadron, EscuelasMapaPadronResultado, ParteMapa } from '@/lib/infraestructura/parte-mapa'
import type { PestanaMapa } from '@/lib/infraestructura/mapa/tipos'
import { CLAVE_CAPAS_VISIBLES } from '@/lib/infraestructura/mapa/capas'
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
const { FLY_TO_MOCK, FIT_BOUNDS_MOCK, MAP_CONTAINER_MOCK } = vi.hoisted(() => ({
  FLY_TO_MOCK: vi.fn(),
  FIT_BOUNDS_MOCK: vi.fn(),
  MAP_CONTAINER_MOCK: { container: null as HTMLElement | null, getContainer: vi.fn() },
}))

// T5a: cues que el doble del mapa devuelve como DESAGRUPADAS en
// `querySourceFeatures`. Lista mutable para que un test puntual pueda sumar
// escuelas sin depender de los globales; `beforeEach` la deja en su valor por
// defecto (las dos escuelas del padrón de abajo).
const CUES_DESAGRUPADOS_MOCK = vi.hoisted(() => ({ cues: [] as string[] }))
const MAPA_ESTILO_MOCK = vi.hoisted(() => ({
  mapStyle: '' as string,
  onStyleData: null as (() => void) | null,
  montajesFuente: 0,
  estiloCargado: true,
  fuentes: new Set<string>(),
  capas: new Set<string>(),
  visibilidadCapas: new Map<string, string | undefined>(),
  onStyleLoad: null as (() => void) | null,
  styleDiffing: undefined as boolean | undefined,
}))
const HAS_IMAGE_MOCK = vi.hoisted(() => vi.fn(() => true))

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
// Los componentes antiguos de acceso se dejan mockeados para comprobar que la
// página ya no los monta en la ficha del mapa.
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
      situacionesHistoricas: 0, solucionadasRecientes: 0,
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
      situacionesHistoricas: 0, solucionadasRecientes: 0,
    },
  ],
  sinUbicacion: [],
  totalPadron: 2,
}

vi.mock('@/lib/infraestructura/use-escuelas-mapa', () => ({
  useEscuelasMapa: () => ({ data: FIXTURE_ESCUELAS_MAPA, loading: false, error: null }),
}))

vi.mock('@/components/infraestructura/borradores/use-draft-counts', () => ({
  useDraftCounts: () => ({ counts: new Map([[CUE, 2]]), loading: false, error: false }),
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
const llamadasRadar = vi.hoisted(() => ({ activos: [] as boolean[], filtros: [] as unknown[] }))
const estadoRadar = vi.hoisted(() => ({ sinPronostico: false }))
const estadoRadarMeteo = vi.hoisted(() => ({ sinDatos: false, conResumen: false }))

vi.mock('@/lib/infraestructura/radar-meteo/use-resumen-radar-meteo', () => ({
  useResumenRadarMeteo: () => ({
    resumen: estadoRadarMeteo.conResumen
      ? {
          runId: 'run-test',
          runAt: '2026-10-06T12:00:00Z',
          sinDatos: false,
          frescura: null,
          dias: ['2026-10-06'],
          departamentos: [
            {
              id: '18133',
              nombre: 'San Cosme',
              dias: [{ fecha: '2026-10-06', lluvia24h: 24, lluviaLocalMax: 24, rafagaMaxKmh: null, picoHora: null, tormenta: false, granizoMax: null, cobertura: 100, resaltado: { lluvia: null, rafaga: null }, ensamble: null }],
              proximas48h: [],
            },
            {
              id: '18001',
              nombre: 'Bella Vista',
              dias: [{ fecha: '2026-10-06', lluvia24h: 10, lluviaLocalMax: 10, rafagaMaxKmh: null, picoHora: null, tormenta: false, granizoMax: null, cobertura: 100, resaltado: { lluvia: null, rafaga: null }, ensamble: null }],
              proximas48h: [],
            },
          ],
          alertasSmn: [],
        }
      : estadoRadarMeteo.sinDatos ? { runId: null, runAt: null, sinDatos: true, frescura: null, dias: [], departamentos: [], alertasSmn: [] } : null,
    error: false,
  }),
}))

vi.mock('@/lib/infraestructura/radar-meteo/use-radar-meteo', () => ({
  useRadarMeteo: () => ({
    data: estadoRadarMeteo.sinDatos ? { sinDatos: true, razon: 'Todavía no se cargó ningún pronóstico.' } : null,
    loading: false,
    error: null,
  }),
}))

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
      nivelRiesgo: 'moderado',
      confianza: 'media',
      nivelRiesgoAcceso: 'alto',
    },
    {
      cueAnexo: CUE,
      horizonteHoras: 72,
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
  useRadar: (filtros: unknown, activo: boolean) => {
    llamadasRadar.activos.push(activo)
    llamadasRadar.filtros.push(filtros)
    return activo
      ? {
          data: estadoRadar.sinPronostico
            ? {
                ...RADAR_DATA,
                corte: null,
                departamentos: [24, 72, 240].map((horizonteHoras) => ({ departamento: 'CAPITAL', peorNivel: 'sin_dato', horizonteHoras, celdas: 0 })),
                puntos: [],
                escuelas: { ...RADAR_DATA.escuelas, items: [], total: 0, totalPages: 0 },
              }
            : RADAR_DATA,
          loading: false,
          error: null,
        }
      : { data: null, loading: false, error: null }
  },
}))

// react-map-gl/maplibre necesita WebGL, que no existe en jsdom: se reemplaza
// por un doble mínimo que expone un botón para simular el click sobre el
// punto del parte (equivalente a queryRenderedFeatures + interactiveLayerIds
// del componente real) y deja pasar el resto de los hijos sin más.
vi.mock('react-map-gl/maplibre', () => {
  type FeatureMock = {
    layer?: { id: string }
    properties: Record<string, unknown>
    geometry?: { type: 'Point'; coordinates: [number, number] }
  }
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
      onMouseMove?: (event: MouseEventMock) => void
      onLoad?: () => void
      mapStyle?: string
      styleDiffing?: boolean
      onStyleData?: () => void
    }
  >(function MapGL(props, ref) {
    MAPA_ESTILO_MOCK.mapStyle = props.mapStyle ?? ''
    MAPA_ESTILO_MOCK.styleDiffing = props.styleDiffing
    MAPA_ESTILO_MOCK.onStyleData = props.onStyleData ?? null
    useImperativeHandle(
      ref,
      () => ({
        getMap: () => ({
          flyTo: FLY_TO_MOCK,
          fitBounds: FIT_BOUNDS_MOCK,
          resize: vi.fn(),
          stop: vi.fn(),
          getContainer: MAP_CONTAINER_MOCK.getContainer,
          isStyleLoaded: () => MAPA_ESTILO_MOCK.estiloCargado,
          on: (evento: string, handler: () => void) => {
            if (evento === 'style.load') MAPA_ESTILO_MOCK.onStyleLoad = handler
          },
          off: vi.fn(),
          hasImage: HAS_IMAGE_MOCK,
          addImage: vi.fn(),
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
    const estiloAnterior = useRef(props.mapStyle)
    const cambioEstilo = useRef(false)
    if (estiloAnterior.current !== props.mapStyle) {
      estiloAnterior.current = props.mapStyle ?? ''
      cambioEstilo.current = true
    }
    useEffect(() => {
      if (!cambioEstilo.current) return
      cambioEstilo.current = false
      // MapLibre aplica setStyle después de confirmar el render de React.
      // Un styledata tardío del estilo anterior puede llegar antes de setStyle.
      MAPA_ESTILO_MOCK.estiloCargado = true
      props.onStyleData?.()
      // Descarta todo lo registrado y emite styledata antes de estar listo.
      MAPA_ESTILO_MOCK.fuentes.clear()
      MAPA_ESTILO_MOCK.capas.clear()
      MAPA_ESTILO_MOCK.visibilidadCapas.clear()
      MAPA_ESTILO_MOCK.estiloCargado = false
      // El primer styledata llega antes de isStyleLoaded y no debe contarse
      // como fin de carga.
      props.onStyleData?.()
    }, [props.mapStyle, props.onStyleData])
    const feature = (layerId: string, properties: Record<string, unknown>): FeatureMock => ({
      layer: { id: layerId },
      properties,
    })
    const clickCases: Array<
      [string, FeatureMock | FeatureMock[], MouseEventMock['lngLat']?]
    > = [
      ['mock-click-parte', feature('infra-partes', { cueAnexo: CUE })],
      ['mock-click-parte-sin-afectacion', feature('infra-partes', { cueAnexo: CUE_SIN_AFECTACION })],
      ['mock-click-cluster', {
        ...feature('infra-partes-cluster', {
          cluster_id: 1,
          point_count: 8,
          escuelasAfectadas: 3,
          criticas: 1,
          altas: 2,
        }),
        geometry: { type: 'Point', coordinates: [-58.8, -27.5] },
      }],
      // El click real ahora acierta el ícono de escuela (capa `symbol`),
      // no el círculo chico de abajo: la feature que MapLibre entrega
      // pertenece a `infra-partes-escuela-icono`.
      ['mock-click-escuela-icono', feature('infra-partes-escuela-icono', { cueAnexo: CUE_SIN_AFECTACION })],
      ['mock-click-punto-nivel', feature('infra-puntos-nivel', { cueAnexo: CUE })],
      ['mock-click-riesgo-hoy', feature('infra-riesgo-hoy', { cueAnexo: CUE })],
      ['mock-click-vacio-radar', [], { lng: -58.82, lat: -27.48 }],
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
      <div data-testid="mock-maplibre" data-map-style={props.mapStyle} data-style-diffing={String(props.styleDiffing)}>
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
        <button
          data-testid="mock-move-vacio-radar"
          onMouseMove={() => props.onMouseMove?.({ features: [], lngLat: { lng: -58.82, lat: -27.48 } })}
        />
        {props.children}
      </div>
    )
  })
  return {
    __esModule: true,
    default: MapGL,
    // Situation layers subscribe to layer events through useMap(); the double has no map instance.
    useMap: () => ({ current: undefined }),
    Layer: (props: { id?: string; beforeId?: string; filter?: unknown; paint?: unknown; layout?: { visibility?: string } }) => {
      useEffect(() => {
        const id = props.id
        if (!id) return
        if (props.beforeId && !MAPA_ESTILO_MOCK.capas.has(props.beforeId)) {
          throw new Error(`Cannot add layer "${id}" before non-existing layer "${props.beforeId}".`)
        }
        MAPA_ESTILO_MOCK.capas.add(id)
        MAPA_ESTILO_MOCK.visibilidadCapas.set(id, props.layout?.visibility)
        return () => {
          MAPA_ESTILO_MOCK.capas.delete(id)
          MAPA_ESTILO_MOCK.visibilidadCapas.delete(id)
        }
      }, [props.id, props.beforeId, props.layout?.visibility])
      return (
        <div
          data-testid={`mock-layer-${props.id ?? 'sin-id'}`}
          data-filter={JSON.stringify(props.filter)}
          data-paint={JSON.stringify(props.paint)}
          data-layout-visibility={props.layout?.visibility}
        />
      )
    },
    Marker: (props: { children?: React.ReactNode }) => <>{props.children ?? null}</>,
    NavigationControl: () => null,
    AttributionControl: () => null,
    Popup: (props: { children?: React.ReactNode }) => <>{props.children ?? null}</>,
    // `data` no se renderiza en el DOM real (MapLibre lo consume vía WebGL),
    // pero se expone acá como atributo serializado: es la única forma de
    // inspeccionar, desde un test de integración, qué features terminan en
    // el GeoJSON de cada fuente sin depender del click handler.
    Source: (props: { id?: string; data?: unknown; children?: React.ReactNode }) => {
      const [mountId] = useState(() => ++MAPA_ESTILO_MOCK.montajesFuente)
      useEffect(() => {
        const id = props.id
        if (!id) return
        MAPA_ESTILO_MOCK.fuentes.add(id)
        return () => { MAPA_ESTILO_MOCK.fuentes.delete(id) }
      }, [props.id])
      return (
        <div data-testid={`mock-source-${props.id ?? 'sin-id'}`} data-mount-id={mountId} data-geojson={JSON.stringify(props.data)}>
          {props.children ?? null}
        </div>
      )
    },
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
  panel?: Exclude<PestanaMapa, 'estadisticas' | 'metodologia'>
  visible?: boolean
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

async function completarCargaEstilo() {
  await act(async () => {
    MAPA_ESTILO_MOCK.estiloCargado = true
    MAPA_ESTILO_MOCK.onStyleData?.()
    if (MAPA_ESTILO_MOCK.styleDiffing === false) MAPA_ESTILO_MOCK.onStyleLoad?.()
  })
}

function esperarCapasBase(requierePartes: boolean) {
  const fuentes = [
    'infra-mascara-src',
    'infra-departamentos-src',
    'infra-partes-src',
  ]
  const capas = [
    'infra-mascara-provincia',
    'infra-departamentos-relleno',
    'infra-departamentos-borde',
    'infra-departamentos-etiqueta',
    'infra-partes',
    'infra-partes-escuela-icono',
  ]
  for (const id of fuentes) expect(MAPA_ESTILO_MOCK.fuentes.has(id), `fuente ${id}`).toBe(true)
  for (const id of capas) expect(MAPA_ESTILO_MOCK.capas.has(id), `capa ${id}`).toBe(true)
  expect(MAPA_ESTILO_MOCK.visibilidadCapas.get('infra-partes')).toBe(requierePartes ? 'visible' : 'none')
  expect(MAPA_ESTILO_MOCK.visibilidadCapas.get('infra-partes-escuela-icono')).toBe(requierePartes ? 'visible' : 'none')
}

describe('MapInfraestructuraPage — filtros de padrón', () => {
  it('muestra la hora de actualización en Situación actual', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T15:00:00.000Z'))
    const escuelasMapa: EscuelasMapaPadronResultado = {
      ...FIXTURE_ESCUELAS_MAPA,
      escuelas: FIXTURE_ESCUELAS_MAPA.escuelas.map((escuela) => ({
        ...escuela,
        ultimaNovedad: escuela.cueAnexo === CUE ? '2026-10-05T14:30:00.000Z' : escuela.ultimaNovedad,
      })),
    }
    await renderMapa({ mostrarEnlaceNominal: true, escuelasMapa })

    await waitFor(() => {
      expect(within(screen.getByTestId('panel-lateral')).getByText('Hoy 11:30')).toBeInTheDocument()
    })
  })

  it('muestra la leyenda nueva en Situación actual y quita Referencias', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, pestana: 'actual' })

    const leyenda = screen.getByRole('complementary', { name: 'Referencias del mapa' })
    expect(leyenda).toBeInTheDocument()
    expect(within(screen.getByTestId('panel-lateral')).queryByRole('complementary', { name: 'Referencias del mapa' })).toBeNull()
    expect(within(leyenda).getByText('Crítica')).toBeInTheDocument()
    // Symbols live in a collapsed section of the single legend panel.
    const seccionSimbolos = within(leyenda).getByText('Símbolos').closest('details')
    expect(seccionSimbolos).not.toBeNull()
    expect(seccionSimbolos).not.toHaveAttribute('open')
    await userEvent.click(within(leyenda).getByText('Símbolos'))
    expect(seccionSimbolos).toHaveAttribute('open')
    expect(within(leyenda).getByText('Sin actualizar')).toBeInTheDocument()
    expect(screen.queryByText('Referencias')).not.toBeInTheDocument()
  })

  it('muestra el vacío cuando el padrón filtrado no tiene reportes', async () => {
    await renderMapa({
      mostrarEnlaceNominal: true,
      escuelasMapa: {
        ...FIXTURE_ESCUELAS_MAPA,
        escuelas: FIXTURE_ESCUELAS_MAPA.escuelas.filter((escuela) => escuela.cueAnexo === CUE_SIN_AFECTACION),
      },
    })
    expect(screen.getByText('Ninguna escuela con situaciones abiertas para estos filtros.')).toBeInTheDocument()
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

beforeEach(() => {
  MAPA_ESTILO_MOCK.mapStyle = ''
  MAPA_ESTILO_MOCK.onStyleData = null
  MAPA_ESTILO_MOCK.onStyleLoad = null
  MAPA_ESTILO_MOCK.montajesFuente = 0
  MAPA_ESTILO_MOCK.estiloCargado = true
  MAPA_ESTILO_MOCK.fuentes.clear()
  MAPA_ESTILO_MOCK.capas.clear()
  MAPA_ESTILO_MOCK.visibilidadCapas.clear()
  HAS_IMAGE_MOCK.mockClear()
  vi.restoreAllMocks()
  MAP_CONTAINER_MOCK.container = document.createElement('div')
  MAP_CONTAINER_MOCK.container.innerHTML = '<details class="maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show" open></details>'
  MAP_CONTAINER_MOCK.getContainer.mockReset().mockImplementation(() => MAP_CONTAINER_MOCK.container)
  // Los spies del doble del mapa son `vi.fn()` de módulo: se limpian a mano
  // para que el conteo de encuadres (`toHaveBeenCalledTimes`) sea el de este
  // test y no la suma de los anteriores.
  FLY_TO_MOCK.mockClear()
  FIT_BOUNDS_MOCK.mockClear()
  estadoGeometria.disponible = true
  estadoGeometria.cueForzado = null
  llamadasRadar.activos.length = 0
  llamadasRadar.filtros.length = 0
  estadoRadar.sinPronostico = false
  estadoRadarMeteo.sinDatos = false
  estadoRadarMeteo.conResumen = false
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

describe('MapInfraestructuraPage — atribución compacta', () => {
  it('colapsa la atribución al cambiar de Situación actual a Radar y Planificación', async () => {
    const vista = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'actual' })
    const atribucion = MAP_CONTAINER_MOCK.container?.querySelector('.maplibregl-ctrl-attrib')

    expect(atribucion).not.toHaveAttribute('open')
    expect(atribucion).not.toHaveClass('maplibregl-compact-show')

    atribucion?.setAttribute('open', '')
    atribucion?.classList.add('maplibregl-compact-show')
    vista.rerender({ pestana: 'radar' })
    expect(atribucion).not.toHaveAttribute('open')
    expect(atribucion).not.toHaveClass('maplibregl-compact-show')

    atribucion?.setAttribute('open', '')
    atribucion?.classList.add('maplibregl-compact-show')
    vista.rerender({ pestana: 'planificacion' })
    expect(atribucion).not.toHaveAttribute('open')
    expect(atribucion).not.toHaveClass('maplibregl-compact-show')
    expect(MAP_CONTAINER_MOCK.getContainer).toHaveBeenCalled()
  })
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
      const panel = within(screen.getByTestId('panel-lateral'))
      expect(panel.getByRole('region', { name: 'Departamento seleccionado' })).toHaveTextContent('Departamento: Capital')
      expect(panel.getByRole('region', { name: 'Departamento seleccionado' })).toHaveTextContent('10 escuelas · 3 con situaciones abiertas · 30%')
      expect(screen.queryByText(/En Capital hay 10 escuelas/)).not.toBeInTheDocument()
      await userEvent.click(screen.getByText('Quitar filtro'))
      expect(screen.queryByRole('region', { name: 'Departamento seleccionado' })).not.toBeInTheDocument()
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
    expect(within(screen.getByTestId('ficha-flotante')).getByRole('button', { name: 'Volver a la lista' })).toBeInTheDocument()
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
    expect(screen.queryByText(/En Capital hay 10 escuelas/)).not.toBeInTheDocument()
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

  it('cerrar cualquiera de los tres modales no modifica los filtros del mapa', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })
    const filtroPuntos = screen.getByTestId('mock-layer-infra-partes').getAttribute('data-filter')
    const filtroClusters = screen.getByTestId('mock-layer-infra-partes-cluster').getAttribute('data-filter')

    await userEvent.click(screen.getByTestId('mock-click-parte'))
    await userEvent.click(await screen.findByText('abrir-nominal-desde-ficha'))
    await userEvent.click(await screen.findByRole('button', { name: 'Ver historial' }))

    await userEvent.click(screen.getByText('cerrar-nominal'))
    await waitFor(() => expect(screen.queryByTestId('mock-nominal-modal')).not.toBeInTheDocument())

    await userEvent.click(screen.getByText('cerrar-historial'))
    await waitFor(() => expect(screen.queryByTestId('mock-historial-modal')).not.toBeInTheDocument())

    await cerrarFicha()

    expect(screen.getByTestId('mock-layer-infra-partes')).toHaveAttribute('data-filter', filtroPuntos)
    expect(screen.getByTestId('mock-layer-infra-partes-cluster')).toHaveAttribute('data-filter', filtroClusters)
  })
})

describe('MapInfraestructuraPage — modo Radar', () => {
  it('centra el mapa al elegir un departamento del pronóstico y limpia al repetir el clic', async () => {
    estadoRadarMeteo.sinDatos = true
    estadoRadarMeteo.conResumen = true
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { id: '18133', nombre: 'San Cosme', centroide: { lon: -58.5, lat: -27.3 } },
            geometry: { type: 'Polygon', coordinates: [[[-58.6, -27.4], [-58.4, -27.4], [-58.4, -27.2], [-58.6, -27.4]]] },
          },
          {
            type: 'Feature',
            properties: { id: '18001', nombre: 'Bella Vista', centroide: { lon: -59.0, lat: -28.5 } },
            geometry: { type: 'Polygon', coordinates: [[[-59.1, -28.6], [-58.9, -28.6], [-58.9, -28.4], [-59.1, -28.6]]] },
          },
        ],
      }),
    }))
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    const fila = await screen.findByRole('button', { name: /San Cosme/ })
    await userEvent.click(fila)
    expect(FLY_TO_MOCK).toHaveBeenCalledTimes(1)
    expect(FLY_TO_MOCK).toHaveBeenCalledWith({ center: [-58.5, -27.3], zoom: 8, duration: 800 })

    await userEvent.click(fila)
    expect(FLY_TO_MOCK).toHaveBeenCalledTimes(1)
    expect(fila).toHaveAttribute('aria-pressed', 'false')
  })

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
    expect(screen.getByText('Riesgo actual (hoy) · 72 h')).toBeInTheDocument()
  })

  it('con Radar activo muestra el panel de riesgo y consulta el horizonte inicial', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    const panelLateral = await screen.findByTestId('panel-lateral')
    expect(within(panelLateral).getByRole('heading', { name: 'Radar' })).toBeInTheDocument()
    expect(within(panelLateral).getByRole('group', { name: 'Horizonte' })).toBeInTheDocument()
    expect(llamadasRadar.activos.at(-1)).toBe(true)
    expect(llamadasRadar.filtros.at(-1)).toEqual({ horizonte: 72 })
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

  it('con Radar activo consulta el radar de riesgo y muestra los controles meteorológicos', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    expect(llamadasRadar.activos.at(-1)).toBe(true)
    expect(screen.getAllByRole('group', { name: 'Variable meteorológica' })).toHaveLength(1)
    expect(screen.queryByText('Consultando alertas…')).not.toBeInTheDocument()
    const variables = screen.getByRole('group', { name: 'Variable meteorológica' })
    expect(within(variables).getByRole('button', { name: 'Lluvia' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(variables).getByRole('button', { name: 'Viento' }))
    expect(within(variables).getByRole('button', { name: 'Viento' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(variables).getByRole('button', { name: 'Lluvia' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Expandir leyenda: Viento' })).toBeInTheDocument()
    expect(document.querySelector('.radar-meteo-controls')).toBeNull()
    expect(screen.queryByText(/Estimación no calibrada/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/lluvia observada|fuente:|ECMWF|IMERG|ensamble|metodología/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('radar-kpi-riesgo-alto')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Pronóstico por departamento' })).not.toBeInTheDocument()
    expect(screen.queryByText('Pronóstico por departamento')).not.toBeInTheDocument()
  })

  it('dibuja con color las escuelas con riesgo moderado o más, el resto como punto tenue (peso 0), y sólo monta la capa en Radar', async () => {
    const vista = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    const fuente = screen.getByTestId('mock-source-infra-puntos-nivel-src')
    const geojson = JSON.parse(fuente.getAttribute('data-geojson') ?? '{}')
    const colores = new Map(geojson.features.map((feature: { properties: { cueAnexo: string; color: string; conDato: boolean; peso: number } }) => [
      feature.properties.cueAnexo,
      [feature.properties.color, feature.properties.conDato, feature.properties.peso],
    ]))
    expect(colores.get(CUE)).toEqual([colorRiesgo('alto'), true, 2])
    expect((colores.get(CUE_SIN_AFECTACION) as unknown[] | undefined)?.[2]).toBe(0)
    expect(screen.getByTestId('mock-layer-infra-puntos-nivel')).toBeInTheDocument()

    vista.rerender({ pestana: 'actual' })
    expect(screen.queryByTestId('mock-source-infra-puntos-nivel-src')).not.toBeInTheDocument()
  })

  it('cambia el color del punto al cambiar el horizonte y el click abre la ficha', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })
    const clicksMeteorologicos: Array<{ lat: number; lng: number }> = []
    const escucharClickMeteorologico = (event: Event) => {
      clicksMeteorologicos.push((event as CustomEvent<{ lat: number; lng: number }>).detail)
    }
    window.addEventListener('radar-meteo-map-click', escucharClickMeteorologico)
    const leerColor = () => {
      const fuente = screen.getByTestId('mock-source-infra-puntos-nivel-src')
      const geojson = JSON.parse(fuente.getAttribute('data-geojson') ?? '{}')
      return geojson.features.find((feature: { properties: { cueAnexo: string } }) => feature.properties.cueAnexo === CUE)?.properties.color
    }
    expect(leerColor()).toBe(colorRiesgo('alto'))
    await userEvent.click(screen.getByRole('button', { name: '24 h' }))
    await waitFor(() => expect(leerColor()).toBe(colorRiesgo('moderado')))

    await userEvent.click(screen.getByTestId('mock-click-punto-nivel'))
    expect(screen.getByTestId('mock-ficha-escuela')).toHaveAttribute('data-cue', CUE)
    expect(clicksMeteorologicos).toEqual([])

    await userEvent.hover(screen.getByTestId('mock-move-vacio-radar'))
    expect(clicksMeteorologicos).toEqual([])

    await userEvent.click(screen.getByTestId('mock-click-vacio-radar'))
    expect(clicksMeteorologicos).toEqual([{ lat: -27.48, lng: -58.82 }])
    window.removeEventListener('radar-meteo-map-click', escucharClickMeteorologico)
  })

  it('fuera de Radar, la capa Escuelas en riesgo hoy encendida dibuja sólo moderado o más y el clic abre la ficha', async () => {
    window.localStorage.setItem(CLAVE_CAPAS_VISIBLES, JSON.stringify({ escuelasEnRiesgo: true }))
    try {
      const vista = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'actual' })

      const fuente = await screen.findByTestId('mock-source-infra-riesgo-hoy-src')
      const geojson = JSON.parse(fuente.getAttribute('data-geojson') ?? '{}')
      const pesos = new Map(geojson.features.map((f: { properties: { cueAnexo: string; peso: number; color: string } }) => [f.properties.cueAnexo, [f.properties.peso, f.properties.color]]))
      expect(pesos.get(CUE)).toEqual([2, colorRiesgo('alto')])
      expect(pesos.has(CUE_SIN_AFECTACION)).toBe(false)
      expect(llamadasRadar.activos).toContain(true)

      await userEvent.click(screen.getByTestId('mock-click-riesgo-hoy'))
      expect(screen.getByTestId('mock-ficha-escuela')).toHaveAttribute('data-cue', CUE)

      // In Radar the main risk layer already draws it: the extra layer is not mounted.
      vista.rerender({ pestana: 'radar' })
      expect(screen.queryByTestId('mock-source-infra-riesgo-hoy-src')).not.toBeInTheDocument()
    } finally {
      window.localStorage.removeItem(CLAVE_CAPAS_VISIBLES)
    }
  })

  it('fuera de Radar, con la capa apagada no consulta el radar ni monta Escuelas en riesgo hoy', async () => {
    llamadasRadar.activos.length = 0
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'actual' })
    expect(screen.queryByTestId('mock-source-infra-riesgo-hoy-src')).not.toBeInTheDocument()
    expect(llamadasRadar.activos).not.toContain(true)
  })

  it('al cambiar el horizonte vuelve a consultar el radar con el valor elegido', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    await userEvent.click(screen.getByRole('button', { name: '24 h' }))
    await waitFor(() => expect(llamadasRadar.filtros.at(-1)).toEqual({ horizonte: 24 }))
  })

  it('al elegir una escuela en riesgo abre su ficha en la ficha flotante y el panel lateral conserva Radar', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    await userEvent.click(screen.getByRole('button', { name: /Escuela 1, Capital/i }))
    const flotante = screen.getByTestId('ficha-flotante')
    expect(within(flotante).getByTestId('mock-ficha-escuela')).toHaveAttribute('data-cue', CUE)
    expect(within(screen.getByTestId('panel-lateral')).queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('panel-lateral')).getByTestId('panel-radar')).toBeInTheDocument()
  })

  it('sin horizontes del motor mantiene la carga del pronóstico meteorológico', async () => {
    estadoRadar.sinPronostico = true
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    expect(screen.getByText('Cargando pronóstico…')).toBeInTheDocument()
    const grupo = screen.getByRole('group', { name: 'Horizonte' })
    for (const nombre of ['24 h', '72 h', '10 días']) {
      expect(within(grupo).getByRole('button', { name: nombre })).toHaveAttribute('aria-disabled', 'false')
    }
  })

  it('sin datos de meteorología deja un solo mensaje vacío en el panel lateral', async () => {
    estadoRadar.sinPronostico = true
    estadoRadarMeteo.sinDatos = true
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    const panel = screen.getByTestId('panel-lateral')
    expect(within(panel).getByText('Todavía no hay un pronóstico disponible. Vuelva a consultar más tarde.')).toBeInTheDocument()
    expect(screen.getAllByText(/pronóstico disponible/i)).toHaveLength(1)
  })

  it('al volver a Situación actual deja el hook inactivo otra vez', async () => {
    const { rerender } = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })
    expect(llamadasRadar.activos.at(-1)).toBe(true)

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
        situacionesHistoricas: 0, solucionadasRecientes: 0,
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

  it('muestra la lista simple de riesgo sin paneles de explicación técnica', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })

    expect(screen.getByText('Riesgo actual (hoy)')).toBeInTheDocument()
    expect(screen.queryByTestId('risk-explanation-factores')).not.toBeInTheDocument()
    expect(screen.queryByText('Pronóstico por departamento')).not.toBeInTheDocument()
  })

  it('Radar sustituye las capas de riesgo por el radar meteorológico', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })
    expect(screen.getByRole('group', { name: 'Variable meteorológica' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: /niveles de peligro meteorológico/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /todas las escuelas/i })).not.toBeInTheDocument()
  })
})

describe('MapInfraestructuraPage — recuperación de capas tras cambiar de estilo', () => {
  it('desactiva el diff para reconstruir las capas propias al cambiar de estilo', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'actual' })
    expect(screen.getByTestId('mock-maplibre')).toHaveAttribute('data-style-diffing', 'false')
  })

  it.each([
    ['Situación actual → Radar → Situación actual', 'actual'],
    ['Situación actual → Radar → Capas', 'capas'],
  ] as const)('%s restaura las fuentes, capas y símbolos tras descartar el estilo', async (_secuencia, destino) => {
    const vista = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'actual' })
    await completarCargaEstilo()
    esperarCapasBase(true)

    vista.rerender({ pestana: 'radar' })
    await waitFor(() => expect(MAPA_ESTILO_MOCK.estiloCargado).toBe(false))
    expect(MAPA_ESTILO_MOCK.fuentes.size).toBe(0)
    await completarCargaEstilo()
    esperarCapasBase(false)
    expect(MAPA_ESTILO_MOCK.capas.has('infra-partes-escuela-icono')).toBe(true)
    expect(MAPA_ESTILO_MOCK.visibilidadCapas.get('infra-partes-escuela-icono')).toBe('none')

    vista.rerender(destino === 'capas' ? { pestana: 'actual', panel: 'capas' } : { pestana: 'actual' })
    await waitFor(() => expect(MAPA_ESTILO_MOCK.estiloCargado).toBe(false))
    expect(MAPA_ESTILO_MOCK.fuentes.size).toBe(0)
    await completarCargaEstilo()
    await waitFor(() => expect(MAPA_ESTILO_MOCK.capas.has('infra-partes-escuela-icono')).toBe(true))
    esperarCapasBase(true)
  })

  it('conserva las capas esperadas en cada transición entre las cuatro pestañas', async () => {
    const vista = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'actual' })
    await completarCargaEstilo()
    const transiciones = [
      ['radar', false],
      ['planificacion', false],
      ['capas', true],
      ['actual', true],
      ['planificacion', false],
      ['radar', false],
      ['actual', true],
    ] as const

    for (const [pestana, partesVisibles] of transiciones) {
      vista.rerender(pestana === 'capas' ? { pestana: 'actual', panel: 'capas' } : { pestana })
      await completarCargaEstilo()
      await waitFor(() => expect(MAPA_ESTILO_MOCK.fuentes.has('infra-departamentos-src')).toBe(true))
      esperarCapasBase(partesVisibles)
      expect(MAPA_ESTILO_MOCK.visibilidadCapas.get('infra-partes-escuela-icono')).toBe(partesVisibles ? 'visible' : 'none')
    }
  })

  it('recorre Situación actual → Radar → Situación actual → Capas → Radar → Planificación', async () => {
    const vista = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'actual' })
    await completarCargaEstilo()
    esperarCapasBase(true)

    const transiciones = [
      { pestana: 'radar' as const, partesVisibles: false },
      { pestana: 'actual' as const, partesVisibles: true },
      { pestana: 'capas' as const, partesVisibles: true },
      { pestana: 'radar' as const, partesVisibles: false },
      { pestana: 'planificacion' as const, partesVisibles: false },
    ]

    for (const transicion of transiciones) {
      vista.rerender(transicion.pestana === 'capas'
        ? { pestana: 'actual', panel: 'capas' }
        : { pestana: transicion.pestana })
      await completarCargaEstilo()
      await waitFor(() => expect(MAPA_ESTILO_MOCK.fuentes.has('infra-departamentos-src')).toBe(true))
      esperarCapasBase(transicion.partesVisibles)
      expect(MAPA_ESTILO_MOCK.capas.has('infra-departamentos-borde')).toBe(true)
      expect(MAPA_ESTILO_MOCK.capas.has('infra-departamentos-etiqueta')).toBe(true)
      if (transicion.partesVisibles) {
        expect(MAPA_ESTILO_MOCK.capas.has('infra-partes-escuela-icono')).toBe(true)
      }
    }
  })

  it('restaura las capas al volver visible después de cambiar de estilo oculto como en Estadísticas', async () => {
    const vista = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'actual', visible: true })
    await completarCargaEstilo()
    vista.rerender({ visible: false, pestana: 'radar' })
    await waitFor(() => expect(MAPA_ESTILO_MOCK.estiloCargado).toBe(false))
    await completarCargaEstilo()
    esperarCapasBase(false)

    vista.rerender({ visible: true, pestana: 'actual' })
    await waitFor(() => expect(MAPA_ESTILO_MOCK.estiloCargado).toBe(false))
    await completarCargaEstilo()
    esperarCapasBase(true)
  })
})

describe('MapInfraestructuraPage — Planificación', () => {
  it.each([
    ['planificacion', 'mock-layer-infra-puntos-nivel'],
    ['actual', 'mock-source-infra-partes-src'],
  ] as const)('cambio de pestaña radar → %s restaura estilo/basemap y monta sus capas', async (pestana, testIdCapa) => {
    const vista = await renderMapa({ mostrarEnlaceNominal: true, riskRadarEnabled: true, pestana: 'radar' })
    expect(screen.getByTestId('mock-maplibre')).toHaveAttribute('data-map-style', 'https://tiles.openfreemap.org/styles/dark')
    await completarCargaEstilo()

    vista.rerender({ pestana })

    expect(screen.getByTestId('mock-maplibre')).toHaveAttribute('data-map-style', 'https://tiles.openfreemap.org/styles/bright')
    expect(screen.getByTestId(testIdCapa)).toBeInTheDocument()
    const montajeAntesDeStyleData = screen.getByTestId('mock-source-infra-mascara-src').getAttribute('data-mount-id')

    await completarCargaEstilo()

    await waitFor(() => {
      expect(screen.getByTestId('mock-source-infra-mascara-src').getAttribute('data-mount-id')).not.toBe(montajeAntesDeStyleData)
    })
    desmontarMapa?.()
  })

  it('muestra el panel de Planificación y sus tres vistas en la pestaña', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, pestana: 'planificacion' })

    const panel = await screen.findByTestId('panel-lateral')
    expect(within(panel).getByRole('heading', { name: 'Planificación' })).toBeInTheDocument()
    expect(within(panel).getByRole('group', { name: 'Vista' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Escuelas aisladas' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Inundación' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Historial' })).toBeInTheDocument()
    expect(within(panel).queryByRole('heading', { name: 'Situación actual' })).not.toBeInTheDocument()
    expect(screen.getByText('Aislamiento')).toBeInTheDocument()

    await userEvent.click(within(panel).getByRole('button', { name: 'Historial' }))
    expect(screen.getByText('Veces con situaciones')).toBeInTheDocument()
  })

  it('quita los controles de mapa base flotantes en Situación actual', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true, pestana: 'actual' })

    expect(screen.queryByText('Capas territoriales')).not.toBeInTheDocument()
    expect(screen.queryByText('Dificultad para llegar por camino')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Capas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mapa base' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Mapa base' })).not.toBeInTheDocument()
  })

  it('muestra el mapa base en el sidebar de Capas y vuelve a registrar los íconos al cambiarlo', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, pestana: 'actual', panel: 'capas' })

    const panel = screen.getByTestId('panel-lateral')
    expect(within(panel).getByRole('heading', { name: 'Mapa base' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Capas' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('infra-controls-stack')).not.toBeInTheDocument()
    const iconoEscuela = 'mock-layer-infra-partes-escuela-icono'
    expect(await screen.findByTestId(iconoEscuela)).toBeInTheDocument()
    const consultasAntesDelCambio = HAS_IMAGE_MOCK.mock.calls.length

    await userEvent.click(within(within(panel).getByRole('group', { name: 'Mapa base' })).getByRole('radio', { name: 'Mapa claro' }))
    expect(screen.getByTestId('mock-maplibre')).toHaveAttribute('data-map-style', 'https://tiles.openfreemap.org/styles/positron')
    await completarCargaEstilo()
    await waitFor(() => expect(MAPA_ESTILO_MOCK.capas.has('infra-partes-escuela-icono')).toBe(true))
    expect(await screen.findByTestId(iconoEscuela)).toBeInTheDocument()
    expect(HAS_IMAGE_MOCK.mock.calls.length).toBeGreaterThan(consultasAntesDelCambio)
  })

  it('colorea los puntos por vista y cambia los colores al elegir Historial', async () => {
    const escuelas = {
      ...FIXTURE_ESCUELAS_MAPA,
      escuelas: FIXTURE_ESCUELAS_MAPA.escuelas.map((escuela, indice) => ({
        ...escuela,
        situacionesHistoricas: indice === 0 ? 6 : 0,
      })),
    }
    await renderMapa({ mostrarEnlaceNominal: true, pestana: 'planificacion', escuelasMapa: escuelas })

    const fuente = screen.getByTestId('mock-source-infra-puntos-nivel-src')
    const coloresAisladas = JSON.parse(fuente.getAttribute('data-geojson') ?? '{}')
      .features.map((feature: { properties: { cueAnexo: string; color?: string; conDato: boolean } }) => [feature.properties.cueAnexo, feature.properties.color, feature.properties.conDato])
    expect(coloresAisladas).toEqual([
      [CUE, undefined, false],
      [CUE_SIN_AFECTACION, undefined, false],
    ])

    await userEvent.click(within(screen.getByTestId('panel-planificacion')).getByRole('button', { name: 'Historial' }))

    const coloresHistorial = JSON.parse(fuente.getAttribute('data-geojson') ?? '{}')
      .features.map((feature: { properties: { cueAnexo: string; color?: string; conDato: boolean } }) => [feature.properties.cueAnexo, feature.properties.color, feature.properties.conDato])
    expect(coloresHistorial).toEqual([
      [CUE, colorSeveridad('Crítica'), true],
      [CUE_SIN_AFECTACION, undefined, false],
    ])
  })

  it('en Inundación no dibuja escuelas sin riesgo o sin dato y la leyenda no muestra Nulo', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, pestana: 'planificacion' })

    await userEvent.click(within(screen.getByTestId('panel-planificacion')).getByRole('button', { name: 'Inundación' }))

    const fuente = screen.getByTestId('mock-source-infra-puntos-nivel-src')
    expect(JSON.parse(fuente.getAttribute('data-geojson') ?? '{}').features).toEqual([])
    const leyenda = screen.getByRole('complementary', { name: 'Referencias del mapa' })
    expect(within(leyenda).getByText('Exposición a inundación')).toBeInTheDocument()
    expect(within(leyenda).queryByText('Nulo')).not.toBeInTheDocument()
  })

  it('abre la ficha flotante desde Prioridad y no la conserva al cambiar de pestaña', async () => {
    const escuelas = {
      ...FIXTURE_ESCUELAS_MAPA,
      escuelas: FIXTURE_ESCUELAS_MAPA.escuelas.map((escuela, indice) => ({
        ...escuela,
        situacionesHistoricas: indice === 0 ? 6 : 0,
      })),
    }
    const { rerender } = await renderMapa({ mostrarEnlaceNominal: true, pestana: 'planificacion', escuelasMapa: escuelas })
    await userEvent.click(within(screen.getByTestId('panel-planificacion')).getByRole('button', { name: 'Historial' }))
    await userEvent.click(within(screen.getByTestId('panel-planificacion')).getByRole('button', { name: /Escuela 1/ }))

    expect(await within(screen.getByTestId('ficha-flotante')).findByTestId('mock-ficha-escuela')).toHaveAttribute('data-cue', CUE)
    rerender({ pestana: 'actual' })
    expect(screen.queryByTestId('ficha-flotante')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('panel-lateral')).getByRole('heading', { name: 'Situación actual' })).toBeInTheDocument()
  })

  it('sin contexto territorial muestra el vacío en Escuelas aisladas y mantiene Historial', async () => {
    const escuelas = {
      ...FIXTURE_ESCUELAS_MAPA,
      escuelas: FIXTURE_ESCUELAS_MAPA.escuelas.map((escuela, indice) => ({
        ...escuela,
        situacionesHistoricas: indice === 0 ? 6 : 0,
      })),
    }
    await renderMapa({ mostrarEnlaceNominal: true, pestana: 'planificacion', escuelasMapa: escuelas })

    expect(within(screen.getByTestId('panel-planificacion')).getByText('Todavía no hay datos para esta vista.')).toBeInTheDocument()
    await userEvent.click(within(screen.getByTestId('panel-planificacion')).getByRole('button', { name: 'Historial' }))
    expect(within(screen.getByTestId('panel-planificacion')).getByRole('button', { name: /Escuela 1/ })).toBeInTheDocument()
  })

  it('oculta las capas de partes mientras está activa', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, pestana: 'planificacion' })
    expect(screen.getByTestId('mock-layer-infra-partes')).toHaveAttribute('data-layout-visibility', 'none')
    expect(screen.getByTestId('mock-layer-infra-partes-cluster')).toHaveAttribute('data-layout-visibility', 'none')
    expect(document.querySelector('[data-capa="infra-badge-estado"]')).toBeNull()
  })

  it('permite seleccionar una escuela desde sus puntos coloreados', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, pestana: 'planificacion' })
    await userEvent.click(screen.getByTestId('mock-click-punto-nivel'))

    expect(await screen.findByTestId('mock-ficha-escuela')).toHaveAttribute('data-cue', CUE)
  })
})

describe('M1: clic de departamento y buscador de escuelas', () => {
  it('clic de departamento muestra el resumen en el sidebar, sin popup flotante', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })
    await userEvent.click(screen.getByTestId('mock-click-departamento'))
    const panel = within(await screen.findByTestId('panel-lateral'))
    expect(panel.getByRole('region', { name: 'Departamento seleccionado' })).toHaveTextContent('Departamento: Capital')
    expect(panel.getByRole('region', { name: 'Departamento seleccionado' })).toHaveTextContent('10 escuelas · 3 con situaciones abiertas · 30%')
    expect(screen.queryByText(/En Capital hay 10 escuelas/)).not.toBeInTheDocument()
  })

  it('clic de cluster muestra escuelas con situaciones abiertas', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-click-cluster'))

    expect(await screen.findByText((_contenido, element) =>
      element?.tagName === 'P' && /8 escuelas/.test(element.textContent ?? ''),
    )).toHaveTextContent('3 con situaciones abiertas (1 críticas, 2 altas)')
  })

  it('Esc cierra el popup de cluster', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })
    await userEvent.click(screen.getByTestId('mock-click-cluster'))

    const popup = () => screen.queryByText((_contenido, element) =>
      element?.tagName === 'P' && /8 escuelas/.test(element.textContent ?? ''),
    )
    expect(await screen.findByText((_contenido, element) =>
      element?.tagName === 'P' && /8 escuelas/.test(element.textContent ?? ''),
    )).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(popup()).not.toBeInTheDocument()
  })

  it('clickear el mismo departamento de nuevo quita el filtro', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-click-departamento'))
    expect(await screen.findByRole('region', { name: 'Departamento seleccionado' })).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('mock-click-departamento'))
    expect(screen.queryByRole('region', { name: 'Departamento seleccionado' })).not.toBeInTheDocument()
  })

  it('clickear otro departamento reemplaza el resumen del sidebar', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await userEvent.click(screen.getByTestId('mock-click-departamento'))
    expect(await screen.findByRole('region', { name: 'Departamento seleccionado' })).toHaveTextContent('Capital')

    await userEvent.click(screen.getByTestId('mock-click-departamento-empedrado'))
    expect(screen.getByRole('region', { name: 'Departamento seleccionado' })).toHaveTextContent('Empedrado')
  })

  it('mantiene el resumen del departamento en el panel lateral mientras la ficha de escuela está abierta en la ficha flotante', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })
    await userEvent.click(screen.getByTestId('mock-click-departamento'))
    await userEvent.click(screen.getByTestId('mock-click-parte'))

    expect(await within(await screen.findByTestId('ficha-flotante')).findByTestId('mock-ficha-escuela')).toBeInTheDocument()
    expect(within(screen.getByTestId('panel-lateral')).getByRole('region', { name: 'Departamento seleccionado' })).toBeInTheDocument()
  })

  // El clic sobre una escuela abre su ficha y el clic sobre un cluster
  // expande el zoom; ninguno cambia el filtro departamental.

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
    expect(within(panel).getByText('Escuelas con situaciones abiertas').previousElementSibling).toHaveTextContent('1')
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
    expect(within(panel).getByText('Escuelas con situaciones abiertas').previousElementSibling).toHaveTextContent('0')
    expect(within(panel).getByText('Ninguna escuela con situaciones abiertas para estos filtros.')).toBeInTheDocument()
    desmontarMapa?.()
  })

  it('no ofrece el toggle del padrón y deja visibles los puntos afectados y sin reporte', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    expect(screen.queryByRole('checkbox', { name: /todas las escuelas/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Capas' })).not.toBeInTheDocument()
    const fuente = JSON.parse(
      screen.getByTestId('mock-source-infra-partes-src').getAttribute('data-geojson') ?? '{}',
    ) as { features: Array<{ properties: { cueAnexo: string; estado: string } }> }
    expect(fuente.features.map(({ properties }) => [properties.cueAnexo, properties.estado])).toEqual([
      [CUE, 'afectada'],
      [CUE_SIN_AFECTACION, 'sin_afectacion_reportada'],
    ])
    expect(screen.getByTestId('mock-layer-infra-partes')).toHaveAttribute(
      'data-filter',
      JSON.stringify(['!', ['has', 'point_count']]),
    )
    const pinturaPartes = JSON.parse(
      screen.getByTestId('mock-layer-infra-partes').getAttribute('data-paint') ?? '{}',
    ) as { 'circle-opacity'?: unknown }
    expect(JSON.stringify(pinturaPartes['circle-opacity'])).toContain('sin_afectacion_reportada')
    expect(JSON.stringify(pinturaPartes['circle-opacity'])).toContain('0')
    expect(screen.getByTestId('mock-layer-infra-partes-cluster')).toHaveAttribute(
      'data-filter',
      JSON.stringify(['has', 'point_count']),
    )
    expect(within(screen.getByTestId('panel-lateral')).getByText('Situación actual')).toBeInTheDocument()
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

  it('con el flag prendido mantiene el contexto territorial sin ofrecer capas ni controles', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    expect(screen.queryByText('Capas territoriales')).not.toBeInTheDocument()
    expect(screen.queryByText('Dificultad para llegar por camino')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mapa base' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/agua estimada por crecida de río/i)).not.toBeInTheDocument()
    expect(llamadasTerritorio.habilitados.at(-1)).toBe(true)
  })

  it('al seleccionar una escuela pide su geometría y muestra el bloque de acceso en la ficha', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    const ficha = await seleccionarPorBuscador('Escuela 1')

    // Geometría SÓLO de la escuela seleccionada, con el flag prendido.
    expect(llamadasGeometria.cues).toContain(CUE)
    expect(llamadasGeometria.habilitados.at(-1)).toBe(true)
    expect(await within(ficha).findByTestId('bloque-acceso-via')).toBeInTheDocument()
    expect(screen.queryByTestId('ficha-acceso-ver-ruta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ficha-territorial')).not.toBeInTheDocument()
  })


})

describe('MapInfraestructuraPage — textos visibles con contexto completo', () => {
  it.each(['actual', 'radar', 'planificacion'] as const)(
    'no muestra textos técnicos con la ficha abierta en la pestaña %s',
    async (pestana) => {
      await renderMapa({
        mostrarEnlaceNominal: true,
        hazardContextEnabled: true,
        riskRadarEnabled: true,
        pestana,
      })

      await seleccionarPorBuscador('Escuela 1')
      await userEvent.click(screen.getByTestId('mock-click-cruce'))

      const mapa = document.querySelector('.map-shell')
      expect(mapa).not.toBeNull()
      expect(mapa?.textContent).not.toMatch(
        /vencid|fuente|extracto|corrida|ODbL|arcsec|Aqueduct|OpenStreetMap|\bOSM\b|physrisk|per[ií]odo de retorno|metodolog/i,
      )
    },
  )
})

// Q1: la ficha abierta/cerrada pasó a ser un estado DISTINTO del de selección.
it('no conserva acciones flotantes de selección en la página ni en sus estilos', () => {
  const pagina = readFileSync(resolve(process.cwd(), 'components/mapas/map-infraestructura-page.tsx'), 'utf8')
  const estilos = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')

  expect(pagina).not.toContain('map-seleccion-acciones')
  expect(estilos).not.toContain('.map-seleccion-acciones')
})

describe('Q1: cerrar la ficha conserva la selección', () => {
  it('cerrar la ficha no borra la selección: aparece "Ver ficha"', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    const ficha = await seleccionarPorBuscador('Escuela 1')
    expect(ficha).toHaveAttribute('data-cue', CUE)

    await cerrarFicha()

    expect(within(screen.getByTestId('panel-lateral')).getByText('Situación actual')).toBeInTheDocument()
    // Y hay una forma explícita de volver a la ficha.
    expect(within(screen.getByTestId('panel-lateral')).getByTestId('reabrir-ficha')).toBeInTheDocument()
  })

  it('"Ver ficha" reabre la ficha y el grupo de acciones desaparece', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await seleccionarPorBuscador('Escuela 1')
    await cerrarFicha()

    await userEvent.click(within(screen.getByTestId('panel-lateral')).getByTestId('reabrir-ficha'))

    const ficha = await screen.findByTestId('mock-ficha-escuela')
    expect(ficha).toHaveAttribute('data-cue', CUE)
    expect(screen.queryByTestId('reabrir-ficha')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quitar-seleccion')).not.toBeInTheDocument()
  })

  it('"Quitar selección" borra la selección completa y no deja el grupo flotando', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    await seleccionarPorBuscador('Escuela 1')
    await cerrarFicha()

    await userEvent.click(within(screen.getByTestId('panel-lateral')).getByTestId('quitar-seleccion'))

    // Sin selección no hay ficha ni queda el grupo flotando sobre el mapa.
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
    const panel = within(screen.getByTestId('panel-lateral'))
    expect(await panel.findByTestId('quitar-seleccion')).toBeInTheDocument()
    // Ambos botones son botones de verdad, no <div> con onClick.
    expect(panel.getByTestId('reabrir-ficha').tagName).toBe('BUTTON')
    expect(panel.getByTestId('reabrir-ficha')).toHaveAttribute('type', 'button')
    expect(panel.getByTestId('reabrir-ficha')).toHaveAttribute(
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
    expect(within(screen.getByTestId('panel-lateral')).getByTestId('reabrir-ficha')).toBeInTheDocument()
  })

  it('mantiene visible la columna izquierda y permite seleccionar una escuela', async () => {
    await renderMapa({ mostrarEnlaceNominal: true })

    const cajon = document.getElementById('infra-left-stack')
    expect(cajon).not.toHaveAttribute('data-open')
    expect(screen.queryByRole('button', { name: 'Buscar escuelas' })).not.toBeInTheDocument()

    await seleccionarPorBuscador('Escuela 1')

    expect(await screen.findByTestId('mock-ficha-escuela')).toBeInTheDocument()
  })

  it('oculta la leyenda de accesos cuando ambas capas generales están apagadas', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })

    expect(screen.queryByTestId('leyenda-aislamiento')).not.toBeInTheDocument()
  })
})

// Q3: encuadre automático de la ruta disponible al seleccionar una escuela.
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

  it('no expone un control manual para encuadrar el recorrido', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })
    await seleccionarPorBuscador('Escuela 1')

    expect(screen.queryByTestId('ficha-acceso-ver-ruta')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /camino y cruces de agua/i })).not.toBeInTheDocument()
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
      situacionesHistoricas: 0, solucionadasRecientes: 0,
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
      await userEvent.click(await within(screen.getByTestId('panel-lateral')).findByTestId('quitar-seleccion'))
      expect(screen.queryByTestId('aviso-busqueda-sin-ubicacion')).not.toBeInTheDocument()
    } finally {
      FIXTURE_ESCUELAS_MAPA.escuelas = padronOriginal
    }
  })
})

describe('Task 4: cambiar de pestaña a Radar', () => {
  it('con una ficha abierta, pasar a Radar muestra el panel Radar sin ficha flotante y la restaura al volver', async () => {
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
    expect(screen.queryByTestId('ficha-flotante')).not.toBeInTheDocument()
    expect(within(panel).queryByTestId('mock-ficha-escuela')).not.toBeInTheDocument()

    rerender({ pestana: 'actual' })

    expect(within(screen.getByTestId('ficha-flotante')).getByTestId('mock-ficha-escuela')).toHaveAttribute('data-cue', CUE)
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

    rerender({ pestana: 'planificacion' })
    expect(
      within(screen.getByTestId('panel-lateral')).getByTestId('reabrir-ficha'),
    ).toBeInTheDocument()

    rerender({ pestana: 'radar' })
    const panelRadar = within(screen.getByTestId('panel-lateral'))
    expect(panelRadar.getByTestId('panel-radar')).toBeInTheDocument()
    expect(panelRadar.getByTestId('reabrir-ficha')).toBeInTheDocument()

    rerender({ pestana: 'actual' })

    const panel = screen.getByTestId('panel-lateral')
    expect(panel).not.toBeEmptyDOMElement()
    expect(within(panel).queryByTestId('panel-radar')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('panel-lateral')).getByTestId('reabrir-ficha')).toBeInTheDocument()
    await userEvent.click(within(screen.getByTestId('panel-lateral')).getByTestId('reabrir-ficha'))
    expect(await screen.findByTestId('mock-ficha-escuela')).toHaveAttribute('data-cue', CUE)
  })
})

// Q3: la ruta y los cruces de la escuela seleccionada siguen disponibles,
// pero las capas territoriales generales ya no se ofrecen desde el mapa.
describe('accesos territoriales fuera de los controles generales', () => {
  it('no ofrece capas generales de aislamiento o inundación', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })
    expect(screen.queryByRole('checkbox', { name: 'Dificultad para llegar por camino (0 a 3)' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('mock-layer-infra-aislamiento-symbol')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mock-layer-infra-inundacion-symbol')).not.toBeInTheDocument()
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
    expect(screen.queryByText(/En Capital hay 10 escuelas/)).not.toBeInTheDocument()

    // Cualquier otro clic lo cierra.
    await userEvent.click(screen.getByTestId('mock-click-parte'))
    await waitFor(() => expect(screen.queryByText(/Cruce de agua: Sin puente registrado/)).not.toBeInTheDocument())
  })

  it('Esc cierra el popup del cruce de agua', async () => {
    await renderMapa({ mostrarEnlaceNominal: true, hazardContextEnabled: true })
    await userEvent.click(screen.getByTestId('mock-click-cruce'))
    expect(await screen.findByText(/Cruce de agua: Sin puente registrado/)).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText(/Cruce de agua: Sin puente registrado/)).not.toBeInTheDocument()
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
