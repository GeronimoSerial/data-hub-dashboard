'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { EscuelaSearchBox } from '@/components/mapas/escuela-search-box'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { Button } from '@/components/ui/button'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Indicadores } from '@/components/infraestructura/indicadores'
import { ListaAlertas } from '@/components/infraestructura/lista-alertas'
import { FichaParteModal } from '@/components/infraestructura/ficha-parte-modal'
import { AlcanceNominalModal } from '@/components/infraestructura/alcance-nominal-modal'
import { HistorialParteModal } from '@/components/infraestructura/historial-parte-modal'
import {
  InfraLayerControl,
  RadarLayerControl,
  type CapaInfraestructura,
  type CapaRadar,
} from '@/components/mapas/layer-control'
import { InfraLegendPanel } from '@/components/mapas/legend-panel'
import { SelectorHorizonte, type HorizonteRadar } from '@/components/mapas/selector-horizonte'
import { RiskExplanationPanel } from '@/components/mapas/risk-explanation-panel'
import { useRadar } from '@/lib/infraestructura/use-radar'
import { useRiesgoSnapshot } from '@/lib/infraestructura/use-riesgo-snapshot'
import { useTendenciaEstacional } from '@/lib/infraestructura/use-tendencia-estacional'
import { generarBriefing } from '@/lib/infraestructura/riesgo/briefing'
import { ETIQUETA_TIPO_FACTOR, etiqueta } from '@/lib/infraestructura/riesgo/etiquetas'
import {
  construirCoropletaPeligro,
  construirPuntosRiesgo,
  paintCoropletaPeligro,
  paintPuntosRiesgo,
  type NivelPorDepartamento,
  type RiesgoEscuela,
} from '@/lib/mapas/peligro-capas'
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
import { filtrarDepartamentoMapa } from '@/lib/infraestructura/filtrar-departamento-mapa'
import { useEscuelasMapa } from '@/lib/infraestructura/use-escuelas-mapa'
import { useTotalesMapa } from '@/lib/infraestructura/use-totales-mapa'
import type { TotalesDepartamento } from '@/lib/infraestructura/totales-mapa'
import { filtrarDepartamentoEscuelasMapa } from '@/lib/infraestructura/filtrar-departamento-escuelas-mapa'
import { construirEscuelasMapaFeatureCollection, COLOR_SIN_AFECTACION } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'
import type { EscuelaMapa, ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { UMBRAL_SIN_REPORTAR_HORAS } from '@/lib/infraestructura/umbrales'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { esCategoria, type CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import {
  RADIO_DOT_BASE,
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

// Los clusters de supercluster tienen ids propios para distinguir el click
// de un agregado del click de una escuela.
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
export const SIN_REPORTAR_RADIO_EXTRA = 6

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

// ── Modo Radar (E4) ─────────────────────────────────────────────────────────
//
// IDs PROPIOS para no pisar jamás la capa de "escuelas caídas" ni el coroplético
// de departamentos existente: la coropleta de peligro es una fuente/layer NUEVA
// montada ENCIMA (misma geometría departamental, otro relleno) y los puntos de
// riesgo viven en una fuente aparte. Si no fuera una fuente nueva, `Source` de
// react-map-gl no permitiría dos `data` distintos para el mismo id.
const CAPA_PELIGRO_FILL_ID = 'infra-peligro-fill'
const CAPA_RIESGO_CIRCLE_ID = 'infra-riesgo-circle'

// Puntos de riesgo: círculo RELLENO con un halo (stroke) más ancho que el de
// "afectación confirmada", para que ambas señales se lean juntas cuando la
// misma escuela tiene las dos. Regla de aceptación del batch: "una escuela con
// ambas señales muestra ambas, nunca se fusionan" — el color de relleno viene
// de `paintPuntosRiesgo` (paleta de peligro) y el halo se resuelve acá en la
// integración, no en el módulo puro.
const RADIO_PUNTO_RIESGO_BASE = 7
const RADIO_HALO_RIESGO_EXTRA = 5

function circlePaintRiesgo(): CircleLayerSpecification['paint'] {
  return {
    ...paintPuntosRiesgo(),
    'circle-radius': RADIO_PUNTO_RIESGO_BASE,
    'circle-opacity': 0.85,
    'circle-stroke-color': '#1c1c1c',
    'circle-stroke-width': 2,
    'circle-stroke-opacity': 0.9,
  }
}

// Halo distintivo del riesgo: anillo SIN relleno alrededor del punto, para
// separarlo visualmente de la forma de "afectación confirmada" (que tiene
// relleno por severidad y anillo por servicio). El halo no toca ninguno de
// esos dos canales: es sólo un contorno extra.
export function circlePaintHaloRiesgo(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': RADIO_PUNTO_RIESGO_BASE + RADIO_HALO_RIESGO_EXTRA,
    'circle-color': 'transparent',
    'circle-stroke-color': '#1c1c1c',
    'circle-stroke-width': 1,
    'circle-stroke-opacity': 0.5,
  }
}

const CAPA_HALO_RIESGO_ID = 'infra-riesgo-halo'

// Etiqueta del conmutador de modo. `role=tablist` + `aria-pressed` sobre
// botones REALES: operable por teclado sin JS extra.
type ModoMapa = 'actual' | 'radar'

const CAPAS_RADAR_VISIBLES_DEFECTO: Record<CapaRadar, boolean> = {
  peligro: true,
  riesgo: true,
}

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
    'text-font': ['Noto Sans Regular'],
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
// variable terminaba tapando a sus vecinas a zoom bajo. El radio es fijo;
// el color informa la severidad y el anillo informa el estado del servicio.

// Anillo: color NEUTRO (el color ya está tomado por severidad, no se puede
// reusar acá sin generar una segunda escala). "suspendido" y "parcial" se
// distinguen por grosor + opacidad de trazo, no por color: MapLibre no
// soporta circle-stroke-dasharray, así que un trazo punteado real no es una
// opción. A zoom provincial un anillo grueso y sólido se distingue de uno
// fino y traslúcido incluso con varios puntos superpuestos; "normal" queda
// con el mismo trazo mínimo que ya traía el punto (línea de separación con
// el fondo), que a esa distancia se lee como "sin anillo".
const ANILLO_COLOR = '#1c1c1c'

// El color del cluster es el de la severidad MÁS ALTA entre sus puntos,
// leída del agregado `severidadRango` que calcula clusterProperties (max). Es
// una expresión 'case' sobre SEVERIDADES en su orden real — lee el rango de
// mayor a menor: si algún punto agrupado es Crítica (>=3) pinta Crítica, si
// no el mayor es Alta (>=2), y así hasta Baja (default).
//
// Antes de mirar la severidad se chequea `escuelasAfectadas === 0`: un cluster
// que agrupa SÓLO escuelas sin afectación reportada (severidadRango = 0, el
// mismo 0 que 'Baja') se pinta con el gris neutro COLOR_SIN_AFECTACION, nunca
// con una severidad real. Sólo si hay al menos una afectada se usa la
// severidad más alta (`severidadRango`, agregado por max).
export function colorPorSeveridadRango(): DataDrivenPropertyValueSpecification<string> {
  const expresion: unknown[] = ['case', ['==', ['get', 'escuelasAfectadas'], 0], COLOR_SIN_AFECTACION]
  for (let i = SEVERIDADES.length - 1; i >= 1; i--) {
    expresion.push(['>=', ['get', 'severidadRango'], i], colorSeveridad(SEVERIDADES[i]))
  }
  expresion.push(colorSeveridad(SEVERIDADES[0]))
  return expresion as unknown as DataDrivenPropertyValueSpecification<string>
}

// El radio del cluster sube por tramos con la cantidad de escuelas.
export const RADIO_CLUSTER_MENOR = 16
export const RADIO_CLUSTER_MEDIO = 22
export const RADIO_CLUSTER_MAYOR = 28

export function expresionRadioCluster(): DataDrivenPropertyValueSpecification<number> {
  return ['step', ['get', 'point_count'], RADIO_CLUSTER_MENOR, 10, RADIO_CLUSTER_MEDIO, 50, RADIO_CLUSTER_MAYOR] as unknown as DataDrivenPropertyValueSpecification<number>
}

export function circlePaintPartes(): CircleLayerSpecification['paint'] {
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
  // Etiqueta cruda para la ficha y rango numérico para el cluster.
  severidad: string
  severidadRango: number
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
export function construirFeatureCollection(
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
        severidadRango: rangoSeveridad(parte.peorSeveridad),
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
export function circlePaintSinReportar(): CircleLayerSpecification['paint'] {
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
export function esSinReportar(parte: ParteMapa, ahoraMs: number): boolean {
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
export default function MapInfraestructuraPage(props: {
  mostrarEnlaceNominal: boolean
  hazardContextEnabled?: boolean
  riskRadarEnabled?: boolean
  seasonalEnabled?: boolean
  visible?: boolean
}) {
  const styles = useOverlayStyles()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [filtrosForm, setFiltrosForm] = useState<FiltrosForm>(FILTROS_VACIOS)
  const [seleccionCue, setSeleccionCue] = useState<string | null>(null)
  // T1.3: panel izquierdo colapsable en pantallas angostas (<= 720px), donde
  // no hay ancho para la columna y el panel de controles a la vez. Arranca
  // cerrado; el botón toggle y el CSS de globals.css lo gobiernan.
  const [leftStackAbierto, setLeftStackAbierto] = useState(false)
  // Mismo patrón para el panel de base/capas (T1.3 extendido): en mobile tapaba
  // casi la mitad del mapa. Arranca cerrado y comparte el mismo cajón fijo a
  // pantalla completa; nunca se abre junto con leftStack (ver los onClick).
  const [controlsStackAbierto, setControlsStackAbierto] = useState(false)
  // F3.2/F3.3/F3.4: estado de los tres modales, deliberadamente separado del
  // estado de encuadre/filtros/capas de arriba. Cerrar cualquiera de los tres
  // sólo tiene que tocar SU propio estado — nunca `filtrosForm`,
  // `capasVisibles` ni el encuadre del mapa (MapGL no se remonta acá).
  const [nominalAfectacionId, setNominalAfectacionId] = useState<string | null>(null)
  const [historialCue, setHistorialCue] = useState<string | null>(null)
  const [capasVisibles, setCapasVisibles] = useState(CAPAS_VISIBLES_DEFECTO)
  const [departamentoSeleccionado, setDepartamentoSeleccionado] = useState<string | null>(null)
  const [departamentoHover, setDepartamentoHover] = useState<{ nombre: string; lng: number; lat: number } | null>(null)
  const [escuelaResaltada, setEscuelaResaltada] = useState<{ cueAnexo: string; lng: number; lat: number } | null>(null)
  const [puntosVisibles, setPuntosVisibles] = useState(true)
  const entradaPuntosPendiente = useRef(false)
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

  // ── Modo Radar (E4) ───────────────────────────────────────────────────────
  //
  // Todo el estado del radar es INDEPENDIENTE de los tres estados del modo
  // actual (seleccionCue / nominalAfectacionId / historialCue) y también de
  // `departamentoSeleccionado`: son dos modos distintos sobre el mismo mapa, y
  // mezclarlos haría que abrir una ficha de radar pisara el filtro de partes.
  // `modoRadar` arranca SIEMPRE en false ("Situación actual"), aun con el flag
  // prendido; el conmutador sólo es visible si `props.riskRadarEnabled`.
  const [modoRadar, setModoRadar] = useState(false)
  // `horizonteSeleccionado` incluye 'ahora' (cualitativo) además de 24|72|240.
  // Sólo los numéricos viajan a la API; 'ahora' no tiene evidencia y el hook
  // no manda query (ver use-radar.ts). Default 'ahora' = lo más inmediato.
  const [horizonteSeleccionado, setHorizonteSeleccionado] = useState<HorizonteRadar>('ahora')
  const [capasRadarVisibles, setCapasRadarVisibles] = useState(CAPAS_RADAR_VISIBLES_DEFECTO)
  // Selección del radar: estados propios, nunca reutilizan seleccionCue ni
  // departamentoSeleccionado (uno es por CUE de parte; estos son por CUE de
  // snapshot y por nombre de departamento del radar).
  const [cueRadarSeleccionado, setCueRadarSeleccionado] = useState<string | null>(null)
  const [departamentoRadarSeleccionado, setDepartamentoRadarSeleccionado] = useState<string | null>(null)

  // El hook SIEMPRE se llama (regla de hooks), pero sólo dispara request con
  // `activo` true — es decir, flag prendido Y modo Radar. En "Situación actual"
  // o con el flag apagado no hay fetch ni Source/Layer nuevos.
  const filtrosRadar = useMemo(
    () => ({
      horizonte:
        typeof horizonteSeleccionado === 'number' ? horizonteSeleccionado : undefined,
    }),
    [horizonteSeleccionado],
  )
  const radarActivo = (props.riskRadarEnabled ?? false) && modoRadar
  const { data: radarData, loading: radarLoading, error: radarError } = useRadar(
    filtrosRadar,
    radarActivo,
  )

  // Capa opcional SEASONAL (E5+, Off por defecto): sólo consulta cuando el
  // flag está prendido, estamos en modo Radar Y hay un departamento
  // seleccionado — nunca dispara sola con sólo el flag encendido.
  const seasonalActivo =
    (props.seasonalEnabled ?? false) && radarActivo && departamentoRadarSeleccionado !== null
  const { data: tendenciaEstacionalData } = useTendenciaEstacional(
    departamentoRadarSeleccionado,
    seasonalActivo,
  )

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

  const [ahoraMs, setAhoraMs] = useState<number | null>(null)
  useEffect(() => {
    const id = setTimeout(() => setAhoraMs(Date.now()), 0)
    return () => clearTimeout(id)
  }, [data])

  const { data: dataEscuelasMapa } = useEscuelasMapa(filtros)
  const { data: dataTotalesMapa } = useTotalesMapa(filtros)
  const totalesPorDepartamento = useMemo(() => {
    const mapa = new Map<string, TotalesDepartamento>()
    for (const d of dataTotalesMapa?.departamentos ?? []) mapa.set(d.departamento, d)
    return mapa
  }, [dataTotalesMapa])
  const dataEscuelasMapaVisible = useMemo(
    () => dataEscuelasMapa ? filtrarDepartamentoEscuelasMapa(dataEscuelasMapa, departamentoSeleccionado) : null,
    [dataEscuelasMapa, departamentoSeleccionado],
  )
  // Padrón completo (afectadas y sin afectación reportada), reemplaza a
  // featureCollection (que sólo tenía las afectadas) como fuente de la
  // capa de puntos. Requisito no negociable: el mapa muestra TODAS las
  // escuelas siempre, no depende de si hay partes cargados.
  const featureCollectionPadron = useMemo(
    () => construirEscuelasMapaFeatureCollection(dataEscuelasMapaVisible?.escuelas ?? [], ahoraMs),
    [dataEscuelasMapaVisible, ahoraMs],
  )

  // M1: al ocultar la pestaña (el mapa NO se desmonta, sólo queda oculto
  // con `hidden`), cortar cualquier flyTo en curso con `.stop()` para no
  // gastar rAF sobre un contenedor sin layout. Al volver a mostrarse,
  // `.resize()` + `.fitBounds()` corrigen el encuadre si MapLibre calculó
  // mal el tamaño mientras estaba oculto (mismo patrón que
  // map-natalidad-page.tsx en la rama main).
  useEffect(() => {
    const mapa = mapRef.current?.getMap()
    if (!mapa) return
    if (props.visible ?? true) {
      mapa.resize()
    } else {
      mapa.stop()
    }
  }, [props.visible])

  const dataVisible = useMemo(
    () => data ? filtrarDepartamentoMapa(data, departamentoSeleccionado, ahoraMs) : null,
    [data, departamentoSeleccionado, ahoraMs],
  )

  // Un punto por escuela: la ficha y la lista seleccionan por cueAnexo, no
  // hace falta una agrupación intermedia como la que existía cuando un mismo
  // cue podía tener features en dos capas distintas.
  const partesPorCue = useMemo(() => {
    const map = new Map<string, ParteMapa>()
    for (const parte of dataVisible?.partes ?? []) map.set(parte.cueAnexo, parte)
    return map
  }, [dataVisible])

  // F2.3: `Date.now()` es impuro, así que no puede llamarse durante el
  // render (regla react-hooks/purity) — se toma en un efecto, disparado por
  // cada respuesta nueva de useAlertas, no en cada render (p. ej. mover el
  // mouse no debe recalcular ni parpadear el halo). Antes de que corra el
  // primer efecto, `ahoraMs` es null y el halo simplemente no dibuja nada
  // (mejor eso que fechar con un valor inventado).
  const partesEvacuacion = useMemo(
    () =>
      (dataVisible?.partes ?? []).filter(
        (parte) =>
          parte.lat !== null &&
          parte.lon !== null &&
          (parte.estadoEstablecimiento === 'evacuado' ||
            parte.estadoEstablecimiento === 'centro_evacuados'),
      ),
    [dataVisible],
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

  // ── Datos derivados del radar (E4) ────────────────────────────────────────
  //
  // Horizontes con evidencia REAL: los que aparecen en las filas de
  // `data.departamentos` (peorNivel concreto) o en las escuelas del radar. Se
  // pasan a <SelectorHorizonte> para deshabilitar los que no tienen datos; el
  // selector siempre ofrece los 4 y el resto queda visible pero inactivo.
  const horizontesDisponibles = useMemo<HorizonteRadar[]>(() => {
    if (!radarData) return []
    const horas = new Set<number>()
    for (const fila of radarData.departamentos) {
      if (fila.peorNivel !== 'sin_dato') horas.add(fila.horizonteHoras)
    }
    for (const escuela of radarData.escuelas.items) horas.add(escuela.horizonteHoras)
    return ([24, 72, 240] as HorizonteRadar[]).filter(
      (h) => typeof h === 'number' && horas.has(h),
    )
  }, [radarData])

  // Coropleta de peligro: copia del MISMO `departamentosRaw` ya cargado (no se
  // duplica el fetch de DEPARTAMENTOS_URL). El radar entrega una fila por
  // (departamento, horizonte); el módulo puro documenta que hay que filtrar al
  // horizonte activo antes de cruzar. En 'ahora' no hay horizonte numérico:
  // todas las features quedan en 'sin_dato' y la capa pinta el gris neutro.
  const peligroGeojson = useMemo(() => {
    if (!departamentosRaw) return null
    const niveles: NivelPorDepartamento[] =
      typeof horizonteSeleccionado === 'number'
        ? (radarData?.departamentos ?? [])
            .filter((fila) => fila.horizonteHoras === horizonteSeleccionado)
            .map((fila) => ({
              departamento: fila.departamento,
              peorNivel: fila.peorNivel,
            }))
        : []
    return construirCoropletaPeligro(departamentosRaw, niveles)
  }, [departamentosRaw, radarData, horizonteSeleccionado])

  // Índice cueAnexo → riesgo de la página actual del radar, para cruzar contra
  // las coordenadas que YA existen en `partesPorCue`. Los puntos de riesgo
  // reutilizan la fuente de coordenadas del modo actual: no se inventa otra.
  const riesgoPorCue = useMemo(() => {
    const map = new Map<string, RiesgoEscuela>()
    for (const escuela of radarData?.escuelas.items ?? []) {
      map.set(escuela.cueAnexo, {
        nivelRiesgo: escuela.nivelRiesgo,
        confianza: escuela.confianza,
      })
    }
    return map
  }, [radarData])

  const escuelasConCoordenadas = useMemo(
    () =>
      (dataVisible?.partes ?? [])
        .filter((parte) => parte.lat !== null && parte.lon !== null)
        .map((parte) => ({
          cueAnexo: parte.cueAnexo,
          lat: parte.lat as number,
          lon: parte.lon as number,
        })),
    [dataVisible],
  )

  const puntosRiesgoGeojson = useMemo(
    () => construirPuntosRiesgo(escuelasConCoordenadas, riesgoPorCue),
    [escuelasConCoordenadas, riesgoPorCue],
  )

  // Briefing: `generarBriefing` necesita el run ANTERIOR y los conteos por
  // nivel, y la API sólo entrega el corte VIGENTE (no el anterior). GAP
  // documentado en el resumen: sin runAnterior se pasa null y el briefing
  // devuelve su línea de "primer corte disponible", que es un resultado
  // honesto, nunca una comparación inventada.
  const briefingLineas = useMemo(() => {
    if (!radarData?.corte) return []
    const conteosPorNivel = { actual: {} as Record<string, number>, anterior: null }
    for (const escuela of radarData.escuelas.items) {
      const nivel = escuela.nivelRiesgo ?? 'sin_dato'
      conteosPorNivel.actual[nivel] = (conteosPorNivel.actual[nivel] ?? 0) + 1
    }
    return generarBriefing(
      {
        id: radarData.corte.runId,
        cobertura: radarData.cobertura,
        publicadoEn: radarData.corte.publicadoEn,
      },
      null,
      conteosPorNivel,
    )
  }, [radarData])

  // Escuela de radar seleccionada (para el panel de explicación): se resuelve
  // del snapshot del radar, no de `partesPorCue` (el radar no siempre tiene un
  // parte vigente para el mismo CUE).
  const escuelaRadarSeleccionada = useMemo(
    () =>
      radarData?.escuelas.items.find((e) => e.cueAnexo === cueRadarSeleccionado) ?? null,
    [radarData, cueRadarSeleccionado],
  )

  // Follow-up 4 del Gate de E4: el detalle por factor (tipo, fuente, valor,
  // contribución, observado en) vive en `infra_risk_factor` y no lo trae
  // `/api/infraestructura/radar` — se pide aparte, por `snapshotId`, contra
  // `/api/infraestructura/riesgo/[snapshotId]` (mismo endpoint que ya usa
  // `/admin/riesgo`). Se llama siempre (regla de hooks) con `null` cuando no
  // hay escuela seleccionada; el hook no dispara ningún request en ese caso.
  const {
    data: snapshotDetalle,
    loading: snapshotLoading,
    error: snapshotError,
  } = useRiesgoSnapshot(escuelaRadarSeleccionada?.snapshotId ?? null)

  // Factores ya resueltos a la forma que espera el panel: la etiqueta legible
  // (`ETIQUETA_TIPO_FACTOR`, la misma que usa `/admin/riesgo`) se aplica acá
  // porque el panel no conoce el enum crudo (mismo criterio que el resto de
  // sus props). `undefined` mientras no llegó respuesta (el panel no inventa
  // "Sin dato" hasta que el fetch resolvió, aunque sea con 0 factores).
  const factoresPanel = useMemo(
    () =>
      snapshotDetalle?.factores.map((factor) => ({
        tipo: etiqueta(ETIQUETA_TIPO_FACTOR, factor.tipo),
        fuente: factor.fuente,
        valor: factor.valor,
        unidad: factor.unidad,
        contribucion: factor.contribucion,
        observadoEn: factor.observadoEn,
      })),
    [snapshotDetalle],
  )

  // Niveles por horizonte del departamento elegido en el radar, para el panel
  // de explicación. La API entrega el peor nivel por (departamento, horizonte),
  // pero NO el detalle de caudal/precipitación/base ensemble por departamento:
  // esos campos van a null y el panel los muestra como "No disponible" (gap
  // documentado, no bloquea la integración).
  const nivelesDepartamentoRadar = useMemo(() => {
    if (!radarData || departamentoRadarSeleccionado === null) return []
    return radarData.departamentos
      .filter((fila) => fila.departamento === departamentoRadarSeleccionado)
      .map((fila) => ({
        horizonteHoras: fila.horizonteHoras as 24 | 72 | 240,
        nivel: fila.peorNivel as 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'sin_dato',
        base: 'sin_dato' as const,
        precipitacionMm: null,
        percentilReferencia: null,
        emitidoEn: radarData.corte?.publicadoEn ?? '',
        validoHasta: radarData.corte?.publicadoEn ?? '',
      }))
  }, [radarData, departamentoRadarSeleccionado])

  const mapStyle = BASEMAPS[basemap].styleUrl
  // F3.2: ya no hace falta la coordenada del punto seleccionado (era sólo
  // para anclar el Popup de MapLibre); el modal no depende de la posición
  // del punto en el mapa.
  const parteSeleccionado = seleccionCue ? (partesPorCue.get(seleccionCue) ?? null) : null

  // El cluster también es clickeable para hacer zoom de expansión.
  const capasInteractivas = [
    ...(capasVisibles.escuelas ? [CAPA_PARTES_ID, CAPA_PARTES_CLUSTER_ID] : []),
    CAPA_DEPARTAMENTOS_RELLENO_ID,
    'infra-departamentos-etiqueta',
    // Radar: sólo cuando está activo. Agregarlas de a una evita que el mapa
    // capture clicks sobre capas no montadas (no pasa nada, pero es ruido).
    ...(radarActivo && capasRadarVisibles.peligro ? [CAPA_PELIGRO_FILL_ID] : []),
    ...(radarActivo && capasRadarVisibles.riesgo ? [CAPA_RIESGO_CIRCLE_ID] : []),
  ]

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
    const features = event.features ?? []

    // Radar primero: si alguna de sus capas está entre las features del click,
    // se atiende ese gesto y se corta. En modo Radar las capas de partes pueden
    // seguir montadas detrás (decisión 2: SUMAR), así que el orden importa —
    // un click sobre un punto de riesgo abre el panel de riesgo, no la ficha.
    if (radarActivo) {
      const puntoRiesgo = features.find(
        (item) =>
          item.layer?.id === CAPA_RIESGO_CIRCLE_ID || item.layer?.id === CAPA_HALO_RIESGO_ID,
      )
      const cueRiesgo = puntoRiesgo?.properties?.cueAnexo
      if (typeof cueRiesgo === 'string') {
        setCueRadarSeleccionado(cueRiesgo)
        return
      }
      const peligro = features.find((item) => item.layer?.id === CAPA_PELIGRO_FILL_ID)
      const nombrePeligro = peligro?.properties?.nombre
      if (typeof nombrePeligro === 'string') {
        setDepartamentoRadarSeleccionado(nombrePeligro)
        return
      }
    }

    const feature = features.find((item) => item.layer?.id === CAPA_PARTES_CLUSTER_ID)
      ?? features.find((item) => item.layer?.id === CAPA_PARTES_ID)
    if (feature?.layer?.id === CAPA_PARTES_CLUSTER_ID) {
      void acercarAlCluster(feature)
      return
    }
    if (feature?.properties?.cueAnexo) {
      const cue = String(feature.properties.cueAnexo)
      // Sin afectación reportada: no hay ParteMapa que mostrar en la ficha,
      // así que el click no abre nada (evita abrir un modal vacío/roto).
      if (partesPorCue.has(cue)) setSeleccionCue(cue)
      return
    }
    const departamento = features.find((item) =>
      item.layer?.id === CAPA_DEPARTAMENTOS_RELLENO_ID || item.layer?.id === 'infra-departamentos-etiqueta',
    )
    const nombre = departamento?.properties?.nombre
    if (typeof nombre === 'string') {
      const siguiente = departamentoSeleccionado === nombre ? null : nombre
      entradaPuntosPendiente.current = true
      setPuntosVisibles(false)
      setDepartamentoSeleccionado(siguiente)
    }
  }

  function handleMouseMove(event: MapLayerMouseEvent) {
    const features = event.features ?? []
    const departamento = features.find(
      (item) => item.layer?.id === CAPA_DEPARTAMENTOS_RELLENO_ID || item.layer?.id === 'infra-departamentos-etiqueta',
    )
    const nombre = departamento?.properties?.nombre
    if (typeof nombre === 'string') {
      setDepartamentoHover({ nombre, lng: event.lngLat.lng, lat: event.lngLat.lat })
    } else if (departamentoHover) {
      setDepartamentoHover(null)
    }
  }

  function handleMouseLeave() {
    setDepartamentoHover(null)
  }

  // Seleccionar una escuela desde el buscador: mismo criterio que el click
  // sobre un punto del mapa — vuela al punto y resalta el anillo; sólo abre
  // ficha si hay un ParteMapa (afectación reportada) para ese cueAnexo.
  function handleSeleccionarEscuelaBuscada(escuela: EscuelaMapa) {
    if (escuela.lat === null || escuela.lon === null) return
    setEscuelaResaltada({ cueAnexo: escuela.cueAnexo, lng: escuela.lon, lat: escuela.lat })
    mapRef.current?.getMap()?.flyTo({ center: [escuela.lon, escuela.lat], zoom: 14, duration: 900 })
    if (partesPorCue.has(escuela.cueAnexo)) setSeleccionCue(escuela.cueAnexo)
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
    const parte = partesPorCue.get(cueAnexo)
    if (parte?.lon != null && parte.lat != null) {
      mapRef.current?.flyTo({ center: [parte.lon, parte.lat], zoom: 12, duration: 800 })
    }
  }

  function alternarCapa(capa: CapaInfraestructura, value: boolean) {
    setCapasVisibles((prev) => ({ ...prev, [capa]: value }))
  }

  function alternarCapaRadar(capa: CapaRadar, value: boolean) {
    setCapasRadarVisibles((prev) => ({ ...prev, [capa]: value }))
  }

  // Cambiar de modo limpia las selecciones del OTRO modo: si quedo con una
  // ficha de radar abierta y vuelvo a "Situación actual", el panel de
  // explicación se cierra solo (su visibilidad deriva de estos estados).
  function cambiarModo(siguiente: ModoMapa) {
    setModoRadar(siguiente === 'radar')
    setCueRadarSeleccionado(null)
    setDepartamentoRadarSeleccionado(null)
  }

  function setFiltro<K extends keyof FiltrosForm>(campo: K, valor: FiltrosForm[K]) {
    if (campo === 'territorio') setDepartamentoSeleccionado(null)
    setFiltrosForm((prev) => ({ ...prev, [campo]: valor }))
  }

  if (error && !data) {
    return (
      <div className={`${styles.status} ${styles.statusError}`}>{error}</div>
    )
  }

  return (
    <div className={styles.shell} ref={shellRef}>
      {/* T1.4: mientras useAlertas resuelve (loading=true, data=null, sin
          error todavía), el aviso se dibuja como overlay ENCIMA del MapGL ya
          montado, en vez de reemplazarlo — así el basemap y los polígonos
          departamentales, que no dependen de `data`, arrancan a cargarse de
          inmediato. `loading && !data` y `data && partes.length === 0` son
          mutuamente excluyentes: nunca se muestran a la vez. */}
      {loading && !data && (
        <div className={`${styles.panel} ${styles.titlePanel}`}>
          Cargando datos del mapa…
        </div>
      )}
      {/* T1.4: espeja el mensaje vacío de la propia lista para que ambos
          lados de un filtro sin resultados se lean igual — acá es lo primero
          que vería quien mira sólo el mapa. */}
      {dataVisible && dataVisible.partes.length === 0 && (
        <div className={`${styles.panel} ${styles.titlePanel}`}>
          No hay escuelas con afectación vigente con los filtros aplicados.
        </div>
      )}
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
          cursor="pointer"
          onLoad={actualizarCuesNoAgrupados}
          onMoveEnd={actualizarCuesNoAgrupados}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onIdle={() => {
            if (entradaPuntosPendiente.current) {
              entradaPuntosPendiente.current = false
              setPuntosVisibles(true)
            }
          }}
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
              filter={['==', ['get', 'nombre'], departamentoSeleccionado ?? '']}
            />
            <Layer
              id={CAPA_DEPARTAMENTO_HOVER_BORDE_ID}
              type="line"
              paint={linePaintDepartamentoHover()}
              filter={['==', ['get', 'nombre'], departamentoSeleccionado ?? '']}
            />
            <Layer
              id="infra-departamentos-etiqueta"
              type="symbol"
              layout={symbolLayoutDepartamentos()}
              paint={symbolPaintDepartamentos()}
            />
          </Source>

          {/*
            Radar (E4): fuente y layers PROPIOS, montados ENCIMA de las capas
            actuales (decisión 2: SUMAR, no reemplazar). Así el modo Radar no
            desmonta nada de lo existente ni toca sus ids — el riesgo de
            regresión del layout actual queda en cero — y las capas de radar
            se pueden apagar con su propio control (RadarLayerControl) sin
            afectar las de partes. `peligroGeojson` reutiliza el mismo
            departamentosRaw; no hay fetch extra para la coropleta.
          */}
          {radarActivo && peligroGeojson && (
            <Source id="infra-peligro-src" type="geojson" data={peligroGeojson}>
              {capasRadarVisibles.peligro && (
                <Layer
                  id={CAPA_PELIGRO_FILL_ID}
                  type="fill"
                  paint={paintCoropletaPeligro()}
                />
              )}
            </Source>
          )}

          {radarActivo && (
            <Source id="infra-riesgo-src" type="geojson" data={puntosRiesgoGeojson}>
              {/* Halo primero en el árbol: queda por debajo del punto, se lee
                  como contorno alrededor y nunca lo tapa. */}
              {capasRadarVisibles.riesgo && (
                <Layer
                  id={CAPA_HALO_RIESGO_ID}
                  type="circle"
                  paint={circlePaintHaloRiesgo()}
                />
              )}
              {capasRadarVisibles.riesgo && (
                <Layer
                  id={CAPA_RIESGO_CIRCLE_ID}
                  type="circle"
                  paint={circlePaintRiesgo()}
                />
              )}
            </Source>
          )}

          {capasVisibles.escuelas && (
            <Source
              id="infra-partes-src"
              type="geojson"
              data={featureCollectionPadron}
              cluster={true}
              clusterMaxZoom={CAPA_PARTES_CLUSTER_MAX_ZOOM}
              clusterRadius={40}
              clusterProperties={{
                // T1.1b: agregados por max() entre los puntos agrupados — el
                // El cluster hereda la severidad más alta, no un promedio.
                severidadRango: ['max', ['get', 'severidadRango']],
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
                // Cuenta de escuelas REALMENTE afectadas en el cluster: suma 1
                // por cada punto con `estado === 'afectada'`. Distingue un
                // cluster de puras escuelas sin afectación (0) de uno con al
                // menos una afectada, para no pintar el primero con el color
                // de severidad 'Baja' (su severidadRango también es 0).
                escuelasAfectadas: ['+', ['case', ['==', ['get', 'estado'], 'afectada'], 1, 0]],
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
              <Layer
                id={CAPA_PARTES_ID}
                type="circle"
                filter={['!', ['has', 'point_count']]}
                paint={{
                  ...circlePaintPartes(),
                  'circle-opacity': puntosVisibles ? 0.9 : 0,
                  'circle-opacity-transition': { duration: 180, delay: 0 },
                }}
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
                  'circle-opacity': puntosVisibles ? 1 : 0,
                  'circle-opacity-transition': { duration: 180, delay: 0 },
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
                paint={{
                  'text-color': '#ffffff',
                  'text-opacity': puntosVisibles ? 1 : 0,
                  'text-opacity-transition': { duration: 180, delay: 0 },
                }}
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

          {departamentoHover && (() => {
            const clave = normalizarNombreDepartamento(departamentoHover.nombre)
            const totales = totalesPorDepartamento.get(clave)
            if (!totales) return null
            return (
              <Popup
                longitude={departamentoHover.lng}
                latitude={departamentoHover.lat}
                closeButton={false}
                closeOnClick={false}
                anchor="bottom"
                className="map-departamento-hover-popup"
              >
                <p>
                  En <strong>{totales.departamentoOriginal}</strong> hay <strong>{totales.totalEscuelas}</strong> escuelas ·{' '}
                  <strong>{totales.escuelasAfectadas}</strong> están afectadas · representa <strong>{totales.porcentajeAfectadas}%</strong>
                </p>
              </Popup>
            )
          })()}

          {/* Resalta la escuela elegida en el buscador con un anillo aparte,
              sin tocar circlePaintPartes: se ve encima tanto de un punto
              individual como de un cluster todavía sin desagrupar mientras
              el flyTo llega al zoom que lo desagrupa. */}
          {escuelaResaltada && (
            <Source
              id="infra-escuela-resaltada-src"
              type="geojson"
              data={{
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [escuelaResaltada.lng, escuelaResaltada.lat] },
                  properties: {},
                }],
              }}
            >
              <Layer
                id="infra-escuela-resaltada"
                type="circle"
                paint={{
                  'circle-radius': 11,
                  'circle-color': 'transparent',
                  'circle-stroke-color': '#f59e0b',
                  'circle-stroke-width': 3,
                }}
              />
            </Source>
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
        habilitado={props.hazardContextEnabled ?? false}
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
      {dataVisible && (
        <div className={styles.leftStack} id="infra-left-stack" data-open={leftStackAbierto ? 'true' : 'false'}>
          {/* Conmutador de modo: SÓLO con el flag prendido. Dos botones reales
              (operables por teclado) con aria-pressed; el modo activo es
              "Situación actual" siempre al entrar. */}
          {(props.riskRadarEnabled ?? false) && (
            <div
              className={`${styles.panel} map-modo-conmutador`}
              role="group"
              aria-label="Modo del mapa"
            >
              <button
                type="button"
                aria-pressed={!modoRadar}
                onClick={() => cambiarModo('actual')}
              >
                Situación actual
              </button>
              <button
                type="button"
                aria-pressed={modoRadar}
                onClick={() => cambiarModo('radar')}
              >
                Radar
              </button>
            </div>
          )}

          {modoRadar ? (
            <div className={`${styles.panel} map-radar-panel`}>
              <SelectorHorizonte
                horizonte={horizonteSeleccionado}
                onChange={setHorizonteSeleccionado}
                disponibles={horizontesDisponibles}
              />

              {radarLoading && !radarData && (
                <p role="status" className={styles.hint}>
                  Cargando datos del radar…
                </p>
              )}
              {radarError && (
                <p role="alert" className={`${styles.hint} ${styles.statusError}`}>
                  {radarError}
                </p>
              )}

              {radarData && (
                <>
                  <p className={styles.hint} data-testid="radar-kpi-riesgo-alto">
                    Escuelas en riesgo alto o muy alto: <strong>{radarData.kpis.riesgoAltoTotal}</strong>
                  </p>
                  {briefingLineas.length > 0 && (
                    <ul className="map-radar-briefing" data-testid="radar-briefing">
                      {briefingLineas.map((linea) => (
                        <li key={linea}>{linea}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {/* Selección del radar: panel de explicación por departamento o
                  por escuela. Los props que la API no entrega van en null y el
                  panel los muestra como "No disponible". */}
              {departamentoRadarSeleccionado && (
                <RiskExplanationPanel
                  tipo="departamento"
                  departamento={departamentoRadarSeleccionado}
                  niveles={nivelesDepartamentoRadar}
                  caudal={null}
                  lluviaObservada={null}
                  tendenciaEstacional={
                    seasonalActivo
                      ? tendenciaEstacionalData && {
                          emisionEn: tendenciaEstacionalData.emisionEn,
                          validoDesde: tendenciaEstacionalData.validoDesde,
                          validoHasta: tendenciaEstacionalData.validoHasta,
                          miembrosTotal: tendenciaEstacionalData.miembrosTotal,
                          miembrosValidos: tendenciaEstacionalData.miembrosValidos,
                          probabilidadSobreNormal: tendenciaEstacionalData.probabilidadSobreNormal,
                          mediaMm: tendenciaEstacionalData.mediaMm,
                        }
                      : undefined
                  }
                />
              )}
              {escuelaRadarSeleccionada && (
                <RiskExplanationPanel
                  tipo="escuela"
                  cueAnexo={escuelaRadarSeleccionada.cueAnexo}
                  nivelRiesgo={escuelaRadarSeleccionada.nivelRiesgo}
                  confianza={
                    (escuelaRadarSeleccionada.confianza as 'baja' | 'media' | 'alta')
                  }
                  scoreAmenaza={escuelaRadarSeleccionada.scoreAmenaza}
                  scoreVulnerabilidad={escuelaRadarSeleccionada.scoreVulnerabilidad}
                  factores={factoresPanel}
                  factoresCargando={snapshotLoading}
                  factoresError={snapshotError}
                />
              )}
            </div>
          ) : (
            <>
              <EscuelaSearchBox
                escuelas={dataEscuelasMapa?.escuelas ?? []}
                onSeleccionar={handleSeleccionarEscuelaBuscada}
              />
              <Indicadores indicadores={dataVisible.indicadores} loading={loading} />
              {departamentoSeleccionado && (
                <div className={`${styles.panel} map-departamento-seleccionado`}>
                  <span>Departamento: <strong>{departamentoSeleccionado}</strong></span>
                  <button type="button" onClick={() => {
                    entradaPuntosPendiente.current = true
                    setPuntosVisibles(false)
                    setDepartamentoSeleccionado(null)
                  }}>Quitar filtro</button>
                </div>
              )}
              <ListaAlertas
                partes={dataVisible.partes}
                filtros={filtrosForm}
                onFiltroChange={setFiltro}
                seleccionadaCue={seleccionCue}
                onSeleccionar={seleccionarDesdeLista}
              />
            </>
          )}
          <InfraLegendPanel
            departamentosSinMatch={departamentosSinMatch}
            mostrarLeyendaPeligro={radarActivo}
            hayNivelProvisorio={radarData?.hayNivelProvisorio ?? false}
          />
        </div>
      )}

      <Button
        variant="secondary"
        size="sm"
        className={styles.leftStackToggle}
        onClick={() =>
          setLeftStackAbierto((abierto) => {
            const proximo = !abierto
            if (proximo) setControlsStackAbierto(false)
            return proximo
          })
        }
        aria-expanded={leftStackAbierto}
        aria-controls="infra-left-stack"
      >
        {leftStackAbierto ? 'Cerrar' : departamentoSeleccionado ?? 'Buscar escuelas'}
      </Button>

      <div
        className={styles.controlsStack}
        id="infra-controls-stack"
        data-open={controlsStackAbierto ? 'true' : 'false'}
      >
        <BasemapControl value={basemap} onChange={setBasemap} />
        <InfraLayerControl capas={capasVisibles} onChange={alternarCapa} />
        {radarActivo && (
          <RadarLayerControl capas={capasRadarVisibles} onChange={alternarCapaRadar} />
        )}
      </div>

      <Button
        variant="secondary"
        size="sm"
        className={styles.controlsStackToggle}
        onClick={() =>
          setControlsStackAbierto((abierto) => {
            const proximo = !abierto
            if (proximo) setLeftStackAbierto(false)
            return proximo
          })
        }
        aria-expanded={controlsStackAbierto}
        aria-controls="infra-controls-stack"
      >
        {controlsStackAbierto ? 'Cerrar' : 'Capas'}
      </Button>

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
