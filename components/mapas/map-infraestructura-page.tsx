'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import MapGL, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import type {
  CircleLayerSpecification,
  DataDrivenPropertyValueSpecification,
  FillLayerSpecification,
  GeoJSONSource,
  LineLayerSpecification,
  MapGeoJSONFeature,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import { BasemapControl } from '@/components/mapas/basemap-control'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Indicadores } from '@/components/infraestructura/indicadores'
import { ListaAlertas } from '@/components/infraestructura/lista-alertas'
import { FichaParteModal } from '@/components/infraestructura/ficha-parte-modal'
import { AlcanceNominalModal } from '@/components/infraestructura/alcance-nominal-modal'
import { HistorialParteModal } from '@/components/infraestructura/historial-parte-modal'
import {
  InfraLayerControl,
  type CapaInfraestructura,
} from '@/components/mapas/layer-control'
import { InfraLegendPanel } from '@/components/mapas/legend-panel'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import {
  agregarEscuelasCaidasPorDepartamento,
  COLORES_DEPARTAMENTO,
  DEPARTAMENTOS_URL,
  LIMITES_CORRIENTES,
  MASCARA_COLOR,
  MASCARA_OPACIDAD,
  MASCARA_URL,
  normalizarNombreDepartamento,
} from '@/lib/mapas/departamentos'
import { ensureMapWorker } from '@/lib/map-worker'
import { useAlertas } from '@/lib/infraestructura/use-alertas'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { UMBRAL_SIN_REPORTAR_HORAS } from '@/lib/infraestructura/umbrales'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { esCategoria, type CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import {
  DURACION_PULSO_MS,
  esSeveridadPulsante,
  RADIO_DOT_BASE,
  radioMaximoPulso,
  rangoSeveridad,
} from '@/lib/mapas/severidad-visual'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import type { EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'

ensureMapWorker()

// Fase 2 (parte-mapa): una escuela = un punto, no una capa por categoría. La
// capa vieja distinguía establecimiento/alumnos con símbolo (relleno/anillo);
// ahora esos dos canales están ocupados por severidad (color) y servicio
// (anillo, ver circlePaintPartes), y la categoría pasó a filtro + ficha.
const CAPA_PARTES_ID = 'infra-partes'

// T1.1: pulso de severidad alta/crítica. Capa aparte (va DEBAJO de
// CAPA_PARTES_ID en el árbol) para que el anillo animado se lea alrededor del
// punto, no encima. Los clusters de supercluster también son capas aparte,
// con sus propios ids, para poder distinguir el click de un agregado del
// click de una escuela.
const CAPA_PARTES_PULSO_ID = 'infra-partes-pulso'
const CAPA_PARTES_CLUSTER_ID = 'infra-partes-cluster'
const CAPA_PARTES_CLUSTER_COUNT_ID = 'infra-partes-cluster-count'

// Umbral de clustering: sólo `clusterMaxZoom` de la fuente de escuelas — el
// zoom al que supercluster deja de agrupar en clusters. El halo "sin
// reportar" y los marcadores de evacuación ya NO dependen de este umbral:
// derivan su visibilidad del estado de clustering REAL del mapa (ver
// `cuesNoAgrupados` y el agregado `sinReportar` de clusterProperties).
const CAPA_PARTES_CLUSTER_MAX_ZOOM = 11

// F2.3: capa "sin reportar". Va DEBAJO de CAPA_PARTES_ID en el árbol (por eso
// se declara antes en el JSX) para que se lea como un halo alrededor del
// punto, no como algo que lo tapa. Es ausencia de información, no severidad:
// no toca color (esa escala es de severidad.ts), se resuelve con un anillo
// extra en un gris neutro que no aparece en ningún otro canal del mapa.
const CAPA_SIN_REPORTAR_ID = 'infra-sin-reportar'
const CAPA_SIN_REPORTAR_CLUSTER_ID = 'infra-sin-reportar-cluster'
const SIN_REPORTAR_COLOR = '#6b7280'
const SIN_REPORTAR_RADIO_EXTRA = 6

// Un cluster puede tener ambas banderas a la vez, así que los dos anillos
// necesitan radios distintos para leerse como dos anillos concéntricos en
// vez de uno dibujado encima del otro.
const EVACUADO_RADIO_EXTRA = 10

// Anillo de cluster "evacuado": igual que CAPA_SIN_REPORTAR_CLUSTER_ID, da
// feedback a zoom bajo de que una burbuja contiene al menos una escuela en
// estado evacuado/centro_evacuados.
const CAPA_EVACUADO_CLUSTER_ID = 'infra-evacuado-cluster'

// F2.3: capa "evacuación". Se resuelve con Marker (DOM), no con una capa
// MapLibre, porque necesita dos FORMAS geométricas distintas (cuadrado vs.
// triángulo) para distinguir evacuado (daño) de centro_evacuados (recurso) —
// son semánticamente opuestos y en una emergencia el recurso es lo que más
// rápido se busca, así que no pueden compartir símbolo. Nada de iconos
// ilustrativos: son formas puras hechas con bordes CSS, en el mismo color
// neutro que ya usa el anillo de servicio (ANILLO_COLOR), para no introducir
// una segunda escala de color.
const CAPA_EVACUACION_ID = 'infra-evacuacion'
const SIMBOLO_EVACUACION_TAMANO = 12

// Límites departamentales. Se declaran antes que la capa de partes en el
// árbol de MapGL para que queden por debajo: son contexto geográfico, no el
// dato. El relleno es casi transparente a propósito — su función es que se
// distinga un departamento del otro, no competir con los puntos.
const CAPA_DEPARTAMENTOS_RELLENO_ID = 'infra-departamentos-relleno'
const CAPA_DEPARTAMENTOS_BORDE_ID = 'infra-departamentos-borde'

// Máscara: tapa todo lo que no es Corrientes. Va primera en el árbol, apenas
// encima del basemap, para que los departamentos y las alertas queden por
// arriba. Es lo que permite dejar el zoom libre: el usuario puede alejarse,
// pero afuera de la provincia no hay nada compitiendo por su atención.
const CAPA_MASCARA_ID = 'infra-mascara-provincia'

function fillPaintMascara(): FillLayerSpecification['paint'] {
  return {
    'fill-color': MASCARA_COLOR,
    'fill-opacity': MASCARA_OPACIDAD,
  }
}

// F2.4: el relleno departamental deja de tener opacidad fija (era pura
// decoración de contexto geográfico) y pasa a modular la CANTIDAD de
// escuelas con servicio caído (suspendido o parcial) en ese departamento —
// el color sigue siendo el único fijo (COLORES_DEPARTAMENTO.rellenoNormal),
// nunca se introduce una segunda escala de color. `escuelasCaidas` es una
// propiedad calculada en el cliente (ver useMemo de construirGeojsonDepartamentos
// más abajo) y unida al feature del GeoJSON; ['coalesce', ..., 0] cubre el
// instante entre el primer render (todavía no llegó el fetch del GeoJSON
// propio) y el momento en que el Source usa la URL directa sin esa
// propiedad — sin el coalesce, 'interpolate' rompe con null.
//
// Techo elegido a partir del dato sembrado (15 escuelas caídas repartidas en
// 26 departamentos): a partir de ESCUELAS_CAIDAS_TECHO en un mismo
// departamento ya es una concentración que amerita la intensidad máxima, no
// hace falta seguir escalando linealmente para valores más raros.
const ESCUELAS_CAIDAS_TECHO = 5
const OPACIDAD_DEPARTAMENTO_CAIDO_TECHO = 0.4

function fillPaintDepartamentos(): FillLayerSpecification['paint'] {
  return {
    'fill-color': COLORES_DEPARTAMENTO.rellenoNormal,
    'fill-opacity': [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'escuelasCaidas'], 0],
      0,
      COLORES_DEPARTAMENTO.opacidadRellenoNormal,
      ESCUELAS_CAIDAS_TECHO,
      OPACIDAD_DEPARTAMENTO_CAIDO_TECHO,
    ],
  }
}

// Etiqueta tipo "GOYA 3": nombre del departamento en mayúsculas, y el
// conteo sólo cuando hay escuelas caídas (mostrar "SAUCE 0" en los 20+
// departamentos sin ninguna es ruido, no contexto). `text-field` data-driven
// vía 'case' sobre la misma propiedad que ya alimenta la opacidad, así las
// dos lecturas del coroplético (intensidad de relleno y etiqueta) nunca
// pueden desincronizarse entre sí.
function symbolLayoutDepartamentos(): SymbolLayerSpecification['layout'] {
  return {
    'text-field': [
      'case',
      ['>', ['coalesce', ['get', 'escuelasCaidas'], 0], 0],
      ['concat', ['get', 'nombreMayus'], ' ', ['to-string', ['get', 'escuelasCaidas']]],
      ['get', 'nombreMayus'],
    ],
    'text-size': 11,
    'text-allow-overlap': false,
  }
}

function symbolPaintDepartamentos(): SymbolLayerSpecification['paint'] {
  return {
    'text-color': COLORES_DEPARTAMENTO.bordeNormal,
    'text-opacity': 0.85,
  }
}

// Resaltado del departamento bajo el cursor. Reusa los colores "seleccionado"
// del prototipo para no inventar un lenguaje visual nuevo. Es una capa aparte
// con un filtro por nombre en vez de feature-state: el GeoJSON no trae ids
// estables, y filtrar 25 polígonos es trivial.
const CAPA_DEPARTAMENTO_HOVER_ID = 'infra-departamento-hover'
const CAPA_DEPARTAMENTO_HOVER_BORDE_ID = 'infra-departamento-hover-borde'

function fillPaintDepartamentoHover(): FillLayerSpecification['paint'] {
  return {
    'fill-color': COLORES_DEPARTAMENTO.rellenoSeleccionado,
    'fill-opacity': COLORES_DEPARTAMENTO.opacidadRellenoSeleccionado,
  }
}

function linePaintDepartamentoHover(): LineLayerSpecification['paint'] {
  return {
    'line-color': COLORES_DEPARTAMENTO.bordeSeleccionado,
    'line-width': COLORES_DEPARTAMENTO.pesoLineaSeleccionado,
  }
}

function linePaintDepartamentos(): LineLayerSpecification['paint'] {
  return {
    'line-color': COLORES_DEPARTAMENTO.bordeNormal,
    'line-width': COLORES_DEPARTAMENTO.pesoLineaNormal,
    'line-opacity': 0.95,
  }
}

type FiltrosForm = {
  territorio: string
  nivel: string
  establecimiento: string
  motivo: string
  severidad: string
  categoria: string
  servicio: string
}

const FILTROS_VACIOS: FiltrosForm = {
  territorio: '',
  nivel: '',
  establecimiento: '',
  motivo: '',
  severidad: '',
  categoria: '',
  servicio: '',
}

// ── Tamaño: fijo, ya no alumnosAlcanzados ──────────────────────────────────
//
// La antigua codificación escalaba el radio por `alumnosAlcanzados` (área
// proporcional al dato, interpolando sobre la raíz cuadrada). Ese canal dejó
// de usarse: la matrícula pasó a la ficha/lista y un punto de tamaño
// variable terminaba tapando a sus vecinas a zoom bajo. Lo que ahora
// distingue a una escuela de severidad alta/crítica es el PULSO (ver
// infra-partes-pulso y lib/mapas/severidad-visual.ts), no el tamaño: el
// radio del punto es la constante fija RADIO_DOT_BASE para todas.

// Anillo: color NEUTRO (el color ya está tomado por severidad, no se puede
// reusar acá sin generar una segunda escala). "suspendido" y "parcial" se
// distinguen por grosor + opacidad de trazo, no por color: MapLibre no
// soporta circle-stroke-dasharray, así que un trazo punteado real no es una
// opción. A zoom provincial un anillo grueso y sólido se distingue de uno
// fino y traslúcido incluso con varios puntos superpuestos; "normal" queda
// con el mismo trazo mínimo que ya traía el punto (línea de separación con
// el fondo), que a esa distancia se lee como "sin anillo".
const ANILLO_COLOR = '#1c1c1c'

// T1.1b/T1.1c: el color del cluster y del pulso deja de ser un gris fijo y
// pasa a ser el de la severidad MÁS ALTA presente entre los puntos agrupados,
// leída del agregado `severidadRango` que calcula clusterProperties (max). Es
// una expresión 'case' sobre SEVERIDADES en su orden real — lee el rango de
// mayor a menor: si algún punto agrupado es Crítica (>=3) pinta Crítica, si
// no el mayor es Alta (>=2), y así hasta Baja (default). Compartida entre la
// capa de clusters y la capa de pulso: ambas leen `severidadRango`, una
// propiedad que los puntos severos individuales y los clusters agrupados
// traen por igual.
function colorPorSeveridadRango(): DataDrivenPropertyValueSpecification<string> {
  const expresion: unknown[] = ['case']
  for (let i = SEVERIDADES.length - 1; i >= 1; i--) {
    expresion.push(['>=', ['get', 'severidadRango'], i], colorSeveridad(SEVERIDADES[i]))
  }
  expresion.push(colorSeveridad(SEVERIDADES[0]))
  return expresion as unknown as DataDrivenPropertyValueSpecification<string>
}

// T1.1c: el radio del cluster es una expresión compartida, no un literal
// inline duplicado. La capa de clusters, el pulso (que parte del radio propio
// del cluster para expandirse POR FUERA del círculo, no por debajo) y
// cualquier futuro consumidor que necesite "qué tan grande se dibuja este
// cluster" leen la MISMA expresión, para que nunca puedan desincronizarse.
const RADIO_CLUSTER_MENOR = 16
const RADIO_CLUSTER_MEDIO = 22
const RADIO_CLUSTER_MAYOR = 28

function expresionRadioCluster(): DataDrivenPropertyValueSpecification<number> {
  return ['step', ['get', 'point_count'], RADIO_CLUSTER_MENOR, 10, RADIO_CLUSTER_MEDIO, 50, RADIO_CLUSTER_MAYOR] as unknown as DataDrivenPropertyValueSpecification<number>
}

// El pulso parte del radio con que se dibuja la feature: el radio propio del
// cluster si es un agregado (['has', 'point_count']), RADIO_DOT_BASE si es un
// punto individual. Así el anillo de un cluster arranca en el borde de su
// círculo y crece por fuera, en vez de empezar bajo el círculo sólido e
// invisible hasta que lo supera.
function expresionRadioBasePulso(): DataDrivenPropertyValueSpecification<number> {
  return ['case', ['has', 'point_count'], expresionRadioCluster(), RADIO_DOT_BASE] as unknown as DataDrivenPropertyValueSpecification<number>
}

function circlePaintPartes(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': RADIO_DOT_BASE,
    'circle-color': ['get', 'color'],
    'circle-opacity': 0.9,
    'circle-stroke-color': ANILLO_COLOR,
    'circle-stroke-width': ['match', ['get', 'servicio'], 'suspendido', 4, 'parcial', 2, 1],
    'circle-stroke-opacity': ['match', ['get', 'servicio'], 'suspendido', 1, 'parcial', 0.55, 0.9],
  }
}

type PropiedadesParte = {
  cueAnexo: string
  color: string
  servicio: EstadoServicioGeneral
  alumnosAlcanzados: number
  // T1.1: la etiqueta cruda de severidad (parte.peorSeveridad) y el booleano
  // derivado que filtra la capa de pulso — calculado acá, una vez, en vez de
  // en una expresión MapLibre por frame.
  severidad: string
  esSevero: boolean
  // T1.1b: el rango numérico de severidad (0..3) y el radio máximo de pulso
  // por severidad, unidos al feature para que clusterProperties pueda
  // agregarlos con max() entre los puntos agrupados (un label string no se
  // puede agregar de forma significativa).
  severidadRango: number
  radioMaxPulso: number
  // T1.1c: booleano real por punto ("este establecimiento está sin reportar"
  // según esSinReportar/UMBRAL_SIN_REPORTAR_HORAS). Se une al feature para
  // que clusterProperties pueda agregarlo como 0/1 con max() en el cluster.
  sinReportar: boolean
  // Booleano real por punto ("este establecimiento está evacuado o es centro
  // de evacuados", según estadoEstablecimiento). Se une al feature para que
  // clusterProperties pueda agregarlo como 0/1 con max() en el cluster.
  esEvacuado: boolean
}

// Función de módulo (no closure del componente) a propósito: así useMemo
// puede depender sólo de `partes` sin arrastrar warnings de exhaustive-deps
// por una función recreada en cada render.
function construirFeatureCollection(
  partes: ParteMapa[],
  ahoraMs: number | null,
): FeatureCollection<Point, PropiedadesParte> {
  const features = partes
    .filter((parte) => parte.lat !== null && parte.lon !== null)
    .map((parte) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [parte.lon as number, parte.lat as number],
      },
      properties: {
        cueAnexo: parte.cueAnexo,
        color: colorSeveridad(parte.peorSeveridad),
        servicio: parte.servicio,
        alumnosAlcanzados: parte.alumnosAlcanzados,
        severidad: parte.peorSeveridad,
        esSevero: esSeveridadPulsante(parte.peorSeveridad),
        severidadRango: rangoSeveridad(parte.peorSeveridad),
        radioMaxPulso: radioMaximoPulso(parte.peorSeveridad),
        sinReportar: ahoraMs !== null && esSinReportar(parte, ahoraMs),
        esEvacuado:
          parte.estadoEstablecimiento === 'evacuado' ||
          parte.estadoEstablecimiento === 'centro_evacuados',
      },
    }))
  return { type: 'FeatureCollection', features }
}

// Halo "sin reportar": mismo radio base fijo que el punto (RADIO_DOT_BASE)
// más un margen fijo, para que se lea como un anillo alrededor de la escuela
// y no como un círculo aparte flotando cerca. Sin relleno (circle-color
// transparent): es sólo un borde, nunca compite con el color de severidad
// del punto que rodea.
function circlePaintSinReportar(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': RADIO_DOT_BASE + SIN_REPORTAR_RADIO_EXTRA,
    'circle-color': 'transparent',
    'circle-stroke-color': SIN_REPORTAR_COLOR,
    'circle-stroke-width': 2,
    'circle-stroke-opacity': 0.65,
  }
}

// "Sin reportar" se calcula acá, no en el servidor: el indicador agregado
// (indicadores.sinReportar) ya viaja en la respuesta, pero para dibujar el
// halo hace falta saber CUÁL parte individual cruzó el umbral, y esa
// información no se serializa aparte. UMBRAL_SIN_REPORTAR_HORAS es la misma
// constante que usa el servidor (parte-mapa.ts) para el indicador agregado:
// un solo lugar define "viejo", nunca dos criterios que puedan divergir.
function esSinReportar(parte: ParteMapa, ahoraMs: number): boolean {
  const umbralMs = UMBRAL_SIN_REPORTAR_HORAS * 60 * 60 * 1000
  return ahoraMs - new Date(parte.actualizadaEn).getTime() > umbralMs
}

// Estilo inline (no clase CSS): son dos formas puntuales, más simples que
// justificar una clase reusable por dos usos. Sólo bordes, sin relleno ni
// sombra (manual de marca: flat), en ANILLO_COLOR — el mismo neutro que ya
// usa el anillo de servicio, para no sumar un color más al mapa.
function estiloSimboloEvacuado(): CSSProperties {
  return {
    width: SIMBOLO_EVACUACION_TAMANO,
    height: SIMBOLO_EVACUACION_TAMANO,
    border: `2px solid ${ANILLO_COLOR}`,
    background: 'transparent',
    pointerEvents: 'none',
  }
}

// Triángulo vía bordes CSS (sin imagen, sin ícono, sin fuente): dos lados
// transparentes y un fondo sólido de color forman el triángulo. Es una forma
// geométrica pura, no un pictograma — cumple la restricción de "nada de
// emojis ni íconos ilustrativos" porque no representa nada figurativo, sólo
// codifica una categoría distinta a la del cuadrado.
function estiloSimboloCentroEvacuados(): CSSProperties {
  const mitad = SIMBOLO_EVACUACION_TAMANO / 2
  return {
    width: 0,
    height: 0,
    borderLeft: `${mitad}px solid transparent`,
    borderRight: `${mitad}px solid transparent`,
    borderBottom: `${SIMBOLO_EVACUACION_TAMANO}px solid ${ANILLO_COLOR}`,
    pointerEvents: 'none',
  }
}

const CAPAS_VISIBLES_DEFECTO: Record<CapaInfraestructura, boolean> = {
  escuelas: true,
  // Capas informativas nuevas: apagadas por defecto para no sumar ruido
  // visual al encuadre inicial. El director las prende cuando las necesita.
  evacuacion: false,
  sinReportar: false,
}

// T1.1c: la preferencia de reduced-motion se lee con useSyncExternalStore, la
// forma sancionada por React de leer una API del browser (matchMedia) sin
// llamar setState de forma síncrona dentro del cuerpo de un efecto (que
// dispara react-hooks/set-state-in-effect y puede encadenar renders). El
// listener 'change' además hace que el mapa reaccione en vivo si el usuario
// cambia el ajuste de reduced-motion del sistema operativo, cosa que el
// efecto one-shot viejo no hacía.
const CONSULTA_REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function suscribirseAReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(CONSULTA_REDUCED_MOTION)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function leerReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_REDUCED_MOTION).matches
}

function leerReducedMotionServidor(): boolean {
  return false
}

export default function MapInfraestructuraPage(props: { mostrarEnlaceNominal: boolean }) {
  const styles = useOverlayStyles()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  // Id del intervalo del pulso, para poder cancelarlo en el cleanup sin
  // depender de un closure que un StrictMode pueda re-ejecutar.
  const pulsoIntervalRef = useRef<number | null>(null)
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [filtrosForm, setFiltrosForm] = useState<FiltrosForm>(FILTROS_VACIOS)
  const [seleccionCue, setSeleccionCue] = useState<string | null>(null)
  // T1.3: panel izquierdo colapsable en pantallas angostas (<= 720px), donde
  // no hay ancho para la columna y el panel de controles a la vez. Arranca
  // cerrado; el botón toggle y el CSS de globals.css lo gobiernan.
  const [leftStackAbierto, setLeftStackAbierto] = useState(false)
  // F3.2/F3.3/F3.4: estado de los tres modales, deliberadamente separado del
  // estado de encuadre/filtros/capas de arriba. Cerrar cualquiera de los tres
  // sólo tiene que tocar SU propio estado — nunca `filtrosForm`,
  // `capasVisibles` ni el encuadre del mapa (MapGL no se remonta acá).
  const [nominalAfectacionId, setNominalAfectacionId] = useState<string | null>(null)
  const [historialCue, setHistorialCue] = useState<string | null>(null)
  const [capasVisibles, setCapasVisibles] = useState(CAPAS_VISIBLES_DEFECTO)
  // T1.1c: prefers-reduced-motion se lee con useSyncExternalStore (ver las
  // funciones de módulo de arriba) en vez de un estado seteado en un efecto:
  // es la forma sancionada por React de leer matchMedia, reacciona en vivo al
  // ajuste del sistema y no dispara react-hooks/set-state-in-effect. Con él,
  // el anillo estático de reduced-motion es un valor declarativo del paint de
  // la capa (ver el JSX del pulso), y el efecto de animación simplemente no
  // agenda ningún frame.
  const prefersReducedMotion = useSyncExternalStore(
    suscribirseAReducedMotion,
    leerReducedMotion,
    leerReducedMotionServidor,
  )
  const [departamentoHover, setDepartamentoHover] = useState<{
    nombre: string
    lng: number
    lat: number
  } | null>(null)
  // T1.1c: qué cueAnexo están dibujados AHORA como puntos individuales (no
  // agrupados) en `infra-partes-src`, recomputado cada vez que el mapa
  // termina de moverse o hacer zoom (onMoveEnd). El halo "sin reportar" y
  // los marcadores de evacuación sólo se pintan sobre puntos que el
  // clustering de supercluster dejó sueltos de verdad, sin adivinar por
  // umbral de zoom (que peca de off-by-one y no mostraba nada a zoom
  // provincial). `null` = todavía no computado: no se renderiza nada, el
  // mismo default conservador que tenía el gate viejo antes del primer
  // onLoad.
  const [cuesNoAgrupados, setCuesNoAgrupados] = useState<Set<string> | null>(null)

  const filtros = useMemo(
    () => ({
      territorio: filtrosForm.territorio || undefined,
      nivel: filtrosForm.nivel || undefined,
      cueAnexo: filtrosForm.establecimiento || undefined,
      motivo: filtrosForm.motivo || undefined,
      severidad: filtrosForm.severidad || undefined,
      categoria:
        filtrosForm.categoria && esCategoria(filtrosForm.categoria)
          ? (filtrosForm.categoria as CategoriaAfectacion)
          : undefined,
      servicio: (filtrosForm.servicio || undefined) as EstadoServicioGeneral | undefined,
    }),
    [filtrosForm],
  )

  const { data, loading, error } = useAlertas(filtros)

  // Un punto por escuela: la ficha y la lista seleccionan por cueAnexo, no
  // hace falta una agrupación intermedia como la que existía cuando un mismo
  // cue podía tener features en dos capas distintas.
  const partesPorCue = useMemo(() => {
    const map = new Map<string, ParteMapa>()
    for (const parte of data?.partes ?? []) map.set(parte.cueAnexo, parte)
    return map
  }, [data])

  // F2.3: `Date.now()` es impuro, así que no puede llamarse durante el
  // render (regla react-hooks/purity) — se toma en un efecto, disparado por
  // cada respuesta nueva de useAlertas, no en cada render (p. ej. mover el
  // mouse no debe recalcular ni parpadear el halo). Antes de que corra el
  // primer efecto, `ahoraMs` es null y el halo simplemente no dibuja nada
  // (mejor eso que fechar con un valor inventado).
  const [ahoraMs, setAhoraMs] = useState<number | null>(null)
  useEffect(() => {
    const id = setTimeout(() => setAhoraMs(Date.now()), 0)
    return () => clearTimeout(id)
  }, [data])

  const featureCollection = useMemo(
    () => construirFeatureCollection(data?.partes ?? [], ahoraMs),
    [data, ahoraMs],
  )

  // T1.1b: hay algo severo (Alta/Crítica) en la colección YA desagrupada
  // (antes de clusterizar). Si no lo hay no hay nada que animar y el efecto
  // de pulso no agenda frames.
  const haySeveroEnVista = useMemo(
    () => featureCollection.features.some((feature) => feature.properties.esSevero),
    [featureCollection],
  )

  const partesEvacuacion = useMemo(
    () =>
      (data?.partes ?? []).filter(
        (parte) =>
          parte.lat !== null &&
          parte.lon !== null &&
          (parte.estadoEstablecimiento === 'evacuado' ||
            parte.estadoEstablecimiento === 'centro_evacuados'),
      ),
    [data],
  )

  // F2.4: el GeoJSON de departamentos se pide una vez más, aparte del que ya
  // pide <Source> por URL, porque <Source> no expone sus features parseadas
  // de vuelta a React — sólo así se puede cruzar contra `data.partes` en el
  // cliente. Es la misma decisión que documenta la tarea: son 25 polígonos y
  // ~44 KB, pedirlos dos veces (uno cacheado por el browser) es barato al
  // lado de duplicar esa lógica de join en el servidor.
  const [departamentosRaw, setDepartamentosRaw] = useState<FeatureCollection<
    Polygon | MultiPolygon,
    { nombre: string }
  > | null>(null)

  useEffect(() => {
    let cancelado = false
    fetch(DEPARTAMENTOS_URL)
      .then((respuesta) => respuesta.json())
      .then((geojson: FeatureCollection<Polygon | MultiPolygon, { nombre: string }>) => {
        if (!cancelado) setDepartamentosRaw(geojson)
      })
      .catch(() => {
        // Si falla, <Source> igual pinta el GeoJSON por URL con el relleno
        // en su piso de opacidad (ver coalesce en fillPaintDepartamentos):
        // se pierde el coroplético, no el contexto geográfico de base.
      })
    return () => {
      cancelado = true
    }
  }, [])

  // T1.1c: la preferencia de reduced-motion ya no se guarda en estado (ver el
  // useSyncExternalStore de arriba); `matchMedia` puede no existir (p. ej.
  // jsdom en los tests), y sin él leerReducedMotion devuelve false — se trata
  // como "no reduced" (el anillo estático no se muestra; el loop se corre con
  // sus guards, inofensivo donde el mapa no está).

  // Pulso de severidad alta/crítica (T1.1, T1.1b, T1.1c). Con reduced-motion, o sin
  // la capa de escuelas visible, o sin nada severo en los datos actuales, no
  // se agenda ningún timer — el anillo estático de reduced-motion ya lo
  // resuelve el paint declarativo de la capa. Antes esto era un loop de
  // requestAnimationFrame que llamaba setPaintProperty en CADA frame (~200
  // ticks/seg y ~400 setPaintProperty/seg medidos, incluso con el mapa
  // completamente quieto). Ahora el efecto alterna entre DOS ESTADOS de paint
  // (radio base con opacidad 0.5, y radio base + expansión con opacidad 0)
  // una vez por DURACION_PULSO_MS vía window.setInterval, y las transiciones
  // `circle-radius-transition`/`circle-opacity-transition` de la propia capa
  // (agregadas en el paint de infra-partes-pulso) interpolan suavemente entre
  // un estado y el otro en el compositor — la animación la hace MapLibre, no
  // este efecto. Eso baja los setPaintProperty de ~400/seg a 2 llamadas cada
  // 1.6s. Nota: cambia levemente el carácter visual del pulso — ahora
  // respira de ida y vuelta (crece y encoge, continuo) vía la transición, en
  // vez del diente de sierra viejo (crece y se reinicia al instante) que
  // producía la interpolación cruda por frame; sigue siendo un pulso
  // repetido, sólo más suave y muchísimo más barato.
  useEffect(() => {
    const capaPulso = CAPA_PARTES_PULSO_ID
    if (prefersReducedMotion || !capasVisibles.escuelas || !haySeveroEnVista) {
      // Reduced motion ya se resuelve en el paint declarativo de la capa
      // (ver arriba); sin la capa de escuelas visible o sin nada severo en
      // los datos actuales no hay nada que animar - no se agenda ningún
      // timer.
      return
    }
    let expandido = false
    function aplicarEstadoPulso() {
      const mapa = mapRef.current?.getMap()
      if (!mapa?.getLayer(capaPulso)) return
      const radio = expandido
        ? (['+', expresionRadioBasePulso(), ['-', ['get', 'radioMaxPulso'], RADIO_DOT_BASE]] as unknown as DataDrivenPropertyValueSpecification<number>)
        : expresionRadioBasePulso()
      mapa.setPaintProperty(capaPulso, 'circle-radius', radio)
      mapa.setPaintProperty(capaPulso, 'circle-opacity', expandido ? 0 : 0.5)
      expandido = !expandido
    }
    aplicarEstadoPulso()
    pulsoIntervalRef.current = window.setInterval(aplicarEstadoPulso, DURACION_PULSO_MS)

    // No tiene sentido seguir animando una pestaña que nadie está mirando:
    // se limpia el intervalo al ocultarse y se rearma al volver a verse.
    function manejarVisibilidad() {
      if (pulsoIntervalRef.current !== null) {
        window.clearInterval(pulsoIntervalRef.current)
        pulsoIntervalRef.current = null
      }
      if (!document.hidden) {
        aplicarEstadoPulso()
        pulsoIntervalRef.current = window.setInterval(aplicarEstadoPulso, DURACION_PULSO_MS)
      }
    }
    document.addEventListener('visibilitychange', manejarVisibilidad)

    return () => {
      if (pulsoIntervalRef.current !== null) {
        window.clearInterval(pulsoIntervalRef.current)
        pulsoIntervalRef.current = null
      }
      document.removeEventListener('visibilitychange', manejarVisibilidad)
    }
  }, [prefersReducedMotion, capasVisibles.escuelas, haySeveroEnVista])

  const { departamentosGeojson, departamentosSinMatch } = useMemo(() => {
    if (!departamentosRaw) return { departamentosGeojson: null, departamentosSinMatch: [] as string[] }

    const nombresConocidos = departamentosRaw.features.map((f) => f.properties.nombre)
    const escuelas = (data?.partes ?? []).map((parte) => ({
      departamento: parte.departamento,
      servicio: parte.servicio,
    }))
    const { escuelasCaidasPorDepartamento, departamentosSinMatch: sinMatch } =
      agregarEscuelasCaidasPorDepartamento(escuelas, nombresConocidos)

    // "Un departamento que no matchee no se silencia": además del warning en
    // consola (visible para quien opera/depura), sinMatch viaja como prop a
    // InfraLegendPanel para que también sea visible en la interfaz.
    if (sinMatch.length > 0) {
      console.error(
        '[mapa-infraestructura] departamento(s) sin match contra el GeoJSON:',
        sinMatch,
      )
    }

    const features = departamentosRaw.features.map((feature) => {
      const clave = normalizarNombreDepartamento(feature.properties.nombre)
      const escuelasCaidas = escuelasCaidasPorDepartamento.get(clave) ?? 0
      return {
        ...feature,
        properties: {
          ...feature.properties,
          escuelasCaidas,
          nombreMayus: feature.properties.nombre.toUpperCase(),
        },
      }
    })

    return {
      departamentosGeojson: { type: 'FeatureCollection' as const, features },
      departamentosSinMatch: sinMatch,
    }
  }, [departamentosRaw, data])

  const mapStyle = BASEMAPS[basemap].styleUrl
  // F3.2: ya no hace falta la coordenada del punto seleccionado (era sólo
  // para anclar el Popup de MapLibre); el modal no depende de la posición
  // del punto en el mapa.
  const parteSeleccionado = seleccionCue ? (partesPorCue.get(seleccionCue) ?? null) : null

  // T1.1: el cluster también es clickeable (zoom de expansión); las capas
  // "sin reportar"/pulso no lo son.
  const capasInteractivas = capasVisibles.escuelas
    ? [CAPA_PARTES_ID, CAPA_PARTES_CLUSTER_ID]
    : []

  // Click en un cluster (T1.1): no hay cueAnexo — un cluster es un agregado
  // de puntos, no una escuela — así que en vez de abrir la ficha se hace
  // zoom al nivel de expansión que calcula supercluster, y el usuario vuelve
  // a clickear con el mapa ya acercado. El guard por id de capa (no por
  // propiedades) evita confundirse con el click de una escuela.
  async function acercarAlCluster(feature: MapGeoJSONFeature): Promise<void> {
    const mapa = mapRef.current?.getMap()
    if (!mapa) return
    try {
      const source = mapa.getSource('infra-partes-src') as GeoJSONSource | undefined
      const clusterId = Number(feature.properties?.cluster_id)
      const coords = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null
      if (!source || !Number.isFinite(clusterId) || !coords) return
      const zoom = await source.getClusterExpansionZoom(clusterId)
      mapa.easeTo({ center: [coords[0], coords[1]], zoom })
    } catch {
      // Cualquier fallo (fuente todavía cargando, supercluster no listo) es
      // ruido transitorio: mejor no hacer nada que romper el flujo del mapa.
    }
  }

  function handleClick(event: MapLayerMouseEvent) {
    const feature = (event.features ?? [])[0]
    if (!feature || !feature.properties) {
      setSeleccionCue(null)
      return
    }
    if (feature.layer?.id === CAPA_PARTES_CLUSTER_ID) {
      void acercarAlCluster(feature)
      return
    }
    setSeleccionCue(String(feature.properties.cueAnexo))
  }

  // queryRenderedFeatures en vez de sumar la capa a interactiveLayerIds: si
  // el relleno departamental fuera interactivo, un click sobre el mapa vacío
  // devolvería un feature sin cueAnexo y handleClick seleccionaría "undefined".
  function handleMouseMove(event: MapLayerMouseEvent) {
    const mapa = mapRef.current
    if (!mapa) return
    const [encontrado] = mapa.queryRenderedFeatures(event.point, {
      layers: [CAPA_DEPARTAMENTOS_RELLENO_ID],
    })
    const nombre = encontrado?.properties?.nombre
    if (typeof nombre !== 'string') {
      setDepartamentoHover((prev) => (prev === null ? prev : null))
      return
    }
    setDepartamentoHover({ nombre, lng: event.lngLat.lng, lat: event.lngLat.lat })
  }

  // T1.1c: lee del mapa (querySourceFeatures) qué features de
  // `infra-partes-src` están actualmente DESAGRUPADAS y guarda sus cueAnexo.
  // querySourceFeatures sin filtro de capa devuelve las features fuente como
  // las ve el clustering actual de supercluster: un punto individual no
  // tiene `point_count`, un cluster sí. Un Set vacío es válido (no hay
  // puntos sueltos); `null` es "aún no calculado" y se traduce en no
  // renderizar nada. Como todo Set se recrea, `setCuesNoAgrupados` siempre
  // dispara re-render — inofensivo acá, es el estado derivado del mapa.
  function actualizarCuesNoAgrupados() {
    const mapa = mapRef.current?.getMap()
    if (!mapa || !mapa.getSource('infra-partes-src')) return
    const features = mapa.querySourceFeatures('infra-partes-src', {
      filter: ['!', ['has', 'point_count']],
    })
    setCuesNoAgrupados(new Set(features.map((feature) => String(feature.properties?.cueAnexo))))
  }

  // Seleccionar una escuela desde la lista también cierra el cajón angosto:
  // así el mapa/ficha vuelve a ser visible en vez de seguir mostrando el panel.
  function seleccionarDesdeLista(cueAnexo: string) {
    setSeleccionCue(cueAnexo)
    setLeftStackAbierto(false)
  }

  function alternarCapa(capa: CapaInfraestructura, value: boolean) {
    setCapasVisibles((prev) => ({ ...prev, [capa]: value }))
  }

  function setFiltro<K extends keyof FiltrosForm>(campo: K, valor: FiltrosForm[K]) {
    setFiltrosForm((prev) => ({ ...prev, [campo]: valor }))
  }

  if (error && !data) {
    return (
      <div className={`${styles.status} ${styles.statusError}`}>{error}</div>
    )
  }

  return (
    <div className={styles.shell} ref={shellRef}>
      <div className={styles.mapRoot}>
        <MapGL
          ref={mapRef}
          mapStyle={mapStyle}
          // Encuadre inicial ajustado a la provincia. MAP_CENTER/MAP_ZOOM son
          // los del mapa de matrícula y dejaban a Corrientes descentrada y
          // demasiado cerca; acá el encuadre sale del bbox real del GeoJSON.
          initialViewState={{
            bounds: LIMITES_CORRIENTES,
            fitBoundsOptions: { padding: 24 },
          }}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={capasInteractivas}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setDepartamentoHover(null)}
          cursor="pointer"
          onLoad={actualizarCuesNoAgrupados}
          onMoveEnd={actualizarCuesNoAgrupados}
        >
          <NavigationControl position="top-left" />

          <Source id="infra-mascara-src" type="geojson" data={MASCARA_URL}>
            <Layer id={CAPA_MASCARA_ID} type="fill" paint={fillPaintMascara()} />
          </Source>

          {/*
            F2.4: `data` pasa a ser el GeoJSON ya cruzado con `escuelasCaidas`
            (departamentosGeojson) apenas termina de resolverse el fetch +
            useMemo; hasta entonces cae a la URL, igual que antes — el
            coalesce de fillPaintDepartamentos cubre ese instante sin
            propiedad.
          */}
          <Source
            id="infra-departamentos-src"
            type="geojson"
            data={departamentosGeojson ?? DEPARTAMENTOS_URL}
          >
            <Layer
              id={CAPA_DEPARTAMENTOS_RELLENO_ID}
              type="fill"
              paint={fillPaintDepartamentos()}
            />
            <Layer
              id={CAPA_DEPARTAMENTOS_BORDE_ID}
              type="line"
              paint={linePaintDepartamentos()}
            />
            <Layer
              id={CAPA_DEPARTAMENTO_HOVER_ID}
              type="fill"
              paint={fillPaintDepartamentoHover()}
              filter={['==', ['get', 'nombre'], departamentoHover?.nombre ?? '']}
            />
            <Layer
              id={CAPA_DEPARTAMENTO_HOVER_BORDE_ID}
              type="line"
              paint={linePaintDepartamentoHover()}
              filter={['==', ['get', 'nombre'], departamentoHover?.nombre ?? '']}
            />
            <Layer
              id="infra-departamentos-etiqueta"
              type="symbol"
              layout={symbolLayoutDepartamentos()}
              paint={symbolPaintDepartamentos()}
            />
          </Source>

          {capasVisibles.escuelas && (
            <Source
              id="infra-partes-src"
              type="geojson"
              data={featureCollection}
              cluster={true}
              clusterMaxZoom={CAPA_PARTES_CLUSTER_MAX_ZOOM}
              clusterRadius={40}
              clusterProperties={{
                // T1.1b: agregados por max() entre los puntos agrupados — el
                // cluster hereda la severidad y el radio de pulso de su punto
                // MÁS severo, no un promedio.
                severidadRango: ['max', ['get', 'severidadRango']],
                radioMaxPulso: ['max', ['get', 'radioMaxPulso']],
                // T1.1c: en el cluster `sinReportar` se agrega como 0/1 con
                // max() — el cluster vale 1 si AL MENOS UNO de sus puntos
                // está sin reportar (semántica OR), a diferencia de los
                // puntos individuales donde sigue siendo un booleano real.
                sinReportar: ['max', ['case', ['get', 'sinReportar'], 1, 0]],
                // En el cluster `esEvacuado` se agrega como 0/1 con max() —
                // el cluster vale 1 si AL MENOS UNO de sus puntos es un
                // establecimiento evacuado/centro de evacuados (semántica
                // OR), igual que `sinReportar`.
                esEvacuado: ['max', ['case', ['get', 'esEvacuado'], 1, 0]],
              }}
            >
              {/*
                Sin reportar (T1.1c): el halo y el anillo de cluster viven
                DENTRO de la fuente clusterizada, no en una fuente aparte con
                un gate de zoom — así sólo se dibujan sobre features que están
                REALMENTE desagrupadas/clusterizadas en este instante (sin
                adivinar umbrales ni sufrir su off-by-one). El halo rodea los
                puntos individuales sin reportar; el anillo de cluster da
                feedback a zoom bajo de que una burbuja contiene al menos una
                escuela sin reportar, arreglando que tildar "Sin reportar" no
                hiciera nada en la vista provincial por defecto. Van primeros
                en el árbol del source para quedar debajo de todo.
              */}
              {/* react-map-gl's Source no detecta Layer hijos a través de un
                  Fragment: cada uno necesita su propio condicional. */}
              {capasVisibles.sinReportar && (
                <Layer
                  id={CAPA_SIN_REPORTAR_ID}
                  type="circle"
                  filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'sinReportar'], true]]}
                  paint={circlePaintSinReportar()}
                />
              )}
              {capasVisibles.sinReportar && (
                <Layer
                  id={CAPA_SIN_REPORTAR_CLUSTER_ID}
                  type="circle"
                  filter={['all', ['has', 'point_count'], ['==', ['get', 'sinReportar'], 1]]}
                  paint={{
                    'circle-radius': ['+', expresionRadioCluster(), SIN_REPORTAR_RADIO_EXTRA] as unknown as DataDrivenPropertyValueSpecification<number>,
                    'circle-color': 'transparent',
                    'circle-stroke-color': SIN_REPORTAR_COLOR,
                    'circle-stroke-width': 2,
                    'circle-stroke-opacity': 0.65,
                  }}
                />
              )}
              {/*
                Evacuado: anillo de cluster que da feedback a zoom bajo de que
                una burbuja contiene al menos una escuela en estado
                evacuado/centro_evacuados, espejando el anillo de cluster "sin
                reportar" pero keyed off `esEvacuado` y gobernado por el
                toggle de la capa `evacuacion` en vez del de `sinReportar`. Usa
                el MISMO ANILLO_COLOR neutro que los marcadores individuales de
                evacuación (cuadrado/triángulo), no SIN_REPORTAR_COLOR: es una
                señal distinta.
              */}
              {capasVisibles.evacuacion && (
                <Layer
                  id={CAPA_EVACUADO_CLUSTER_ID}
                  type="circle"
                  filter={['all', ['has', 'point_count'], ['==', ['get', 'esEvacuado'], 1]]}
                  paint={{
                    'circle-radius': ['+', expresionRadioCluster(), EVACUADO_RADIO_EXTRA] as unknown as DataDrivenPropertyValueSpecification<number>,
                    'circle-color': 'transparent',
                    'circle-stroke-color': ANILLO_COLOR,
                    'circle-stroke-width': 2,
                    'circle-stroke-opacity': 0.65,
                  }}
                />
              )}
              {/*
                Pulso (T1.1, T1.1c): va DEBAJO del punto para que se lea como
                un anillo que se expande alrededor, no como algo que lo tapa.
                Filtra las no agrupadas con esSevero y, desde T1.1b, también
                los clusters cuya severidad agregada es Alta o superior
                (2 = rangoSeveridad('Alta'); los clusters agregan la
                propiedad vía clusterProperties, ver el Source arriba). El
                radio base declarado acá es una expresión por feature
                (expresionRadioBasePulso): parte del radio del cluster cuando
                es un agregado y de RADIO_DOT_BASE cuando es un punto, para
                que el anillo de un cluster crezca por fuera de su círculo en
                vez de empezar debajo de él. El radio/opacidad los maneja el
                efecto de animación más abajo vía setPaintProperty (y
                prefersReducedMotion, resuelto con useSyncExternalStore).
                Las transiciones circle-radius-transition /
                circle-opacity-transition le dicen a MapLibre que interpole
                suavemente cualquier cambio en circle-radius/circle-opacity
                a lo largo de un ciclo de pulso completo, en el hilo del
                compositor — por eso el efecto de animación de abajo sólo
                necesita llamar setPaintProperty una vez por medio ciclo, no
                una vez por cada tick de requestAnimationFrame.
              */}
              <Layer
                id={CAPA_PARTES_PULSO_ID}
                type="circle"
                filter={[
                  'any',
                  ['all', ['!', ['has', 'point_count']], ['==', ['get', 'esSevero'], true]],
                  ['all', ['has', 'point_count'], ['>=', ['get', 'severidadRango'], 2]],
                ]}
                paint={{
                  'circle-color': colorPorSeveridadRango(),
                  'circle-stroke-width': 0,
                  'circle-radius': prefersReducedMotion
                    ? (['+', expresionRadioBasePulso(), 4] as unknown as DataDrivenPropertyValueSpecification<number>)
                    : expresionRadioBasePulso(),
                  'circle-radius-transition': { duration: DURACION_PULSO_MS, delay: 0 },
                  'circle-opacity': prefersReducedMotion ? 0.25 : 0,
                  'circle-opacity-transition': { duration: DURACION_PULSO_MS, delay: 0 },
                }}
              />
              <Layer
                id={CAPA_PARTES_ID}
                type="circle"
                filter={['!', ['has', 'point_count']]}
                paint={circlePaintPartes()}
              />
              {/*
                Clusters (T1.1b): el color ya no es un gris neutro fijo — los
                clusters pintan del color de la severidad MÁS ALTA presente
                entre las escuelas agrupadas, leída del agregado
                `severidadRango` de clusterProperties (max). Promediar las
                severidades inventaría un color que no está en la escala y
                ocultaría el peor caso, que es lo que importa en una
                emergencia. El tamaño del círculo sube por tramos con el
                conteo (más escuelas agrupadas = círculo más grande).
              */}
              <Layer
                id={CAPA_PARTES_CLUSTER_ID}
                type="circle"
                filter={['has', 'point_count']}
                paint={{
                  'circle-color': colorPorSeveridadRango(),
                  'circle-radius': expresionRadioCluster(),
                  'circle-stroke-color': '#1c1c1c',
                  'circle-stroke-width': 1,
                }}
              />
              <Layer
                id={CAPA_PARTES_CLUSTER_COUNT_ID}
                type="symbol"
                filter={['has', 'point_count']}
                layout={{
                  'text-field': ['get', 'point_count_abbreviated'],
                  'text-size': 12,
                  // Misma fuente que el resto de los símbolos del mapa (ver
                  // map-view.tsx); no se inventa una nueva.
                  'text-font': ['Noto Sans Regular'],
                  'text-allow-overlap': false,
                }}
                paint={{ 'text-color': '#ffffff' }}
              />
            </Source>
          )}

          {capasVisibles.evacuacion &&
            cuesNoAgrupados !== null &&
            partesEvacuacion
              .filter((parte) => cuesNoAgrupados.has(parte.cueAnexo))
              .map((parte) => (
                <Marker
                  key={parte.cueAnexo}
                  longitude={parte.lon as number}
                  latitude={parte.lat as number}
                  anchor="bottom-left"
                  offset={[SIMBOLO_EVACUACION_TAMANO / 2, -RADIO_DOT_BASE]}
                >
                  <div
                    data-capa={CAPA_EVACUACION_ID}
                    style={
                      parte.estadoEstablecimiento === 'evacuado'
                        ? estiloSimboloEvacuado()
                        : estiloSimboloCentroEvacuados()
                    }
                  />
                </Marker>
              ))}

          {departamentoHover && (
            <Popup
              longitude={departamentoHover.lng}
              latitude={departamentoHover.lat}
              anchor="bottom"
              offset={14}
              closeButton={false}
              closeOnClick={false}
              className="mapa-tooltip-departamento"
            >
              {departamentoHover.nombre}
            </Popup>
          )}

        </MapGL>
      </div>

      {/*
        F3.2: la ficha pasó de Popup de MapLibre (flotante, atado al punto,
        se cerraba solo con closeOnClick) a un modal de verdad. `open` deriva
        de `seleccionCue`, así que seguir clickeando otro punto mientras el
        modal está abierto lo mantiene abierto con el nuevo cue (la `key`
        adentro de FichaParteModal fuerza el remontaje del contenido).
      */}
      <FichaParteModal
        cueAnexo={seleccionCue ?? ''}
        open={seleccionCue !== null}
        onOpenChange={(next) => !next && setSeleccionCue(null)}
        parteResumen={parteSeleccionado}
        mostrarEnlaceNominal={props.mostrarEnlaceNominal}
        onVerAlumnosAlcanzados={setNominalAfectacionId}
        onVerHistorialCompleto={() => setHistorialCue(seleccionCue)}
      />

      <AlcanceNominalModal
        afectacionId={nominalAfectacionId}
        onOpenChange={(open) => !open && setNominalAfectacionId(null)}
      />

      <HistorialParteModal
        cueAnexo={historialCue}
        onOpenChange={(open) => !open && setHistorialCue(null)}
      />

      {/*
        Los tres paneles de la izquierda van en un contenedor propio y no
        sueltos. Cada uno traía su propio `position: absolute` con el mismo
        offset heredado del mapa de matrícula, que muestra un panel por
        esquina; acá son tres y terminaban apilados uno encima del otro,
        tapándose entre sí y tapando el control de zoom. El anclaje ahora vive
        en .map-left-stack y los paneles vuelven al flujo normal.
      */}
      {data && (
        <div className={styles.leftStack} id="infra-left-stack" data-open={leftStackAbierto ? 'true' : 'false'}>
          <Indicadores indicadores={data.indicadores} loading={loading} />
          <ListaAlertas
            partes={data.partes}
            filtros={filtrosForm}
            onFiltroChange={setFiltro}
            seleccionadaCue={seleccionCue}
            onSeleccionar={seleccionarDesdeLista}
          />
          <InfraLegendPanel departamentosSinMatch={departamentosSinMatch} />
        </div>
      )}

      <button
        type="button"
        className={styles.leftStackToggle}
        onClick={() => setLeftStackAbierto((abierto) => !abierto)}
        aria-expanded={leftStackAbierto}
        aria-controls="infra-left-stack"
      >
        {leftStackAbierto ? 'Cerrar' : 'Escuelas y filtros'}
      </button>

      <div className={styles.controlsStack}>
        <BasemapControl value={basemap} onChange={setBasemap} />
        <InfraLayerControl capas={capasVisibles} onChange={alternarCapa} />
      </div>

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
