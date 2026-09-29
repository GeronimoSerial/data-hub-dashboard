'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import MapGL, {
  AttributionControl,
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
  FilterSpecification,
  GeoJSONSource,
  MapGeoJSONFeature,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'
import type { Map as MapLibreMap, PaddingOptions } from 'maplibre-gl'
// V8: MapLibre trae sus cadenas de UI (tooltips de controles, aria-labels) en
// inglés por defecto. `locale` acepta la tabla `{ clave: texto }` de
// `maplibre-gl` y sólo pisa las claves presentes en el objeto, así que acá se
// declaran las que este mapa realmente monta: NavigationControl (zoom y
// orientación), el canvas del mapa (`Map.Title`), los attr de atribución y los
// del popup (`Popup.Close`). En español neutro y profesional.
const LOCALE_MAPLIBRE_ES: Record<string, string> = {
  'NavigationControl.ZoomIn': 'Acercar',
  'NavigationControl.ZoomOut': 'Alejar',
  'NavigationControl.ResetBearing': 'Arrastrar para rotar el mapa, clic para reiniciar al norte',
  'Map.Title': 'Mapa',
  'AttributionControl.ToggleAttribution': 'Mostrar u ocultar la atribución',
  'Popup.Close': 'Cerrar',
}
import {
  CircleHelp,
  CircleSlash,
  DoorOpen,
  MapPin,
  Tent,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import { BasemapControl } from '@/components/mapas/basemap-control'
import { EscuelaSearchBox } from '@/components/mapas/escuela-search-box'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { Button } from '@/components/ui/button'
import { useThemeMode } from '@/app/providers'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Indicadores } from '@/components/infraestructura/indicadores'
import { ListaAlertas } from '@/components/infraestructura/lista-alertas'
import { FichaParteModal } from '@/components/infraestructura/ficha-parte-modal'
import { AlcanceNominalModal } from '@/components/infraestructura/alcance-nominal-modal'
import { HistorialParteModal } from '@/components/infraestructura/historial-parte-modal'
import {
  AccesosLayerControl,
  InfraLayerControl,
  RadarLayerControl,
  type CapaAccesos,
  type CapaInfraestructura,
  type CapaRadar,
} from '@/components/mapas/layer-control'
import { InfraLegendPanel } from '@/components/mapas/legend-panel'
import {
  CapasAccesosTerritoriales,
  CAPA_AISLAMIENTO_ID,
  CAPA_CRUCES_ACCESO_ID,
  CAPA_INUNDACION_ID,
  LeyendaAccesos,
  bboxRuta,
} from '@/components/mapas/capas-accesos'
import { SelectorHorizonte, type HorizonteRadar } from '@/components/mapas/selector-horizonte'
import { RiskExplanationPanel } from '@/components/mapas/risk-explanation-panel'
import { useRadar } from '@/lib/infraestructura/use-radar'
import { useReplay, type VistaReplay } from '@/lib/infraestructura/use-replay'
import { useRiesgoSnapshot } from '@/lib/infraestructura/use-riesgo-snapshot'
import { useTendenciaEstacional } from '@/lib/infraestructura/use-tendencia-estacional'
import { useTerritorioMapa } from '@/lib/infraestructura/use-territorio-mapa'
import { useGeometriaAcceso } from '@/lib/infraestructura/use-geometria-acceso'
import { useExposicionRuta } from '@/lib/infraestructura/use-exposicion-ruta'
import { construirCeldasExposicion } from '@/lib/mapas/exposicion-ruta-capas'
import { generarBriefing } from '@/lib/infraestructura/riesgo/briefing'
import { ETIQUETA_TIPO_FACTOR, etiqueta } from '@/lib/infraestructura/riesgo/etiquetas'
import { ReplayPanel } from '@/components/mapas/replay-panel'
import {
  colorPuntoRiesgo,
  construirCoropletaPeligro,
  construirPuntosRiesgo,
  construirPuntosRiesgoAcceso,
  paintCoropletaPeligro,
  paintPuntosRiesgo,
  paintPuntosRiesgoAcceso,
  peorNivelEntre,
  type NivelPorDepartamento,
  type RiesgoAccesoEscuela,
  type RiesgoEscuela,
} from '@/lib/mapas/peligro-capas'
import {
  construirCrucesAcceso,
  construirPuntosAislamiento,
  construirPuntosInundacion,
  construirRutaAcceso,
  ETIQUETAS_CRUCE,
  DESCRIPCIONES_CRUCE,
  ICONOS_ACCESOS_MAPA,
  resumirCobertura,
  type ClasificacionCruce,
} from '@/lib/mapas/accesos-capas'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import {
  agregarEscuelasCaidasPorDepartamento,
  COLORES_DEPARTAMENTO,
  DEPARTAMENTOS_URL,
  LIMITES_CORRIENTES,
  MASCARA_URL,
  fillPaintMascara,
  linePaintDepartamentoHover,
  linePaintDepartamentos,
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
  iconoEstadoEscuela,
  rangoSeveridad,
  type IconoEstadoEscuela,
} from '@/lib/mapas/severidad-visual'
import {
  ICONOS_CLUSTER_MAPA,
  ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS,
  ID_IMAGEN_CLUSTER_EVACUADO,
  ID_IMAGEN_ESCUELA_ALTA,
  ID_IMAGEN_ESCUELA_BAJA,
  ID_IMAGEN_ESCUELA_CRITICA,
  ID_IMAGEN_ESCUELA_MEDIA,
  ID_IMAGEN_ESCUELA_NORMAL,
} from '@/lib/mapas/iconos-mapa'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import type { EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'

ensureMapWorker()

// Fase 2 (parte-mapa): una escuela = un punto, no una capa por categoría. La
// capa vieja distinguía establecimiento/alumnos con símbolo (relleno/anillo);
// ahora esos dos canales están ocupados por severidad (color) y por el badge
// de estado (ícono, ver CAPA_BADGE_ESTADO_ID), y la categoría pasó a filtro
// + ficha.
const CAPA_PARTES_ID = 'infra-partes'

// Los clusters de supercluster tienen ids propios para distinguir el click
// de un agregado del click de una escuela.
const CAPA_PARTES_CLUSTER_ID = 'infra-partes-cluster'
const CAPA_PARTES_CLUSTER_COUNT_ID = 'infra-partes-cluster-count'

// Umbral de clustering: sólo `clusterMaxZoom` de la fuente de escuelas — el
// zoom al que supercluster deja de agrupar en clusters. Ni el badge por
// escuela ni el ícono de evacuación del cluster dependen de este umbral:
// derivan su visibilidad del estado de clustering REAL del mapa (ver
// `cuesNoAgrupados` y los agregados de clusterProperties).
const CAPA_PARTES_CLUSTER_MAX_ZOOM = 11

// V2: badge de estado por escuela individual. Un único ícono Lucide
// superpuesto al punto de color reemplaza a los anillos/halos apilados que
// codificaban servicio (grosor/opacidad) y "sin reportar" (halo gris), y a
// las formas CSS de evacuación. Se resuelve con <Marker> DOM (no capa
// MapLibre) y sólo se dibuja sobre escuelas NO agrupadas (`cuesNoAgrupados`),
// igual que antes hacían los marcadores de evacuación. El ícono comunica QUÉ
// pasa; el color del punto sigue comunicando CUÁN grave es (nunca una
// segunda escala de color). Prioridad (una sola por escuela) en
// `iconoEstadoEscuela` (lib/mapas/severidad-visual.ts).
const CAPA_BADGE_ESTADO_ID = 'infra-badge-estado'
const TAMANO_BADGE_ESTADO = 18
const ICONO_BADGE_ESTADO_TAMANO = 12

// V2: íconos a nivel cluster. A zoom bajo no hay espacio para un badge por
// escuela, así que el agregado `esCentroEvacuados`/`esEvacuado` de
// clusterProperties elige UN ícono de evacuación para la burbuja, en su
// esquina superior derecha (nunca encima del número). Se pintan con capas
// `symbol` + `icon-image`, registrando los SVG como imágenes del mapa (ver
// `registrarIconosCluster`). El resto de los estados (servicio/sin reportar)
// queda sólo a nivel escuela individual.
const CAPA_CLUSTER_CENTRO_EVACUADOS_ID = 'infra-cluster-centro-evacuados'
const CAPA_CLUSTER_EVACUADO_ID = 'infra-cluster-evacuado'

// Q13a/Q13b: ícono de escuela individual (no clusterizada). Es una capa
// `symbol` propia por ENCIMA del círculo de severidad de CAPA_PARTES_ID (el
// círculo se conserva debajo): identifica la escuela de un vistazo y, además
// de eso, su área (~22 px) agranda el hit-testing del click/hover. Con el
// círculo de 6 px el click sobre una escuela del padrón casi siempre perdía
// contra el polígono del departamento de abajo.
const CAPA_PARTES_ESCUELA_ICONO_ID = 'infra-partes-escuela-icono'

// Color de foco/realce de la escuela seleccionada: mismo valor que el token
// `--marker` (= `--yellow`, globals.css) que el hub usa para selección/foco.
// MapLibre no resuelve var() en el paint, así que se repite el literal.
const COLOR_FOCO_SELECCION = '#facd05'

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

// Puntos de riesgo (Radar): un ÍCONO Lucide por escuela, ya no capas `circle`.
// El par círculo+halo anterior dibujaba dos formas apiladas por punto (justo
// el patrón "círculos sobre círculos" ilegible que ya se retiró del resto del
// mapa). Ahora la señal de riesgo es un <Marker> DOM con un TriangleAlert
// coloreado por nivel: un canal visual propio que no compite con el relleno de
// severidad ni con el badge de estado. `RADIO_PUNTO_RIESGO_BASE` se conserva
// porque el modo Replay reusa `circlePaintRiesgo` para SU propia capa de
// riesgo, que es independiente y no se toca acá.
const RADIO_PUNTO_RIESGO_BASE = 7

// id lógico del contenedor del ícono de riesgo: mismo patrón `data-capa` que
// el badge de estado, para tests y estilos sin depender del texto accesible.
const CAPA_RIESGO_ICONO_ID = 'infra-riesgo-icono'
const TAMANO_ICONO_RIESGO = 18

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

const CAPA_RIESGO_ACCESO_CIRCLE_ID = 'infra-riesgo-acceso-circle'

// ── Modo Replay (E7c) ────────────────────────────────────────────────────────
//
// IDs propios, namespaced aparte de infra-peligro-*/infra-riesgo-* del Radar:
// el modo Replay es un modo de análisis SEPARADO, nunca apilado sobre el
// Radar, y ambos pueden convivir en el árbol de MapLibre sin pisarse aunque
// en la práctica sólo uno está activo a la vez (radarActivo/replayActivo son
// mutuamente excluyentes por construcción de `modo`).
const CAPA_REPLAY_PELIGRO_FILL_ID = 'infra-replay-peligro-fill'
const CAPA_REPLAY_RIESGO_CIRCLE_ID = 'infra-replay-riesgo-circle'
const CAPA_REPLAY_AFECTACION_CIRCLE_ID = 'infra-replay-afectacion-circle'

function circlePaintAfectacionReplay(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': RADIO_PUNTO_RIESGO_BASE,
    'circle-color': ['get', 'color'],
    'circle-opacity': 0.9,
    'circle-stroke-color': '#1c1c1c',
    'circle-stroke-width': 1,
  }
}

// Etiqueta del conmutador de modo. `role=tablist` + `aria-pressed` sobre
// botones REALES: operable por teclado sin JS extra.
//
// 'replay' (batch E7c) es un modo de ANÁLISIS separado, no apilado sobre
// 'radar': vive detrás de su propio flag (REPLAY_ENABLED) y no comparte
// estado de selección con los otros dos modos (ver useReplay/ReplayPanel más
// abajo).
type ModoMapa = 'actual' | 'radar' | 'replay'

const CAPAS_RADAR_VISIBLES_DEFECTO: Record<CapaRadar, boolean> = {
  peligro: true,
  riesgo: true,
  // Apagada por defecto: el acceso es contexto adicional, no el encuadre base.
  // TODO(E6): consumir este toggle en map-infraestructura-page.tsx (dibujar la
  // capa de acceso sobre los puntos de riesgo). Hoy sólo existe la definición
  // del control; el estado ya viaja a <RadarLayerControl>.
  'riesgo-acceso': false,
}

// Máscara: tapa todo lo que no es Corrientes. Va primera en el árbol, apenas
// encima del basemap, para que los departamentos y las alertas queden por
// arriba. Es lo que permite dejar el zoom libre: el usuario puede alejarse,
// pero afuera de la provincia no hay nada compitiendo por su atención.
const CAPA_MASCARA_ID = 'infra-mascara-provincia'

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

function layoutIconoCluster(icono: string): SymbolLayerSpecification['layout'] {
  return {
    'icon-image': icono,
    'icon-size': 0.8,
    'icon-anchor': 'center',
    'icon-offset': [13, -13],
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  }
}

function fillPaintDepartamentoHover(): FillLayerSpecification['paint'] {
  return {
    'fill-color': COLORES_DEPARTAMENTO.rellenoSeleccionado,
    'fill-opacity': COLORES_DEPARTAMENTO.opacidadRellenoSeleccionado,
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

// ── Tamaño: fijo en escuelas, por tramos en clusters ───────────────────────
//
// La antigua codificación escalaba el radio por `alumnosAlcanzados` (área
// proporcional al dato, interpolando sobre la raíz cuadrada). Ese canal dejó
// de usarse: la matrícula pasó a la ficha/lista y un punto de tamaño
// variable terminaba tapando a sus vecinas a zoom bajo. El radio de cada
// escuela es fijo; el color informa la severidad y el badge de estado
// informa servicio/evacuación/sin reportar. Los CLUSTERS sí escalan el radio
// con la cantidad de escuelas agrupadas (`expresionRadioCluster`), y eso es
// intencional: más escuelas agrupadas = burbuja más grande.

// Color NEUTRO compartido por el borde del punto y los íconos del badge (el
// color de severidad ya está tomado por el relleno; reusarlo para el estado
// sería una segunda escala). El borde es un trazo mínimo fijo que separa el
// punto del fondo, ya no codifica el servicio.
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
    // Radio mayor que RADIO_DOT_BASE a propósito: el ícono de escuela (badge
    // blanco ~22px) se dibuja encima y necesita un anillo de color visible
    // alrededor para que la severidad siga leyéndose.
    'circle-radius': 14,
    'circle-color': ['get', 'color'],
    'circle-opacity': 0.9,
    'circle-stroke-color': ANILLO_COLOR,
    // Borde neutro FIJO: el servicio ya no se codifica acá (lo dice el badge
    // de estado). El grosor/opacidad variables por `servicio` se eliminaron
    // junto con los anillos apilados de V2.
    'circle-stroke-width': 1,
  }
}

// Filtro de los puntos individuales (no clusterizados) según el toggle del
// padrón completo: apagado (default) sólo muestra escuelas con
// `estado === 'afectada'`; encendido muestra TODAS (afectadas y sin
// afectación, esta última en gris neutro vía el campo `color` que ya
// asigna construirEscuelasMapaFeatureCollection).
export function filtroPuntosPartes(mostrarPadron: boolean): FilterSpecification {
  const base = ['!', ['has', 'point_count']]
  if (mostrarPadron) return base as unknown as FilterSpecification
  return ['all', base, ['==', ['get', 'estado'], 'afectada']] as unknown as FilterSpecification
}

// Mismo criterio para los clusters: apagado sólo muestra clusters con al
// menos una escuela afectada (escuelasAfectadas > 0, agregado ya existente
// en clusterProperties); encendido muestra todos, incluidos los clusters
// de puras escuelas sin afectación (pintados en gris por
// colorPorSeveridadRango, que ya cubre ese caso).
export function filtroClusterPartes(mostrarPadron: boolean): FilterSpecification {
  const base = ['has', 'point_count']
  if (mostrarPadron) return base as unknown as FilterSpecification
  return ['all', base, ['>', ['get', 'escuelasAfectadas'], 0]] as unknown as FilterSpecification
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

// "Sin reportar" se calcula acá, no en el servidor: el indicador agregado
// (indicadores.sinReportar) ya viaja en la respuesta, pero para mostrar el
// badge hace falta saber CUÁL parte individual cruzó el umbral, y esa
// información no se serializa aparte. UMBRAL_SIN_REPORTAR_HORAS es la misma
// constante que usa el servidor (parte-mapa.ts) para el indicador agregado:
// un solo lugar define "viejo", nunca dos criterios que puedan divergir.
export function esSinReportar(parte: ParteMapa, ahoraMs: number): boolean {
  const umbralMs = UMBRAL_SIN_REPORTAR_HORAS * 60 * 60 * 1000
  return ahoraMs - new Date(parte.actualizadaEn).getTime() > umbralMs
}

// Componente Lucide por nombre lógico del badge. El nombre (no el componente)
// es lo que devuelve la función pura `iconoEstadoEscuela`, para poder testear
// la prioridad sin montar el mapa.
const ICONOS_BADGE_ESTADO: Record<IconoEstadoEscuela, LucideIcon> = {
  Tent,
  DoorOpen,
  CircleSlash,
  TriangleAlert,
  CircleHelp,
}

// Texto accesible de cada badge, sin depender de una segunda escala de color.
const ETIQUETA_ICONO_ESTADO: Record<IconoEstadoEscuela, string> = {
  Tent: 'Centro de evacuados',
  DoorOpen: 'Establecimiento evacuado',
  CircleSlash: 'Servicio suspendido',
  TriangleAlert: 'Servicio parcial',
  CircleHelp: 'Sin reportar',
}

// ── Popup de CLIC del departamento ──────────────────────────────────────────
//
// El resumen de un departamento (total, afectadas, porcentaje) ya no aparece
// al pasar el mouse: se guarda acá y se muestra recién al hacer CLIC sobre la
// capa del departamento (ver `handleClick`). Un solo estado, un solo Popup.
// Se cierra al volver a clickear el mismo departamento (toggle), al clickear
// otro (se reemplaza), al clickear una escuela/cluster, al cambiar de modo o
// con Esc.
type InfoDepartamentoClic = { lng: number; lat: number; nombre: string }

// Popup del cruce de agua clickeado: misma forma (anclado al `lngLat` del
// evento) que el del departamento. Guarda la CLASE del cruce, no su texto: la
// etiqueta sale de `ETIQUETAS_CRUCE`, la única fuente de verdad del dominio.
type InfoCruceClic = { lng: number; lat: number; clasificacion: ClasificacionCruce }

// El departamento no tiene marcador debajo, así que el popup se conforma con
// un offset vertical mínimo para no tapar el punto clickeado.
const OFFSET_POPUP_DEPARTAMENTO: [number, number] = [0, -12]
const PROPS_POPUP_INFO = {
  closeButton: false,
  closeOnClick: false,
  offset: OFFSET_POPUP_DEPARTAMENTO,
  className: 'mapa-tooltip mapa-tooltip-departamento',
}

// Badge: círculo claro detrás del ícono para que se lea sobre cualquier color
// de severidad (incluida Crítica, rojo oscuro). Sólo decorativo: el evento
// apunta al punto del mapa, no al badge.
function estiloBadgeEstado(): CSSProperties {
  return {
    width: TAMANO_BADGE_ESTADO,
    height: TAMANO_BADGE_ESTADO,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.95)',
    border: `1px solid ${ANILLO_COLOR}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    boxShadow: '0 0 0 1px rgba(28, 28, 28, 0.15)',
  }
}

// Ícono de riesgo: SIN fondo ni anillo (justo lo que se retiró), sólo un
// drop-shadow claro/oscuro que lo separa del mapa y del punto de severidad
// que puede estar debajo. El color lo pone Lucide vía `color` con la paleta de
// peligro. Es clickeable (abre el panel de riesgo de la escuela), así que el
// `pointerEvents` queda por defecto.
function estiloIconoRiesgo(): CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    lineHeight: 0,
    cursor: 'pointer',
    filter:
      'drop-shadow(0 0 1.5px rgba(255, 255, 255, 0.95)) drop-shadow(0 0 1px rgba(28, 28, 28, 0.4))',
  }
}

// Carga un SVG standalone como imagen de MapLibre. `map.addImage` necesita un
// HTMLImageElement ya decodificado, así que se espera a `onload` antes de
// registrarlo. Silencioso ante error: el peor caso es que no aparezca el
// ícono del cluster, nunca que se rompa el mapa.
function cargarIconoEnMapa(mapa: MapLibreMap, id: string, svg: string): Promise<void> {
  return new Promise((resolve) => {
    const imagen = new Image()
    imagen.onload = () => {
      try {
        if (!mapa.hasImage(id)) mapa.addImage(id, imagen)
      } catch {
        // Ícono ya registrado o estilo no listo: se ignora.
      }
      resolve()
    }
    imagen.onerror = () => resolve()
    imagen.src = `data:image/svg+xml;base64,${btoa(svg)}`
  })
}

const CAPAS_VISIBLES_DEFECTO: Record<CapaInfraestructura, boolean> = {
  escuelas: false,
  // Capas informativas nuevas: apagadas por defecto para no sumar ruido
  // visual al encuadre inicial. El director las prende cuando las necesita.
  evacuacion: false,
  sinReportar: false,
}

// Capas territoriales de accesos (T5c2). Mismo criterio: aislamiento e
// inundación son contexto de largo plazo y arrancan apagadas; la ruta de la
// escuela seleccionada sí está encendida por defecto — se dibuja apenas el
// usuario elige una escuela y no compite con nada hasta entonces.
const CAPAS_ACCESOS_VISIBLES_DEFECTO: Record<CapaAccesos, boolean> = {
  aislamiento: false,
  inundacion: false,
  rutaSeleccion: true,
}

// ── Encuadre de la ruta de acceso ──────────────────────────────────────────
//
// Encajar el bbox de la ruta con un padding de 60 fijo metía la escuela (y
// parte de la ruta) debajo de la columna izquierda o de la ficha: el
// director tenía que volver a acercar a mano para ver el acceso. El padding
// se calcula desde el viewport real y desde si la ficha está tapando el
// mapa, leyendo los MISMOS números que declara globals.css:
//
// - `.map-left-stack`: `left: 55px` + `width: min(20rem, …)` ⇒ ocupa hasta
//   x≈375px, pero sólo por arriba de 720px (debajo es un cajón overlay).
// - `.map-ficha-panel`: panel lateral de `min(400px, 100vw - 24px)` por
//   encima de 1080px; hoja inferior de 55vh (60vh hasta 720px) por debajo.
const PADDING_ENCUADRE_BASE = 60
const ANCHO_COLUMNA_IZQUIERDA = 340
const ANCHO_FICHA_LATERAL = 400
// Fracción de la ventana que el padding puede comerse como máximo. MapLibre
// lanza si el padding deja sin caja al bbox, y con la columna izquierda (340)
// más la ficha lateral (424) esa suma pasa fácil el ancho de una tablet.
const MAX_PADDING_ANCHO = 0.8
const MAX_PADDING_ALTO = 0.8

/**
 * Padding de `fitBounds` para la ruta de la escuela seleccionada.
 *
 * `fichaCubre` es `true` cuando la ficha está abierta Y su panel tapa parte
 * del mapa; el llamador lo decide (el handler de "Ver recorrido" la está
 * cerrando en el mismo gesto, así que ahí encuadra sin ella).
 *
 * Puro salvo por la lectura del viewport: no toca estado ni el mapa, así que
 * se puede testear por viewport sin montar nada.
 */
export function paddingEncuadre(fichaCubre: boolean): PaddingOptions {
  const ancho = window.innerWidth
  const alto = window.innerHeight

  let top = PADDING_ENCUADRE_BASE
  let bottom = PADDING_ENCUADRE_BASE
  let left = PADDING_ENCUADRE_BASE + (ancho > 720 ? ANCHO_COLUMNA_IZQUIERDA : 0)
  let right = PADDING_ENCUADRE_BASE + (ancho > 720 ? 296 : 0)

  if (fichaCubre) {
    if (ancho > 1080) {
      // Ficha lateral, separación, toggle colapsado y margen del mapa.
      right = PADDING_ENCUADRE_BASE + Math.min(ANCHO_FICHA_LATERAL, ancho - 24) + 24 + 90
    } else {
      // Hoja inferior: se reserva su alto real, no el ancho de la pantalla.
      bottom += Math.round(alto * (ancho <= 720 ? 0.6 : 0.55))
      if (ancho > 720) {
        // El toggle de capas colapsado ocupa 90px a la derecha.
        right = PADDING_ENCUADRE_BASE + 90
      }
    }
  }

  // Recorte proporcional: si el padding se come más del 80% de la ventana no
  // queda caja para el bbox y MapLibre tira. Se achica el par culpable (el
  // horizontal o el vertical) en la misma proporción, no a pelo.
  const topeAncho = ancho * MAX_PADDING_ANCHO
  if (left + right > topeAncho) {
    const factor = topeAncho / (left + right)
    left = Math.round(left * factor)
    right = Math.round(right * factor)
  }
  const topeAlto = alto * MAX_PADDING_ALTO
  if (top + bottom > topeAlto) {
    const factor = topeAlto / (top + bottom)
    top = Math.round(top * factor)
    bottom = Math.round(bottom * factor)
  }

  return { top, bottom, left, right }
}

function extraerEscuelasConCoordenadas(escuelas: EscuelaMapa[]) {
  return escuelas
    .filter((escuela) => escuela.lat !== null && escuela.lon !== null)
    .map((escuela) => ({
      cueAnexo: escuela.cueAnexo,
      lat: escuela.lat as number,
      lon: escuela.lon as number,
    }))
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
  replayEnabled?: boolean
  visible?: boolean
}) {
  const styles = useOverlayStyles()
  const { mode } = useThemeMode()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [filtrosForm, setFiltrosForm] = useState<FiltrosForm>(FILTROS_VACIOS)
  // Apertura de "Filtros del mapa" (ListaAlertas): vive acá y no dentro del
  // <details> para que sobreviva al remontaje de la lista cada vez que se
  // cambia de modo (Situación actual / Radar / Replay).
  const [filtrosAvanzadosAbiertos, setFiltrosAvanzadosAbiertos] = useState(false)
  const [seleccionCue, setSeleccionCue] = useState<string | null>(null)
  // Abrir/cerrar la ficha es un estado DISTINTO del de selección. Antes cerrar
  // la ficha (X o Esc) borraba `seleccionCue` y con él la ruta, el resaltado y
  // la leyenda, sin forma de volver atrás. Ahora `seleccionCue` sigue siendo la
  // selección (dura hasta "Quitar selección" o hasta otro cue) y este estado
  // sólo recuerda el cue cuya ficha el usuario cerró, para que el grupo
  // `.map-seleccion-acciones` ofrezca "Ver ficha" de nuevo.
  //
  // `fichaAbierta` se DERIVA (no se sincroniza con un useEffect, que el lint
  // prohíbe): abierta = hay selección y el cue cerrado no es el seleccionado.
  // Por eso toda selección nueva o repetida tiene que limpiar
  // `fichaCerradaCue`: si no, volver a clickear la misma escuela con la ficha
  // cerrada no la reabriría.
  const [fichaCerradaCue, setFichaCerradaCue] = useState<string | null>(null)
  const fichaAbierta = seleccionCue !== null && fichaCerradaCue !== seleccionCue
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
  const [capasAccesosVisibles, setCapasAccesosVisibles] = useState<Record<CapaAccesos, boolean>>(
    CAPAS_ACCESOS_VISIBLES_DEFECTO,
  )
  const [departamentoSeleccionado, setDepartamentoSeleccionado] = useState<string | null>(null)
  // Resumen del departamento clickeado. Reemplaza al tooltip de hover: la
  // información aparece recién con el CLIC (ver `handleClick`), nunca con el
  // mouse quieto encima.
  const [departamentoInfoClic, setDepartamentoInfoClic] = useState<InfoDepartamentoClic | null>(null)
  const [clusterInfoClic, setClusterInfoClic] = useState<MapGeoJSONFeature | null>(null)
  // Clasificación de un CRUCE DE AGUA clickeado sobre la ruta (puente, vado
  // o sin evidencia). Es un popup informativo propio, no una selección: el
  // ícono es más chico que el punto de la escuela y antes el click se lo
  // ganaba el polígono del departamento de abajo.
  const [cruceInfoClic, setCruceInfoClic] = useState<InfoCruceClic | null>(null)
  const [escuelaResaltada, setEscuelaResaltada] = useState<{ cueAnexo: string; lng: number; lat: number } | null>(null)
  // Aviso del buscador, no error: una escuela del padrón puede no tener
  // coordenadas cargadas y aun así se la puede consultar (la ficha tiene
  // dato propio). Antes el handler salía en silencio y el usuario veía no
  // pasar nada.
  const [avisoBusqueda, setAvisoBusqueda] = useState<string | null>(null)
  const [puntosVisibles, setPuntosVisibles] = useState(true)
  const entradaPuntosPendiente = useRef(false)
  // Q3: cueAnexo cuya ruta hay que encuadrar en cuanto su geometría llegue.
  // Elegir una escuela vuela a zoom 14 sobre ella, así que la ruta —que suele
  // medir decenas de kilómetros— queda como un segmento vertical minúsculo que
  // nunca se encuadra sola. Es un ref y no estado: se escribe en el mismo
  // gesto que la selección y lo consume el efecto de encuadre (que corre
  // cuando el hook de geometría responde, uno o más renders después).
  const encuadreRutaPendiente = useRef<string | null>(null)
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

  // V2: los SVG de los íconos de cluster ya se registraron como imágenes del
  // mapa. Gatea el render de las capas `symbol` para no pedir un icon-image
  // inexistente. Se vuelve a false al cambiar de base (el estilo se recarga y
  // MapLibre descarta las imágenes) y `onStyleData` las re-registra.
  const [iconosClusterListos, setIconosClusterListos] = useState(false)

  // ── Modo Radar (E4) ───────────────────────────────────────────────────────
  //
  // Todo el estado del radar es INDEPENDIENTE de los tres estados del modo
  // actual (seleccionCue / nominalAfectacionId / historialCue) y también de
  // `departamentoSeleccionado`: son dos modos distintos sobre el mismo mapa, y
  // mezclarlos haría que abrir una ficha de radar pisara el filtro de partes.
  // `modo` arranca SIEMPRE en 'actual' ("Situación actual"), aun con los
  // flags prendidos; el conmutador sólo muestra el botón de cada modo si su
  // propio flag está activo.
  const [modo, setModo] = useState<ModoMapa>('actual')
  const modoRadar = modo === 'radar'
  const modoReplay = modo === 'replay'
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

  // ── Modo Replay (E7c) ───────────────────────────────────────────────────
  //
  // Modo de ANÁLISIS separado del Radar: no se apila sobre él ni reusa su
  // estado. `territorioIdReplay`/fechas arrancan vacíos a propósito — nada se
  // consulta hasta que el usuario elige explícitamente departamento y
  // ventana (o un episodio derivado), y NUNCA hay reproducción automática al
  // entrar (`playingReplay` arranca siempre en false).
  const [territorioIdReplay, setTerritorioIdReplay] = useState<string | null>(null)
  const [desdeReplay, setDesdeReplay] = useState('')
  const [hastaReplay, setHastaReplay] = useState('')
  const [vistaReplay, setVistaReplay] = useState<VistaReplay>('conocido')
  const [frameIndexReplay, setFrameIndexReplay] = useState(0)
  const [playingReplay, setPlayingReplay] = useState(false)
  const PASO_REPLAY_HORAS = 6

  // Snapshot del estado operativo tomado al ENTRAR a Replay (no al montar el
  // componente): "Volver a la situación actual" restaura exactamente el modo,
  // horizonte y selección que estaban activos antes de abrir Replay, sean los
  // de "Situación actual" o los del Radar.
  const estadoPrevioReplayRef = useRef<{
    modo: ModoMapa
    horizonteSeleccionado: HorizonteRadar
    departamentoSeleccionado: string | null
    seleccionCue: string | null
    departamentoRadarSeleccionado: string | null
    cueRadarSeleccionado: string | null
  } | null>(null)

  const replayActivo = (props.replayEnabled ?? false) && modoReplay
  const filtrosReplay = useMemo(
    () => ({
      territorioId: territorioIdReplay ?? undefined,
      desde: desdeReplay || undefined,
      hasta: hastaReplay || undefined,
      paso: PASO_REPLAY_HORAS,
      vista: vistaReplay,
    }),
    [territorioIdReplay, desdeReplay, hastaReplay, vistaReplay],
  )
  const { data: replayData, loading: replayLoading, error: replayError } = useReplay(
    filtrosReplay,
    replayActivo,
  )

  // El índice de cuadro nunca puede quedar apuntando fuera de rango cuando la
  // respuesta cambia (nuevo territorio/ventana/vista trae menos cuadros que
  // el anterior): se reacomoda al último válido, nunca se inventa un cuadro.
  const [replayDataAnterior, setReplayDataAnterior] = useState(replayData)
  if (replayData !== replayDataAnterior) {
    setReplayDataAnterior(replayData)
    const total = replayData?.cuadros.length ?? 0
    setFrameIndexReplay(total === 0 ? 0 : Math.min(frameIndexReplay, total - 1))
  }

  const cuadroReplayActual = replayData?.cuadros[frameIndexReplay] ?? null

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

  // Cierre con Esc de los popups abiertos por clic. Un solo listener los cierra
  // todos, y sólo existe mientras alguno está abierto (mismo patrón que
  // `FichaParteModal`).
  useEffect(() => {
    if (!departamentoInfoClic && !clusterInfoClic && !cruceInfoClic) return
    const alPresionarTecla = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setDepartamentoInfoClic(null)
      setClusterInfoClic(null)
      setCruceInfoClic(null)
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [departamentoInfoClic, clusterInfoClic, cruceInfoClic])

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

  // V2: badge de estado por escuela NO agrupada. Un ícono lucide por punto,
  // elegido por prioridad con `iconoEstadoEscuela`. Las capas "evacuación" y
  // "sin reportar" siguen siendo toggles: apagadas, esas condiciones no
  // participan del badge y se cae a la siguiente prioridad (p. ej. una
  // escuela evacuada con el toggle apagado pero servicio suspendido muestra
  // CircleSlash). El servicio siempre participa: reemplaza al anillo de
  // grosor, que estaba siempre visible.
  //
  // `ahoraMs` es null hasta que corre el efecto de arriba (Date.now() es
  // impuro y no puede llamarse en render): en ese primer render no hay
  // badge de "sin reportar", igual que antes no había halo.
  const badgesEstado = useMemo(() => {
    if (cuesNoAgrupados === null) return []
    const badges: Array<{
      cueAnexo: string
      nombre: string
      lng: number
      lat: number
      icono: IconoEstadoEscuela
    }> = []
    for (const escuela of dataEscuelasMapaVisible?.escuelas ?? []) {
      if (escuela.lat === null || escuela.lon === null) continue
      if (!cuesNoAgrupados.has(escuela.cueAnexo)) continue
      const parte = escuela.estado === 'afectada' ? escuela.parte : undefined
      const icono = iconoEstadoEscuela({
        estadoEstablecimiento: capasVisibles.evacuacion
          ? (parte?.estadoEstablecimiento ?? 'habitual')
          : 'habitual',
        servicio: parte?.servicio ?? 'normal',
        sinReportar:
          capasVisibles.sinReportar &&
          parte !== undefined &&
          ahoraMs !== null &&
          esSinReportar(parte, ahoraMs),
      })
      if (icono === null) continue
      badges.push({
        cueAnexo: escuela.cueAnexo,
        nombre: escuela.nombre,
        lng: escuela.lon,
        lat: escuela.lat,
        icono,
      })
    }
    return badges
  }, [
    cuesNoAgrupados,
    dataEscuelasMapaVisible,
    ahoraMs,
    capasVisibles.evacuacion,
    capasVisibles.sinReportar,
  ])

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
    // 'ahora' es cualitativo y no depende de ninguna corrida del radar (no
    // manda query, ver use-radar.ts): siempre está disponible, aunque
    // `radarData` todavía no haya llegado o el resto de los horizontes no
    // tengan evidencia. Sin esto, el botón "Ahora" queda permanentemente
    // deshabilitado y no hay forma de volver a la situación actual.
    if (!radarData) return ['ahora']
    const horas = new Set<number>()
    for (const fila of radarData.departamentos) {
      if (fila.peorNivel !== 'sin_dato') horas.add(fila.horizonteHoras)
    }
    for (const escuela of radarData.escuelas.items) horas.add(escuela.horizonteHoras)
    return [
      'ahora',
      ...([24, 72, 240] as HorizonteRadar[]).filter(
        (h) => typeof h === 'number' && horas.has(h),
      ),
    ]
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

  // Índice cueAnexo → riesgo de TODO el universo filtrado del radar
  // (`puntos`), no sólo la página del ranking (`escuelas.items`): los puntos de
  // riesgo deben cubrir el padrón completo, no los 50 de la página 1. El cruce
  // es contra las coordenadas del padrón que arma `escuelasConCoordenadas`.
  const riesgoPorCue = useMemo(() => {
    const map = new Map<string, RiesgoEscuela>()
    for (const punto of radarData?.puntos ?? []) {
      map.set(punto.cueAnexo, {
        nivelRiesgo: punto.nivelRiesgo,
        confianza: punto.confianza,
      })
    }
    return map
  }, [radarData])

  // Coordenadas de riesgo: el padrón completo de M1 (`useEscuelasMapa`), no
  // `dataVisible.partes`. El padrón es la fuente de coordenadas de todas las
  // escuelas del departamento visible, incluidas las que no tienen parte; reusar
  // partes dejaba sin punto a toda escuela sin afectación reportada.
  const escuelasConCoordenadas = useMemo(
    () => extraerEscuelasConCoordenadas(dataEscuelasMapaVisible?.escuelas ?? []),
    [dataEscuelasMapaVisible],
  )

  const puntosRiesgoGeojson = useMemo(
    () => construirPuntosRiesgo(escuelasConCoordenadas, riesgoPorCue),
    [escuelasConCoordenadas, riesgoPorCue],
  )

  // Hallazgo 18: el riesgo de ACCESO se dibuja junto a los clusters de
  // severidad. A zoom bajo ambos representan las MISMAS escuelas, así que los
  // círculos individuales quedaban superpuestos al cluster (el ruido de
  // "círculos grises sobre los clusters"). Se muestran sólo cuando la escuela
  // está desagrupada, con el MISMO criterio que el badge de estado
  // (`cuesNoAgrupados`). El riesgo compuesto dejó de ser una capa `circle`
  // (ahora es <Marker> DOM, ver `marcadoresRiesgo`), pero conserva este mismo
  // gate para no superponer íconos a los clusters.
  const filtroRiesgoDesagrupado = useMemo<FilterSpecification>(() => {
    return [
      'in',
      ['get', 'cueAnexo'],
      ['literal', cuesNoAgrupados ? [...cuesNoAgrupados] : []],
    ]
  }, [cuesNoAgrupados])

  // Reemplazo del par circle+halo de riesgo por íconos Lucide (<Marker> DOM):
  // se itera el MISMO GeoJSON de puntos de riesgo. Se filtran los `sin_dato`
  // —fallback explícito de `construirPuntosRiesgo` para escuelas sin cobertura
  // de riesgo— porque la ausencia de dato no es una señal que deba dibujarse.
  // Se aplica el gate de desagrupado (`cuesNoAgrupados`) igual que antes.
  const marcadoresRiesgo = useMemo(() => {
    if (cuesNoAgrupados === null) return []
    return puntosRiesgoGeojson.features
      .filter((feature) => feature.properties.nivelRiesgo !== 'sin_dato')
      .filter((feature) => cuesNoAgrupados.has(feature.properties.cueAnexo))
      .map((feature) => ({
        cueAnexo: feature.properties.cueAnexo,
        nivelRiesgo: feature.properties.nivelRiesgo,
        lng: feature.geometry.coordinates[0],
        lat: feature.geometry.coordinates[1],
      }))
  }, [puntosRiesgoGeojson, cuesNoAgrupados])

  // Riesgo de acceso (E6): mismo patrón que riesgoPorCue/puntosRiesgoGeojson
  // de arriba, pero leyendo `nivelRiesgoAcceso` del punto del radar en vez de
  // `nivelRiesgo`. Itera `puntos` (todo el universo filtrado), igual que la
  // capa de riesgo compuesto. Dimensión separada, no una variante de color de
  // la capa existente.
  const riesgoAccesoPorCue = useMemo(() => {
    const map = new Map<string, RiesgoAccesoEscuela>()
    for (const punto of radarData?.puntos ?? []) {
      map.set(punto.cueAnexo, {
        nivel: (punto.nivelRiesgoAcceso ?? null) as 'bajo' | 'moderado' | 'alto' | null,
      })
    }
    return map
  }, [radarData])

  const puntosRiesgoAccesoGeojson = useMemo(
    () => construirPuntosRiesgoAcceso(escuelasConCoordenadas, riesgoAccesoPorCue),
    [escuelasConCoordenadas, riesgoAccesoPorCue],
  )

  // ── Capas del cuadro reproducido (Replay, E7c) ────────────────────────────
  //
  // El replay entrega el peligro por CELDA de grilla (geometryRef), no por
  // departamento, y está siempre acotado a UN SOLO territorio a la vez (el
  // elegido en el panel). Por eso la coropleta no se recalcula por
  // departamento como en el Radar: se reduce el peligro de todas las celdas
  // del cuadro a un único peor-nivel (`peorNivelEntre`) y se pinta SÓLO el
  // departamento seleccionado con ese nivel — el resto queda en 'sin_dato'
  // (gris), reusando `construirCoropletaPeligro` tal cual.
  const peligroGeojsonReplay = useMemo(() => {
    if (!departamentosRaw || !territorioIdReplay || !cuadroReplayActual) return null
    const peorNivel = peorNivelEntre(cuadroReplayActual.nivelesPeligro.map((n) => n.nivel))
    return construirCoropletaPeligro(departamentosRaw, [
      { departamento: territorioIdReplay, peorNivel },
    ])
  }, [departamentosRaw, territorioIdReplay, cuadroReplayActual])

  // Coordenadas para Replay: el padrón COMPLETO de M1 (`useEscuelasMapa`, sin
  // filtrar por el departamento elegido en "Situación actual"), no
  // `dataVisible`/`escuelasConCoordenadas`. Replay tiene su PROPIO territorio
  // (`territorioIdReplay`), independiente del filtro de "Situación actual";
  // reusar ese filtro dejaba sin puntos cualquier departamento de Replay que
  // no coincidiera con el elegido en el otro modo.
  const escuelasConCoordenadasReplay = useMemo(
    () => extraerEscuelasConCoordenadas(dataEscuelasMapa?.escuelas ?? []),
    [dataEscuelasMapa],
  )

  // Puntos de riesgo del cuadro reproducido: cruzan `snapshotRiesgo.porEscuela`
  // (por cueAnexo) con las coordenadas del padrón completo. `confianza` no
  // viaja en el contrato de replay: se fija en 'media' como valor neutro,
  // nunca inventando 'alta'.
  const riesgoPorCueReplay = useMemo(() => {
    const map = new Map<string, RiesgoEscuela>()
    for (const escuela of cuadroReplayActual?.snapshotRiesgo?.porEscuela ?? []) {
      map.set(escuela.cueAnexo, { nivelRiesgo: escuela.nivelRiesgo, confianza: 'media' })
    }
    return map
  }, [cuadroReplayActual])

  const puntosRiesgoGeojsonReplay = useMemo(
    () => construirPuntosRiesgo(escuelasConCoordenadasReplay, riesgoPorCueReplay),
    [escuelasConCoordenadasReplay, riesgoPorCueReplay],
  )

  // Afectaciones confirmadas del cuadro reproducido: mismo criterio de
  // coordenadas que arriba (padrón completo). El color reusa `colorSeveridad`,
  // la MISMA escala que "Situación actual" — el replay no inventa una paleta
  // propia.
  const afectacionesGeojsonReplay = useMemo(() => {
    const coordsPorCue = new Map(escuelasConCoordenadasReplay.map((e) => [e.cueAnexo, e]))
    const features = (cuadroReplayActual?.afectacionesConfirmadas ?? [])
      .map((afectacion) => {
        const coords = coordsPorCue.get(afectacion.cueAnexo)
        if (!coords) return null
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [coords.lon, coords.lat] },
          properties: {
            cueAnexo: afectacion.cueAnexo,
            color: colorSeveridad(afectacion.severidad),
          },
        }
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
    return { type: 'FeatureCollection' as const, features }
  }, [cuadroReplayActual, escuelasConCoordenadasReplay])

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

  // Dimensión SEPARADA "riesgo de acceso" para el panel de la escuela
  // seleccionada. El nivel/confianza vienen del item del radar (tarea 1); la
  // explicación se toma del factor 'acceso' del detalle del snapshot cuando
  // está disponible. `undefined` (sin escuela seleccionada) = no se renderiza.
  const riesgoAccesoPanel = useMemo(() => {
    if (!escuelaRadarSeleccionada) return undefined
    const factorAcceso = snapshotDetalle?.factores.find((factor) => factor.tipo === 'acceso')
    return {
      nivel: (escuelaRadarSeleccionada.nivelRiesgoAcceso ?? null) as
        | 'bajo'
        | 'moderado'
        | 'alto'
        | null,
      confianza: (escuelaRadarSeleccionada.confianzaAcceso ?? 'baja') as
        | 'baja'
        | 'media'
        | 'alta',
      explicacion: factorAcceso?.explicacion ?? 'Sin detalle de acceso disponible.',
    }
  }, [escuelaRadarSeleccionada, snapshotDetalle])

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

  // R2: en tema oscuro se usa el estilo oscuro real del proveedor en vez del
  // filtro CSS que invertía todo el canvas (ver comentario en globals.css).
  const mapStyle = mode === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : BASEMAPS[basemap].styleUrl
  // Q6a: identidad de la escuela seleccionada. El padrón COMPLETO
  // (`dataEscuelasMapa`, afectadas y sin afectación reportada) indexa por
  // cueAnexo; cubre también las escuelas que NO están en `partesPorCue`, así
  // el encabezado de la ficha siempre puede mostrar nombre/CUE/localidad/
  // departamento, exista o no una afectación vigente.
  const escuelasPorCue = useMemo(() => {
    const index = new Map<string, EscuelaMapa>()
    for (const escuela of dataEscuelasMapa?.escuelas ?? []) index.set(escuela.cueAnexo, escuela)
    return index
  }, [dataEscuelasMapa])

  const escuelaSeleccionada = seleccionCue ? (escuelasPorCue.get(seleccionCue) ?? null) : null

  // F3.2: ya no hace falta la coordenada del punto seleccionado (era sólo
  // para anclar el Popup de MapLibre); el modal no depende de la posición
  // del punto en el mapa.
  const parteSeleccionado = seleccionCue ? (partesPorCue.get(seleccionCue) ?? null) : null

  // ── Accesos territoriales (T5c2) ─────────────────────────────────────────
  //
  // Gate único: el flag de contexto territorial Y nunca en Replay. Con el
  // flag apagado esta sección no fetchea, no monta control, leyenda ni capas
  // — el mapa se comporta exactamente como antes. `hazardOn` ya incluye
  // `!modoReplay`, así que Replay queda excluido en todos los consumidores.
  const hazardOn = (props.hazardContextEnabled ?? false) && !modoReplay

  // Capas estáticas (aislamiento OSM + susceptibilidad physrisk): un solo
  // fetch de largo plazo, sin polling.
  const {
    data: territorio,
    loading: territorioLoading,
    error: territorioError,
  } = useTerritorioMapa(hazardOn)

  // Los puntos territoriales siguen el padrón VISIBLE (mismo criterio que los
  // puntos de riesgo): todas las escuelas del departamento en foco, tengan o
  // no afectación. El resumen de cobertura de la leyenda, en cambio, cuenta
  // sobre TODO el padrón (la cobertura no depende del filtro de pantalla).
  const puntosAislamiento = useMemo(
    () => construirPuntosAislamiento(dataEscuelasMapaVisible?.escuelas ?? [], territorio),
    [dataEscuelasMapaVisible, territorio],
  )
  const puntosInundacion = useMemo(
    () => construirPuntosInundacion(dataEscuelasMapaVisible?.escuelas ?? [], territorio),
    [dataEscuelasMapaVisible, territorio],
  )
  const resumenCobertura = useMemo(
    () => resumirCobertura(dataEscuelasMapa?.escuelas ?? [], territorio),
    [dataEscuelasMapa, territorio],
  )

  // Escuela de la ruta: en Radar la selección es la del snapshot; en
  // "Situación actual" (y Replay, aunque ahí está apagado) es la de la ficha.
  const cueRuta = modoRadar ? cueRadarSeleccionado : seleccionCue

  // La geometría se pide SÓLO para la escuela seleccionada, nunca para todas
  // las rutas. En Replay queda deshabilitada por `hazardOn`.
  const {
    data: geometria,
    loading: geometriaLoading,
    error: geometriaError,
  } = useGeometriaAcceso(cueRuta, hazardOn && capasAccesosVisibles.rutaSeleccion)
  const {
    data: exposicion,
    loading: exposicionLoading,
    error: exposicionError,
  } = useExposicionRuta(cueRuta, hazardOn && capasAccesosVisibles.rutaSeleccion)

  const rutaGeojson = useMemo(() => construirRutaAcceso(geometria), [geometria])
  const crucesGeojson = useMemo(() => construirCrucesAcceso(geometria), [geometria])
  const celdasExposicion = useMemo(
    () => (exposicion?.cueAnexo === cueRuta ? construirCeldasExposicion(exposicion) : null),
    [exposicion, cueRuta],
  )

  // Nombre de la escuela seleccionada para el título de la leyenda (null si
  // la selección no está en el padrón cargado).
  const seleccionRutaNombre = cueRuta ? (escuelasPorCue.get(cueRuta)?.nombre ?? null) : null

  // V2 (hallazgo 5): realce de foco. Cubre tanto la escuela elegida en el
  // buscador (`escuelaResaltada`) como la de la ficha abierta
  // (`parteSeleccionado`), sin duplicar el punto si coinciden. Antes sólo
  // resaltaba la del buscador y la seleccionada por click no quedaba marcada.
  const puntosResaltados = useMemo(() => {
    const puntos: Array<{ lng: number; lat: number }> = []
    if (escuelaResaltada) puntos.push({ lng: escuelaResaltada.lng, lat: escuelaResaltada.lat })
    if (parteSeleccionado && parteSeleccionado.lon !== null && parteSeleccionado.lat !== null) {
      const yaIncluida = puntos.some(
        (punto) => punto.lng === parteSeleccionado.lon && punto.lat === parteSeleccionado.lat,
      )
      if (!yaIncluida) puntos.push({ lng: parteSeleccionado.lon, lat: parteSeleccionado.lat })
    }
    return puntos
  }, [escuelaResaltada, parteSeleccionado])

  // El cluster también es clickeable para hacer zoom de expansión.
  const capasInteractivas = [
    CAPA_PARTES_ID,
    // Q13b: el ícono de escuela es el área de hit-testing real del punto
    // individual (~22 px contra los 12 px del círculo). Sin esto, el click
    // sobre una escuela del padrón lo gana el polígono del departamento.
    CAPA_PARTES_ESCUELA_ICONO_ID,
    CAPA_PARTES_CLUSTER_ID,
    CAPA_DEPARTAMENTOS_RELLENO_ID,
    'infra-departamentos-etiqueta',
    // Radar: sólo cuando está activo. Agregarlas de a una evita que el mapa
    // capture clicks sobre capas no montadas (no pasa nada, pero es ruido).
    ...(radarActivo && capasRadarVisibles.peligro ? [CAPA_PELIGRO_FILL_ID] : []),
    // Accesos territoriales: sus íconos se dibujan ENCIMA del departamento y
    // no estaban en la lista interactiva, así que el click pasaba de largo y
    // la feature que llegaba al handler era el polígono del departamento —
    // que terminaba filtrando la provincia entera en vez de elegir la escuela
    // del ícono. Se anotan sólo mientras su capa está montada (mismo criterio
    // que Radar).
    ...(hazardOn && capasAccesosVisibles.aislamiento ? [CAPA_AISLAMIENTO_ID] : []),
    ...(hazardOn && capasAccesosVisibles.inundacion ? [CAPA_INUNDACION_ID] : []),
    ...(hazardOn && capasAccesosVisibles.rutaSeleccion ? [CAPA_CRUCES_ACCESO_ID] : []),
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

  const handleClick = useCallback((event: MapLayerMouseEvent) => {
    const features = event.features ?? []

    // Cualquier clic cierra el popup de departamento vigente; si el clic cae
    // sobre un departamento, se vuelve a abrir más abajo con sus números.
    setDepartamentoInfoClic(null)
    setClusterInfoClic(null)
    setCruceInfoClic(null)

    // Radar primero: la coropleta es una capa interactiva; el punto de riesgo
    // ya no llega por acá (es un <Marker> DOM con su propio `onClick`, ver
    // `marcadoresRiesgo`). En modo Radar las capas de partes pueden seguir
    // montadas detrás (decisión 2: SUMAR), así que el orden importa.
    if (radarActivo) {
      const peligro = features.find((item) => item.layer?.id === CAPA_PELIGRO_FILL_ID)
      const nombrePeligro = peligro?.properties?.nombre
      if (typeof nombrePeligro === 'string') {
        setDepartamentoRadarSeleccionado(nombrePeligro)
        return
      }
    }

    // Accesos territoriales, antes que partes/clusters y con `return`: sus
    // íconos están dibujados encima del departamento, así que si el click
    // cayera en la búsqueda de partes el departamento ganaba siempre y el
    // gesto terminaba filtrando la provincia en vez de abrir la escuela (o el
    // cruce) que el usuario quiso señalar. Ninguno de los dos toca acá el
    // estado del departamento.
    const puntoTerritorial = features.find(
      (item) => item.layer?.id === CAPA_AISLAMIENTO_ID || item.layer?.id === CAPA_INUNDACION_ID,
    )
    const cueTerritorial = puntoTerritorial?.properties?.cueAnexo
    if (typeof cueTerritorial === 'string') {
      setSeleccionCue(cueTerritorial)
      setFichaCerradaCue(null)
      encuadreRutaPendiente.current = cueTerritorial
      return
    }

    const cruceClic = features.find((item) => item.layer?.id === CAPA_CRUCES_ACCESO_ID)
    if (cruceClic) {
      // El nombre de la propiedad lo define `construirCrucesAcceso`
      // (`clasificacion`); una clase desconocida o ausente se muestra como
      // "sin puente registrado", que es lo que significa no tener dato.
      const clase = cruceClic.properties?.clasificacion
      setCruceInfoClic({
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
        clasificacion:
          typeof clase === 'string' && clase in ETIQUETAS_CRUCE
            ? (clase as ClasificacionCruce)
            : 'sin_evidencia',
      })
      return
    }

    const feature = features.find((item) => item.layer?.id === CAPA_PARTES_CLUSTER_ID)
      ?? features.find(
        (item) =>
          item.layer?.id === CAPA_PARTES_ID ||
          item.layer?.id === CAPA_PARTES_ESCUELA_ICONO_ID,
      )
    if (feature?.layer?.id === CAPA_PARTES_CLUSTER_ID) {
      setClusterInfoClic(feature)
      return
    }
    if (feature?.properties?.cueAnexo) {
      const cue = String(feature.properties.cueAnexo)
      // Toda escuela real del padrón es seleccionable, tenga o no afectación
      // vigente: la ficha resuelve su propio fetch y muestra un estado
      // explícito de "sin afectación" cuando no hay parte. El gate viejo
      // (`partesPorCue.has`) dejaba sin respuesta el click sobre una escuela
      // del padrón sin afectación.
      setSeleccionCue(cue)
      // Clickear (incluso sobre la escuela ya seleccionada con la ficha
      // cerrada) reabre la ficha: es la misma intención que "Ver ficha".
      setFichaCerradaCue(null)
      // Igual que al elegir desde el buscador: la ruta de esta escuela se
      // encuadra sola cuando su geometría llegue.
      encuadreRutaPendiente.current = cue
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
      if (siguiente === null) {
        mapRef.current?.getMap()?.fitBounds(LIMITES_CORRIENTES, { padding: 24 })
      }
      // Mismo resumen que antes mostraba el hover, ahora atado al clic. Al
      // deseleccionar (toggle sobre el mismo departamento) queda cerrado.
      setDepartamentoInfoClic(
        siguiente === null ? null : { nombre, lng: event.lngLat.lng, lat: event.lngLat.lat },
      )
    }
  }, [
    radarActivo,
    departamentoSeleccionado,
    setDepartamentoInfoClic,
    setClusterInfoClic,
    setCruceInfoClic,
    setDepartamentoRadarSeleccionado,
    setSeleccionCue,
    setPuntosVisibles,
    setDepartamentoSeleccionado,
    setFichaCerradaCue,
  ])

  // Seleccionar una escuela desde el buscador: mismo criterio que el click
  // sobre un punto del mapa — vuela al punto, resalta el anillo y abre la
  // ficha, exista o no afectación vigente para ese cueAnexo.
  function handleSeleccionarEscuelaBuscada(escuela: EscuelaMapa) {
    // Sin coordenadas no hay punto al que volar ni anillo que resaltar, pero
    // la ficha sigue teniendo sentido (dato propio, aunque no se pueda
    // situar en el mapa). Antes el handler salía acá y el usuario no veía
    // NADA pasar: se entendía como "el buscador anda mal" cuando en realidad
    // faltaba la geolocalización del padrón.
    if (escuela.lat === null || escuela.lon === null) {
      setAvisoBusqueda(
        `La escuela "${escuela.nombre}" no tiene ubicación cargada: se muestra la ficha, pero no se puede señalar en el mapa.`,
      )
      setEscuelaResaltada(null)
      setSeleccionCue(escuela.cueAnexo)
      setFichaCerradaCue(null)
      // La ruta OSM se calcula por red vial, no por la coordenada del padrón:
      // si existe, se puede encuadrar igual.
      encuadreRutaPendiente.current = escuela.cueAnexo
      setLeftStackAbierto(false)
      setControlsStackAbierto(false)
      return
    }
    setAvisoBusqueda(null)
    setEscuelaResaltada({ cueAnexo: escuela.cueAnexo, lng: escuela.lon, lat: escuela.lat })
    mapRef.current?.getMap()?.flyTo({ center: [escuela.lon, escuela.lat], zoom: 14, duration: 900 })
    setSeleccionCue(escuela.cueAnexo)
    setFichaCerradaCue(null)
    // La geometría de la ruta se pide después de este render: se deja
    // anotado el cue y el efecto de encuadre la encuadra cuando llegue
    // (ver más abajo). Con la capa de ruta apagada no hay nada que encuadrar
    // y el flyTo a la escuela es la respuesta correcta.
    encuadreRutaPendiente.current = escuela.cueAnexo
    // En <= 720px el buscador vive dentro del cajón `.map-left-stack`, que se
    // abre como overlay fijo z-index 20 por encima de la ficha (z-index 4).
    // Sin cerrarlo, elegir una escuela desde el buscador tapaba la ficha recién
    // abierta y parecía que la selección se había deshecho sola. El mismo
    // razonamiento para el cajón de base/capas.
    setLeftStackAbierto(false)
    setControlsStackAbierto(false)
  }

  // Encuadre de la ruta, una sola vez, cuando su geometría llega. Elegir una
  // escuela vuela a zoom 14 sobre ella, así que sin esto una ruta de 30 km
  // queda como un trazo vertical de un píxel. El ref se limpia siempre que
  // la geometría corresponde a la escuela pendiente: si viene
  // `{ disponible: false }` no hay bbox que encuadrar y el encuadre queda
  // para el botón explícito de la leyenda, no para el próximo render.
  useEffect(() => {
    if (encuadreRutaPendiente.current !== cueRuta) return
    if (geometria === null || geometria.cueAnexo !== cueRuta) return
    encuadreRutaPendiente.current = null
    const bbox = bboxRuta(rutaGeojson)
    if (bbox === null) return
    mapRef.current?.getMap()?.fitBounds(bbox, {
      padding: paddingEncuadre(fichaAbierta),
      duration: 700,
    })
  }, [geometria, rutaGeojson, cueRuta, fichaAbierta])

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

  // V2: registra los SVG de los íconos de cluster como imágenes del mapa antes
  // de que las capas `symbol` los referencien. Idempotente (`hasImage`) y se
  // re-invoca en cada `styledata` porque cambiar de base recarga el estilo y
  // MapLibre descarta las imágenes registradas. Es un no-op si el mapa no
  // expone la API (p. ej. el doble de tests en jsdom).
  //
  // T5c2: en la MISMA pasada se registran los íconos de accesos territoriales
  // (aislamiento/inundación/cruces): comparten el canal `icon-image` y el
  // mismo ciclo de vida del estilo, así que un solo gate (`iconosClusterListos`)
  // cubre a ambos grupos sin duplicar listeners de `styledata`.
  function registrarIconosCluster() {
    const mapa = mapRef.current?.getMap()
    if (!mapa || typeof mapa.hasImage !== 'function' || typeof mapa.addImage !== 'function') {
      return
    }
    const pendientes = [...ICONOS_CLUSTER_MAPA, ...ICONOS_ACCESOS_MAPA]
      .filter(({ id }) => !mapa.hasImage(id))
      .map(({ id, svg }) => cargarIconoEnMapa(mapa, id, svg))
    if (pendientes.length === 0) {
      setIconosClusterListos(true)
      return
    }
    void Promise.all(pendientes).then(() => setIconosClusterListos(true))
  }

  const handleMapLoad = useCallback(() => {
    registrarIconosCluster()
    actualizarCuesNoAgrupados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCuesNoAgrupados, setIconosClusterListos])

  function alternarCapa(capa: CapaInfraestructura, value: boolean) {
    setCapasVisibles((prev) => ({ ...prev, [capa]: value }))
  }

  function alternarCapaRadar(capa: CapaRadar, value: boolean) {
    setCapasRadarVisibles((prev) => ({ ...prev, [capa]: value }))
  }

  function alternarCapaAccesos(capa: CapaAccesos, value: boolean) {
    setCapasAccesosVisibles((prev) => ({ ...prev, [capa]: value }))
  }

  // Encuadre de la ruta seleccionada: sólo si la geometría dibujada tiene un
  // bbox real (una ruta ausente dejaría un `fitBounds` inválido). El padding
  // descuenta la columna izquierda y la ficha para que la escuela quede
  // visible, no tapada.
  function encuadrarRuta() {
    const bbox = bboxRuta(rutaGeojson)
    if (bbox === null) return
    mapRef.current?.getMap()?.fitBounds(bbox, {
      padding: paddingEncuadre(fichaAbierta),
      duration: 600,
    })
  }

  // "Ver recorrido" de la ficha territorial: deja la ruta a la vista. En
  // pantallas angostas la ficha es una hoja inferior que la tapa entera, así
  // que se cierra conservando la selección (el grupo flotante de
  // `.map-seleccion-acciones` queda para volver a abrirla).
  function handleVerRutaEnMapa() {
    if (seleccionCue === null) return
    // `matchMedia` es la forma de saber si la ficha es panel lateral o hoja
    // inferior (mismo breakpoint que globals.css); si el entorno no lo expone
    // (o no lo soporta) se cae al ancho, que decide lo mismo.
    const angosto =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 1080px)').matches
        : window.innerWidth <= 1080

    if (!capasAccesosVisibles.rutaSeleccion) {
      // Con la capa apagada no hay ruta dibujada ni geometría pedida: se
      // enciende y se deja anotado el cue, y el encuadre ocurre solo cuando
      // la geometría llegue (con la ficha ya cerrada, para no taparla).
      setCapasAccesosVisibles((prev) => ({ ...prev, rutaSeleccion: true }))
      encuadreRutaPendiente.current = seleccionCue
    } else {
      const bbox = bboxRuta(rutaGeojson)
      if (bbox !== null) {
        mapRef.current?.getMap()?.fitBounds(bbox, {
          padding: paddingEncuadre(window.innerWidth > 1080),
          duration: 600,
        })
      }
    }

    if (angosto) setFichaCerradaCue(seleccionCue)
  }

  // Cambiar de modo limpia las selecciones del OTRO modo: si quedo con una
  // ficha de radar abierta y vuelvo a "Situación actual", el panel de
  // explicación se cierra solo (su visibilidad deriva de estos estados).
  //
  // Entrar a Replay ('actual'/'radar' -> 'replay') toma una FOTO del estado
  // operativo vigente (modo, horizonte, selecciones) antes de tocar nada:
  // "Volver a la situación actual" (volverDeReplay) restaura exactamente esa
  // foto, nunca fuerza 'actual' a secas — si se venía del Radar con un
  // horizonte y un departamento elegidos, se vuelve a ESE estado.
  function cambiarModo(siguiente: ModoMapa) {
    if (siguiente === 'replay' && modo !== 'replay') {
      estadoPrevioReplayRef.current = {
        modo,
        horizonteSeleccionado,
        departamentoSeleccionado,
        seleccionCue,
        departamentoRadarSeleccionado,
        cueRadarSeleccionado,
      }
    }
    // Salir de Replay por el conmutador (no por "Volver") también debe
    // detener la reproducción: si no, al volver a entrar arranca sola con
    // el estado de play que quedó de la visita anterior.
    if (modo === 'replay' && siguiente !== 'replay') {
      setPlayingReplay(false)
    }
    setModo(siguiente)
    setCueRadarSeleccionado(null)
    setDepartamentoRadarSeleccionado(null)
    // El popup de departamento no puede quedar "clavado" al cambiar de modo:
    // se limpia acá, junto con el resto de la limpieza del cambio de modo.
    setDepartamentoInfoClic(null)
    setClusterInfoClic(null)
    setCruceInfoClic(null)
  }

  // "Volver a la situación actual" del modo Replay: restaura el modo,
  // horizonte y selección operativos previos a abrir Replay (ver
  // cambiarModo). El estado PROPIO de Replay (territorio/ventana/vista/cuadro
  // reproducido) se conserva tal cual por si el usuario vuelve a entrar — no
  // se pierde el trabajo de armar la consulta.
  function volverDeReplay() {
    const previo = estadoPrevioReplayRef.current
    setPlayingReplay(false)
    setDepartamentoInfoClic(null)
    setClusterInfoClic(null)
    setCruceInfoClic(null)
    if (!previo) {
      setModo('actual')
      return
    }
    setModo(previo.modo)
    setHorizonteSeleccionado(previo.horizonteSeleccionado)
    setDepartamentoSeleccionado(previo.departamentoSeleccionado)
    setSeleccionCue(previo.seleccionCue)
    // La foto de Replay no guarda si la ficha estaba cerrada: al volver se
    // reabre, que es el estado en que se tomó la selección.
    setFichaCerradaCue(null)
    setDepartamentoRadarSeleccionado(previo.departamentoRadarSeleccionado)
    setCueRadarSeleccionado(previo.cueRadarSeleccionado)
    estadoPrevioReplayRef.current = null
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
    <div className={styles.shell} ref={shellRef} data-ficha-abierta={fichaAbierta ? 'true' : 'false'}>
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
      <div className={styles.mapRoot}>
        <MapGL
          ref={mapRef}
          attributionControl={false}
          mapStyle={mapStyle}
          locale={LOCALE_MAPLIBRE_ES}
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
          onLoad={handleMapLoad}
          // V2: cambiar de base recarga el estilo y MapLibre descarta las
          // imágenes registradas; `styledata` vuelve a registrarlas.
          onStyleData={registrarIconosCluster}
          onMoveEnd={actualizarCuesNoAgrupados}
          onIdle={() => {
            if (entradaPuntosPendiente.current) {
              entradaPuntosPendiente.current = false
              setPuntosVisibles(true)
            }
          }}
        >
          <NavigationControl position="top-left" />
          {/* UX móvil (390px): el default de MapLibre ancla la atribución abajo
              como franja de ancho variable y tapaba los controles flotantes
              (`.map-left-stack-toggle` y `.map-fullscreen-btn`, ambos a
              `bottom: 25px`). En modo `compact` colapsa a un ícono chico en la
              esquina inferior derecha; el refuerzo CSS del media query de
              720px sube los botones para que el ícono no los pise. */}
          <AttributionControl position="bottom-right" compact />

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

          {/*
            Riesgo de acceso (E6): capa HERMANA de los puntos de riesgo, apagada
            por defecto (capasRadarVisibles['riesgo-acceso'] arranca en
            false). Gateada explícitamente por `!modoReplay` además de
            `radarActivo` (aunque ya son mutuamente excluyentes por
            construcción de `modo`): la regla de aceptación es que esta capa
            NUNCA se muestre en Replay, sin depender de un efecto indirecto.
          */}
          {radarActivo && !modoReplay && capasRadarVisibles['riesgo-acceso'] && (
            <Source id="infra-riesgo-acceso-src" type="geojson" data={puntosRiesgoAccesoGeojson}>
              <Layer
                id={CAPA_RIESGO_ACCESO_CIRCLE_ID}
                type="circle"
                paint={paintPuntosRiesgoAcceso()}
                filter={filtroRiesgoDesagrupado}
              />
            </Source>
          )}

          {/*
            Replay (E7c): fuentes/layers PROPIOS del cuadro reproducido,
            namespaced aparte del Radar (ver comentario de los ids arriba).
            Se montan SÓLO con replayActivo Y un cuadro resuelto — un vacío
            temporal (`vacios[i]`) no se pinta con el color del cuadro
            anterior, así que si no hay `cuadroReplayActual` no se monta la
            capa (mejor nada que un dato viejo disfrazado de vigente).
          */}
          {replayActivo && peligroGeojsonReplay && (
            <Source id="infra-replay-peligro-src" type="geojson" data={peligroGeojsonReplay}>
              <Layer
                id={CAPA_REPLAY_PELIGRO_FILL_ID}
                type="fill"
                paint={paintCoropletaPeligro()}
              />
            </Source>
          )}

          {replayActivo && cuadroReplayActual && (
            <Source
              id="infra-replay-riesgo-src"
              type="geojson"
              data={puntosRiesgoGeojsonReplay}
            >
              <Layer
                id={CAPA_REPLAY_RIESGO_CIRCLE_ID}
                type="circle"
                paint={circlePaintRiesgo()}
              />
            </Source>
          )}

          {replayActivo && cuadroReplayActual && (
            <Source
              id="infra-replay-afectacion-src"
              type="geojson"
              data={afectacionesGeojsonReplay}
            >
              <Layer
                id={CAPA_REPLAY_AFECTACION_CIRCLE_ID}
                type="circle"
                paint={circlePaintAfectacionReplay()}
              />
            </Source>
          )}

          {/*
            Accesos territoriales (T5c2): contexto estático (aislamiento OSM,
            susceptibilidad physrisk, ruta y cruces de la escuela elegida).
            Va DESPUÉS de los departamentos/radar/replay y ANTES del bloque de
            escuelas/partes: las escuelas tienen que quedar por encima y seguir
            siendo clickeables. Sus capas NO se registran en
            `capasInteractivas` — no agregan handlers de click nuevos.
          */}
          {hazardOn && (
            <CapasAccesosTerritoriales
              puntosAislamiento={puntosAislamiento}
              puntosInundacion={puntosInundacion}
              ruta={rutaGeojson}
              celdasExposicion={celdasExposicion}
              cruces={crucesGeojson}
              visibles={capasAccesosVisibles}
              iconosListos={iconosClusterListos}
              oscuro={mode === 'dark'}
            />
          )}

          {(
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
                // V2: mismo OR pero sólo para centro_evacuados. Es lo que
                // permite elegir el ícono del cluster por prioridad (Tent si
                // hay algún centro, si no DoorOpen si hay algún evacuado), en
                // vez del anillo genérico que no distinguía cuál de los dos
                // estados contenía la burbuja (hallazgo 3).
                esCentroEvacuados: ['max', ['case', ['get', 'esCentroEvacuados'], 1, 0]],
                // Cuenta de escuelas REALMENTE afectadas en el cluster: suma 1
                // por cada punto con `estado === 'afectada'`. Distingue un
                // cluster de puras escuelas sin afectación (0) de uno con al
                // menos una afectada, para no pintar el primero con el color
                // de severidad 'Baja' (su severidadRango también es 0).
                escuelasAfectadas: ['+', ['case', ['==', ['get', 'estado'], 'afectada'], 1, 0]],
                criticas: ['+', ['case', ['==', ['get', 'severidad'], 'Crítica'], 1, 0]],
                altas: ['+', ['case', ['==', ['get', 'severidad'], 'Alta'], 1, 0]],
              }}
            >
              {/*
                V2: el estado ya no se codifica con anillos/halos apilados. A
                nivel escuela individual lo dice el badge DOM (icono Lucide,
                ver `badgesEstado`); a nivel cluster, un símbolo en la esquina
                (ver las capas symbol de abajo). Por eso acá ya no hay capas
                `circle` de "sin reportar" ni de "evacuado".
              */}
              <Layer
                id={CAPA_PARTES_ID}
                type="circle"
                filter={filtroPuntosPartes(capasVisibles.escuelas)}
                paint={{
                  ...circlePaintPartes(),
                  'circle-opacity': (['case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], 0, puntosVisibles ? 0.9 : 0]) as unknown as number,
                  'circle-opacity-transition': { duration: 180, delay: 0 },
                }}
              />
              {/*
                Q13a: ícono de escuela individual sobre el círculo de
                severidad (que se conserva debajo). Mismo filtro que
                CAPA_PARTES_ID para que acompañe el toggle del padrón, y el
                mismo gate de imágenes registradas que las capas symbol de
                cluster. `icon-allow-overlap` para que no desaparezcan al
                estar juntas. Q13b: esta capa también es interactiva (ver
                `capasInteractivas`), así el click/hover acierta el ícono
                completo y no sólo el centro del círculo.

                Q17: `icon-size: 1.2` agranda la escuela individual (~26 px)
                SÓLO en esta capa; el SVG base compartido queda igual para no
                agrandar de rebote los íconos Tent/DoorOpen de cluster. La
                variante normal es la misma en ambos temas (R2: se sacó el
                filtro CSS de modo oscuro, ya no hace falta compensar colores
                de entrada; ver comentario en globals.css). Las de severidad
                también son las mismas en ambos temas.
              */}
              {iconosClusterListos && (
                <Layer
                  id={CAPA_PARTES_ESCUELA_ICONO_ID}
                  type="symbol"
                  filter={filtroPuntosPartes(capasVisibles.escuelas)}
                  layout={{
                    'icon-image': [
                      'case',
                      ['!=', ['get', 'estado'], 'afectada'],
                      ID_IMAGEN_ESCUELA_NORMAL,
                      ['==', ['get', 'severidad'], 'Crítica'], ID_IMAGEN_ESCUELA_CRITICA,
                      ['==', ['get', 'severidad'], 'Alta'], ID_IMAGEN_ESCUELA_ALTA,
                      ['==', ['get', 'severidad'], 'Media'], ID_IMAGEN_ESCUELA_MEDIA,
                      ID_IMAGEN_ESCUELA_BAJA,
                    ],
                    'icon-size': 1.2,
                    'icon-anchor': 'center',
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                  }}
                  paint={{
                    'icon-opacity': puntosVisibles ? 1 : 0,
                    'icon-opacity-transition': { duration: 180, delay: 0 },
                  }}
                />
              )}
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
                filter={filtroClusterPartes(capasVisibles.escuelas)}
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
                filter={filtroClusterPartes(capasVisibles.escuelas)}
                layout={{
                  'text-field': ['case', ['==', ['get', 'escuelasAfectadas'], 0], '', ['get', 'escuelasAfectadas']],
                  'text-size': 12,
                  // Misma fuente que el resto de los símbolos del mapa (ver
                  // map-view.tsx); no se inventa una nueva.
                  'text-font': ['Noto Sans Regular'],
                  'text-allow-overlap': false,
                }}
                paint={{
                  // Contraste del conteo: sobre los fondos claros de la escala
                  // tonal (Baja#fecaca/Media#f87171) un trazo blanco se pierde,
                  // así que se usa texto oscuro; sobre Alta/Crítica el fondo es
                  // oscuro y se conserva el blanco. El umbral sale del orden
                  // real de SEVERIDADES (Baja 0, Media 1, Alta 2, Crítica 3):
                  // rango <= 1 => fondo claro => texto oscuro.
                  'text-color': ['case', ['<=', ['get', 'severidadRango'], 1], '#1c1c1c', '#ffffff'],
                  'text-opacity': puntosVisibles ? 1 : 0,
                  'text-opacity-transition': { duration: 180, delay: 0 },
                }}
              />
              {/*
                V2: ícono de evacuación del cluster (reemplaza el anillo
                genérico). Dos capas symbol con filtros excluyentes para
                respetar la prioridad: Tent si el cluster contiene algún
                centro_evacuados, si no DoorOpen si contiene algún evacuado.
                Va en la esquina superior derecha con `icon-offset` para no
                tapar el número del conteo. Sólo se montan cuando las imágenes
                SVG ya quedaron registradas (ver `registrarIconosCluster`).
              */}
              {iconosClusterListos && capasVisibles.evacuacion && (
                <Layer
                  id={CAPA_CLUSTER_CENTRO_EVACUADOS_ID}
                  type="symbol"
                  filter={['all', ['has', 'point_count'], ['==', ['get', 'esCentroEvacuados'], 1]]}
                  layout={layoutIconoCluster(ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS)}
                />
              )}
              {iconosClusterListos && capasVisibles.evacuacion && (
                <Layer
                  id={CAPA_CLUSTER_EVACUADO_ID}
                  type="symbol"
                  filter={[
                    'all',
                    ['has', 'point_count'],
                    ['==', ['get', 'esEvacuado'], 1],
                    ['==', ['get', 'esCentroEvacuados'], 0],
                  ]}
                  layout={layoutIconoCluster(ID_IMAGEN_CLUSTER_EVACUADO)}
                />
              )}
            </Source>
          )}

          {/*
            V2: badge de estado por escuela NO agrupada. Mismo criterio de
            visibilidad que tenían los marcadores de evacuación
            (`cuesNoAgrupados`), pero un solo badge que resume la condición de
            mayor prioridad (servicio, evacuación o sin reportar) en vez de
            anillos/halos/formas apiladas. Sólo se renderizan las escuelas con
            badge (las normales no agregan ruido).
          */}
          {badgesEstado.map((badge) => {
            const Icono = ICONOS_BADGE_ESTADO[badge.icono]
            const etiqueta = ETIQUETA_ICONO_ESTADO[badge.icono]
            return (
              <Marker
                key={badge.cueAnexo}
                longitude={badge.lng}
                latitude={badge.lat}
                anchor="center"
                offset={[11, -11]}
              >
                <div
                  data-capa={CAPA_BADGE_ESTADO_ID}
                  style={estiloBadgeEstado()}
                  role="img"
                  aria-label={`${etiqueta}: ${badge.nombre}`}
                  title={`${etiqueta}: ${badge.nombre}`}
                >
                  <Icono
                    size={ICONO_BADGE_ESTADO_TAMANO}
                    strokeWidth={2.4}
                    color={ANILLO_COLOR}
                  />
                </div>
              </Marker>
            )
          })}

          {/*
            Riesgo climático por escuela: un TriangleAlert Lucide coloreado por
            nivel (paleta de peligro vía `colorPuntoRiesgo`), en un <Marker>
            DOM. Reemplaza el par circle+halo de MapLibre — dos formas apiladas
            por punto. Se posiciona arriba-izquierda para no chocar con el
            badge de estado (arriba-derecha). Clickeable: abre el panel de
            explicación por escuela. Los `sin_dato` ya vienen filtrados en
            `marcadoresRiesgo`.
          */}
          {radarActivo && capasRadarVisibles.riesgo && marcadoresRiesgo.map((marcador) => (
            <Marker
              key={marcador.cueAnexo}
              longitude={marcador.lng}
              latitude={marcador.lat}
              anchor="center"
              offset={[-11, -11]}
            >
              <button
                type="button"
                data-capa={CAPA_RIESGO_ICONO_ID}
                style={estiloIconoRiesgo()}
                aria-label={`Riesgo ${marcador.nivelRiesgo}: ${marcador.cueAnexo}`}
                title={`Riesgo ${marcador.nivelRiesgo}`}
                onClick={() => setCueRadarSeleccionado(marcador.cueAnexo)}
              >
                <TriangleAlert
                  size={TAMANO_ICONO_RIESGO}
                  strokeWidth={2.4}
                  color={colorPuntoRiesgo(marcador.nivelRiesgo)}
                  aria-hidden="true"
                />
              </button>
            </Marker>
          ))}

          {/*
            Popup del departamento clickeado: mismo contenido y estilo que el
            viejo tooltip de hover, pero atado al CLIC (ver `handleClick`). Las
            escuelas y los clusters no tienen popup: el clic ya abre la ficha o
            hace zoom de expansión.
          */}
          {departamentoInfoClic && (() => {
            const clave = normalizarNombreDepartamento(departamentoInfoClic.nombre)
            const totales = totalesPorDepartamento.get(clave)
            if (!totales) return null
            return (
              <Popup
                longitude={departamentoInfoClic.lng}
                latitude={departamentoInfoClic.lat}
                {...PROPS_POPUP_INFO}
              >
                <p>
                  En <strong>{totales.departamentoOriginal}</strong> hay <strong>{totales.totalEscuelas}</strong> escuelas ·{' '}
                  <strong>{totales.escuelasAfectadas}</strong> están afectadas · representa <strong>{totales.porcentajeAfectadas}%</strong>
                </p>
              </Popup>
            )
          })()}
          {/* Popup del CRUCE DE AGUA clickeado sobre la ruta (ver `handleClick`).
              Mismo componente y estilo que el del departamento: un dato
              puntual que se lee sin cambiar de modo. La etiqueta sale de
              `ETIQUETAS_CRUCE`; para "Sin puente registrado" se aclara que la
              ausencia del tag en OSM no prueba que el puente no exista. */}
          {cruceInfoClic && (() => {
            const etiqueta = ETIQUETAS_CRUCE[cruceInfoClic.clasificacion]
            return (
              <Popup
                longitude={cruceInfoClic.lng}
                latitude={cruceInfoClic.lat}
                {...PROPS_POPUP_INFO}
              >
                <p>
                  <strong>Cruce de agua: {etiqueta}</strong>
                  {' — '}{DESCRIPCIONES_CRUCE[cruceInfoClic.clasificacion]}
                </p>
              </Popup>
            )
          })()}
          {clusterInfoClic && clusterInfoClic.geometry.type === 'Point' && (() => {
            const [lng, lat] = clusterInfoClic.geometry.coordinates
            const props = clusterInfoClic.properties ?? {}
            const total = Number(props.point_count ?? 0)
            const afectadas = Number(props.escuelasAfectadas ?? 0)
            const criticas = Number(props.criticas ?? 0)
            const altas = Number(props.altas ?? 0)
            return (
              <Popup
                longitude={lng}
                latitude={lat}
                closeButton={false}
                closeOnClick={false}
                offset={OFFSET_POPUP_DEPARTAMENTO}
                className='mapa-tooltip mapa-tooltip-cluster'
              >
                <p>
                  <strong>{total}</strong> escuelas · <strong>{afectadas}</strong> afectadas ({criticas} críticas, {altas} altas)
                </p>
                <button
                  type='button'
                  onClick={() => {
                    void acercarAlCluster(clusterInfoClic)
                    setClusterInfoClic(null)
                  }}
                >
                  Acercar
                </button>
              </Popup>
            )
          })()}

          {/* V2 (hallazgo 5): realce de foco de la escuela seleccionada, sea
              por el buscador o por la ficha abierta. Un pin DOM (MapPin) en el
              color de foco del hub (`--marker`), anclado por su punta inferior
              al punto de la escuela. Reemplaza al anillo circular de MapLibre:
              sin fondo ni anillo, así se ve encima tanto de un punto individual
              como de un cluster todavía sin desagrupar mientras el flyTo llega
              al zoom que lo desagrupa. */}
          {puntosResaltados.map((punto) => (
            <Marker
              key={`infra-escuela-resaltada-${punto.lng}-${punto.lat}`}
              longitude={punto.lng}
              latitude={punto.lat}
              anchor="bottom"
            >
              <MapPin
                size={26}
                strokeWidth={2.4}
                color={COLOR_FOCO_SELECCION}
                aria-hidden="true"
              />
            </Marker>
          ))}


        </MapGL>
      </div>

      {/*
        F3.2: la ficha pasó de Popup de MapLibre (flotante, atado al punto,
        se cerraba solo con closeOnClick) a un modal de verdad. `open` deriva
        de la selección Y de si el usuario la cerró (ver `fichaCerradaCue`),
        así que seguir clickeando otro punto mientras el modal está abierto lo
        mantiene abierto con el nuevo cue (la `key` adentro de
        FichaParteModal fuerza el remontaje del contenido).

        Cerrar la ficha ya NO borra la selección: la ruta, el resaltado del
        punto y la leyenda de acceso sobreviven, y el grupo
        `.map-seleccion-acciones` ofrece "Ver ficha" / "Quitar selección".
      */}
      <FichaParteModal
        cueAnexo={seleccionCue ?? ''}
        open={fichaAbierta}
        onOpenChange={(next) => {
          if (!next) {
            setFichaCerradaCue(seleccionCue)
            // El popup de departamento vive en el mapa, no en la ficha: al
            // cerrar la ficha se limpia para no quedar descolgado.
            setDepartamentoInfoClic(null)
          }
        }}
        parteResumen={parteSeleccionado}
        escuela={escuelaSeleccionada}
        mostrarEnlaceNominal={props.mostrarEnlaceNominal}
        onVerAlumnosAlcanzados={setNominalAfectacionId}
        onVerHistorialCompleto={() => setHistorialCue(seleccionCue)}
        habilitado={props.hazardContextEnabled ?? false}
        // Sección territorial de la ficha: sólo con el flag prendido y fuera
        // de Replay. Sin `accesoTerritorial` la ficha queda exactamente como
        // estaba.
        accesoTerritorial={
          hazardOn
            ? {
                territorio,
                territorioLoading,
                territorioError,
                cueAnexo: seleccionCue ?? '',
                geometria,
                geometriaLoading,
                geometriaError,
                exposicion,
                exposicionLoading,
                exposicionError,
                onVerRutaEnMapa: handleVerRutaEnMapa,
              }
            : undefined
        }
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
          {/* Conmutador de modo: cada botón adicional ("Radar", "Replay")
              sólo aparece con SU PROPIO flag prendido; "Situación actual" se
              muestra si cualquiera de los dos está activo. Botones reales
              (operables por teclado) con aria-pressed; el modo activo es
              "Situación actual" siempre al entrar, aunque los flags estén
              prendidos. */}
          {((props.riskRadarEnabled ?? false) || (props.replayEnabled ?? false)) && (
            <div
              className={`${styles.panel} map-modo-conmutador`}
              role="group"
              aria-label="Modo del mapa"
            >
              <button
                type="button"
                aria-pressed={modo === 'actual'}
                onClick={() => cambiarModo('actual')}
              >
                Situación actual
              </button>
              {(props.riskRadarEnabled ?? false) && (
                <button
                  type="button"
                  aria-pressed={modoRadar}
                  onClick={() => cambiarModo('radar')}
                >
                  Radar
                </button>
              )}
              {(props.replayEnabled ?? false) && (
                <button
                  type="button"
                  aria-pressed={modoReplay}
                  onClick={() => cambiarModo('replay')}
                >
                  Replay
                </button>
              )}
            </div>
          )}

          {/*
            Buscador de escuelas (hallazgos 8 y 19): montado SIEMPRE, no sólo
            en la rama de "Situación actual", para que esté disponible también
            en Radar y Replay. Selecciona con el mismo criterio en todos los
            modos: vuela al punto y abre la ficha si corresponde.
          */}
          <EscuelaSearchBox
            escuelas={dataEscuelasMapa?.escuelas ?? []}
            onSeleccionar={handleSeleccionarEscuelaBuscada}
          />

          {/*
            Aviso del buscador (no error): una escuela del padrón sin
            coordenadas se puede consultar igual, pero no se puede señalar en
            el mapa. Va pegado al buscador, que es donde se la eligió, para que
            el "no pasó nada" del vuelo al punto tenga una explicación a la
            vista. `role="status"` (no alert): es informativo y no interrumpe.
          */}
          {avisoBusqueda && (
            <p role="status" className={styles.hint} data-testid="aviso-busqueda-sin-ubicacion">
              {avisoBusqueda}
            </p>
          )}

          {/*
            Leyenda territorial (T5c2): hermanas de la leyenda de infra, con
            su propio dominio. Aparece sólo con el flag territorial prendido y
            fuera de Replay; sin bloques visibles el componente no renderiza
            nada.

            Va inmediatamente debajo del buscador, y no al final del panel como
            estaba: ahí quedaba empujada debajo de "Indicadores consolidados" y
            el usuario nunca la veía sin scrollear. Explica las capas
            territoriales (aislamiento, inundación, cruces) justo donde se
            elige la escuela a la que se aplican, y es también el bloque que
            cambia con la selección — tiene que estar a la vista cuando eso
            pasa.
          */}
          {hazardOn && (
            <LeyendaAccesos
              visibles={capasAccesosVisibles}
              territorio={territorio}
              territorioLoading={territorioLoading}
              territorioError={territorioError}
              resumen={resumenCobertura}
              seleccion={seleccionRutaNombre ? { nombre: seleccionRutaNombre } : null}
              geometria={geometria}
              celdasExposicion={celdasExposicion}
              geometriaLoading={geometriaLoading}
              geometriaError={geometriaError}
              onEncuadrarRuta={encuadrarRuta}
            />
          )}

          {modoReplay ? (
            <ReplayPanel
              departamentos={departamentosRaw?.features.map((f) => f.properties.nombre) ?? []}
              territorioId={territorioIdReplay}
              onTerritorioIdChange={setTerritorioIdReplay}
              desde={desdeReplay}
              hasta={hastaReplay}
              onDesdeChange={setDesdeReplay}
              onHastaChange={setHastaReplay}
              vista={vistaReplay}
              onVistaChange={setVistaReplay}
              paso={PASO_REPLAY_HORAS}
              data={replayData}
              loading={replayLoading}
              error={replayError}
              frameIndex={frameIndexReplay}
              onFrameIndexChange={setFrameIndexReplay}
              playing={playingReplay}
              onPlayingChange={setPlayingReplay}
              onVolver={volverDeReplay}
            />
          ) : modoRadar ? (
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
                  riesgoAcceso={riesgoAccesoPanel}
                  factores={factoresPanel}
                  factoresCargando={snapshotLoading}
                  factoresError={snapshotError}
                />
              )}
            </div>
          ) : (
            <>
              {(() => {
                const totales = departamentoSeleccionado
                  ? totalesPorDepartamento.get(normalizarNombreDepartamento(departamentoSeleccionado))
                  : dataTotalesMapa?.provincia
                if (!totales) return null
                return (
                  <p
                    className={styles.hint}
                    data-testid="infra-totales-indicador"
                    title="Afectadas sobre las escuelas del padrón con ubicación en el mapa. Puede diferir de los indicadores consolidados, que cuentan también los partes sin coordenadas."
                  >
                    <strong>{totales.totalEscuelas}</strong> escuelas ·{' '}
                    <strong>{totales.escuelasAfectadas}</strong> afectadas ·{' '}
                    {totales.porcentajeAfectadas}%
                  </p>
                )
              })()}
              <Indicadores indicadores={dataVisible.indicadores} loading={loading} />
              {departamentoSeleccionado && (
                <div className={`${styles.panel} map-departamento-seleccionado`}>
                  <span>Departamento: <strong>{departamentoSeleccionado}</strong></span>
                  <button type="button" onClick={() => {
                    entradaPuntosPendiente.current = true
                    setPuntosVisibles(false)
                    setDepartamentoSeleccionado(null)
                    mapRef.current?.getMap()?.fitBounds(LIMITES_CORRIENTES, { padding: 24 })
                  }}>Quitar filtro</button>
                </div>
              )}
              <ListaAlertas
                partes={dataVisible.partes}
                filtros={filtrosForm}
                onFiltroChange={setFiltro}
                filtrosAbiertos={filtrosAvanzadosAbiertos}
                onFiltrosAbiertosChange={setFiltrosAvanzadosAbiertos}
              />
            </>
          )}
          <InfraLegendPanel
            departamentosSinMatch={departamentosSinMatch}
            mostrarLeyendaPeligro={radarActivo || replayActivo}
            mostrarLeyendaAcceso={radarActivo && !modoReplay && capasRadarVisibles['riesgo-acceso']}
            hayNivelProvisorio={
              radarActivo
                ? (radarData?.hayNivelProvisorio ?? false)
                : (cuadroReplayActual?.nivelesPeligro.some(
                    (n) => n.metodo === 'umbral_provisorio',
                  ) ?? false)
            }
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
        <BasemapControl
          value={basemap}
          onChange={(id) => {
            setBasemap(id)
            // Al cambiar de base MapLibre recarga el estilo y descarta las
            // imágenes registradas: se desmontan las capas symbol hasta que
            // `onStyleData` vuelva a registrarlas.
            setIconosClusterListos(false)
          }}
        />
        <InfraLayerControl capas={capasVisibles} onChange={alternarCapa} />
        {hazardOn && (
          <AccesosLayerControl capas={capasAccesosVisibles} onChange={alternarCapaAccesos} />
        )}
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

      {/*
        Con una escuela seleccionada y la ficha cerrada, la selección queda
        visible en el mapa (resaltado + ruta) pero sin ningún control: la
        única forma de volver atrás era abrir otra escuela y perder el trabajo
        de leer la ruta. Este grupo devuelve las dos acciones que importan.

        Deliberadamente NO usa un modal: es un par de botones, y sin ficha
        abierta no hay backdrop que esconda nada. Sólo en "Situación actual" —
        en Radar y Replay el grupo estorbaría a los paneles de riesgo, y la
        selección de ficha no compite ahí con su propio panel de explicación.
      */}
      {seleccionCue !== null &&
        !fichaAbierta &&
        !modoRadar &&
        !modoReplay && (
          <div className="map-seleccion-acciones" role="group" aria-label="Escuela seleccionada">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="reabrir-ficha"
              aria-label={`Reabrir la ficha de ${escuelasPorCue.get(seleccionCue)?.nombre ?? seleccionCue}`}
              onClick={() => setFichaCerradaCue(null)}
            >
              Ver ficha
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="quitar-seleccion"
              onClick={() => {
                setSeleccionCue(null)
                setEscuelaResaltada(null)
                setFichaCerradaCue(null)
                setAvisoBusqueda(null)
                setCruceInfoClic(null)
              }}
            >
              Quitar selección
            </Button>
          </div>
        )}
    </div>
  )
}
