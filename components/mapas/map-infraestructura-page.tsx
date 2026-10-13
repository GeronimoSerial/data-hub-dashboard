'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
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
  ExpressionSpecification,
  FillLayerSpecification,
  FilterSpecification,
  GeoJSONSource,
  MapGeoJSONFeature,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { Map as MapLibreMap, PaddingOptions } from 'maplibre-gl'
import { ETIQUETA_ESTADO_CLASES } from '@/lib/infraestructura/mapa/etiquetas'
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
  BookMinus,
  BookX,
  Clock,
  DoorOpen,
  House,
  MapPin,
  type LucideIcon,
} from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import { PanelLateral } from '@/components/mapas/panel-lateral'
import { PanelCapas } from '@/components/mapas/panel-capas'
import { ResumenDepartamento } from '@/components/mapas/resumen-departamento'
import { SeleccionEscuela } from '@/components/mapas/seleccion-escuela'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { useThemeMode } from '@/app/providers'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { horaActualizacion, PanelSituacionActual } from '@/components/mapas/panel-situacion-actual'
import { PanelRadar } from '@/components/mapas/panel-radar'
import { PanelPlanificacion } from '@/components/mapas/panel-planificacion'
import { FichaEscuelaPanel } from '@/components/mapas/ficha-escuela-panel'
import { BloqueAcceso } from '@/components/mapas/bloque-acceso'
import { AlcanceNominalModal } from '@/components/infraestructura/alcance-nominal-modal'
import { HistorialParteModal } from '@/components/infraestructura/historial-parte-modal'
import {
  type CapaAccesos,
  type CapaRadar,
} from '@/components/mapas/layer-control'
import { LeyendaMapa } from '@/components/mapas/leyenda-mapa'
import { CapaEstacionesRio } from '@/components/mapas/capa-estaciones-rio'
import { CapaLluviaObservada, type HorasLluvia, type MetaLluviaObservada } from '@/components/mapas/capa-lluvia-observada'
import {
  CapasAccesosTerritoriales,
  CAPA_CRUCES_ACCESO_ID,
  bboxRuta,
} from '@/components/mapas/capas-accesos'
import { RadarMeteo } from '@/components/mapas/radar-meteo/radar-meteo'
import type { VariableRadarUI } from '@/components/mapas/radar-meteo/selector'
import { agruparAlertas } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'
import { useResumenRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-resumen-radar-meteo'
import { useRadar } from '@/lib/infraestructura/use-radar'
import { colapsarAtribucion } from '@/lib/infraestructura/mapa/atribucion'
import { CAPAS_VISIBLES_DEFAULT, visibilidadCapa, type CapasVisibles } from '@/lib/infraestructura/mapa/capas'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { useTerritorioMapa } from '@/lib/infraestructura/use-territorio-mapa'
import { useGeometriaAcceso } from '@/lib/infraestructura/use-geometria-acceso'
import { useExposicionRuta } from '@/lib/infraestructura/use-exposicion-ruta'
import { ultimaActualizacion } from '@/lib/infraestructura/mapa/agregar'
import { cambioEstiloCargado } from '@/lib/infraestructura/mapa/estilo'
import {
  construirCoropletaPeligro,
  construirPuntosRiesgoAcceso,
  paintCoropletaPeligro,
  paintPuntosRiesgoAcceso,
  type NivelPorDepartamento,
  type RiesgoAccesoEscuela,
} from '@/lib/mapas/peligro-capas'
import {
  construirCrucesAcceso,
  construirRutaAcceso,
  ETIQUETAS_CRUCE,
  DESCRIPCIONES_CRUCE,
  ICONOS_ACCESOS_MAPA,
  claseInundacion,
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
import { filtrarDepartamentoMapa, indicadoresDePartes } from '@/lib/infraestructura/filtrar-departamento-mapa'
import { useTotalesMapa } from '@/lib/infraestructura/use-totales-mapa'
import type { TotalesDepartamento } from '@/lib/infraestructura/totales-mapa'
import { filtrarDepartamentoEscuelasMapa } from '@/lib/infraestructura/filtrar-departamento-escuelas-mapa'
import { construirEscuelasMapaFeatureCollection } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'
import type { EscuelaMapaPadron, EscuelasMapaPadronResultado, ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import {
  circlePaintEscuelasSinReporte,
  colorBordeSinReporte,
  colorEscuelaSinReporte,
  iconoPunto,
  radioEscuelaSinReporte,
  radioPunto,
  RADIOS_ESCUELA_SIN_REPORTE,
  type IconoPunto,
} from '@/lib/infraestructura/mapa/punto'
export {
  circlePaintEscuelasSinReporte,
  colorBordeSinReporte,
  colorEscuelaSinReporte,
  radioEscuelaSinReporte,
} from '@/lib/infraestructura/mapa/punto'
import { construirPuntosNivel } from '@/lib/infraestructura/mapa/puntos-nivel'
import { coloresRadar } from '@/lib/infraestructura/mapa/radar'
import { coloresPlanificacion, cuesJuntoLagunaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import type { VistaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import { CapaPuntosNivel, CapaRiesgoSituacion } from '@/components/mapas/capa-puntos-nivel'
import { puntosRiesgoSobreSituacion, soloConDatoOJuntoLaguna } from '@/lib/infraestructura/mapa/puntos-nivel'
import {
  ICONOS_CLUSTER_MAPA,
  ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS,
  ID_IMAGEN_CLUSTER_EVACUADO,
  ID_IMAGEN_ESCUELA_ALTA,
  ID_IMAGEN_ESCUELA_BAJA,
  ID_IMAGEN_ESCUELA_CRITICA,
  ID_IMAGEN_ESCUELA_MEDIA,
  ID_IMAGEN_ESCUELA_SOLUCIONADA,
} from '@/lib/mapas/iconos-mapa'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import type { PestanaMapa } from '@/lib/infraestructura/mapa/tipos'

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
// codificaban servicio (grosor/opacidad) y "sin actualizar" (halo gris), y a
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
// `registrarIconosCluster`). El resto de los estados (servicio/sin actualizar)
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
const CAPA_PARTES_ESCUELA_SOLUCIONADA_ICONO_ID = 'infra-partes-escuela-solucionada-icono'

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

// ── Modo Radar (E4) ─────────────────────────────────────────────
//
// IDs PROPIOS para no pisar jamás la capa de "escuelas caídas" ni el coroplético
// de departamentos existente: la coropleta de peligro es una fuente/layer NUEVA
// montada ENCIMA (misma geometría departamental, otro relleno) y los puntos de
// riesgo viven en una fuente aparte. Si no fuera una fuente nueva, `Source` de
// react-map-gl no permitiría dos `data` distintos para el mismo id.
const CAPA_PELIGRO_FILL_ID = 'infra-peligro-fill'

const CAPA_RIESGO_ACCESO_CIRCLE_ID = 'infra-riesgo-acceso-circle'
const CAPA_PUNTOS_NIVEL_ID = 'infra-puntos-nivel'
const FUENTE_PUNTOS_NIVEL_ID = 'infra-puntos-nivel-src'

const CAPAS_RADAR_VISIBLES_DEFECTO: Record<CapaRadar, boolean> = {
  peligro: true,
  riesgo: true,
  // Apagada por defecto: el acceso es contexto adicional, no el encuadre base.
  // La capa se dibuja sobre los puntos de riesgo cuando este toggle está activo.
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

function fillPaintDepartamentos(radar = false): FillLayerSpecification['paint'] {
  return {
    'fill-color': COLORES_DEPARTAMENTO.rellenoNormal,
    ...(radar ? { 'fill-opacity': 0.025 } : {
    'fill-opacity': [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'escuelasCaidas'], 0],
      0,
      COLORES_DEPARTAMENTO.opacidadRellenoNormal,
      ESCUELAS_CAIDAS_TECHO,
      OPACIDAD_DEPARTAMENTO_CAIDO_TECHO,
    ],
    }),
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

function symbolPaintDepartamentos(radar = false): SymbolLayerSpecification['paint'] {
  return {
    'text-color': radar ? '#c4d4df' : COLORES_DEPARTAMENTO.bordeNormal,
    'text-opacity': radar ? 0.6 : 0.85,
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

// ── Tamaño: neutro chico en escuelas sin reporte, mayor en clusters ─────────
//
// La antigua codificación escalaba el radio por `alumnosAlcanzados` (área
// proporcional al dato, interpolando sobre la raíz cuadrada). Ese canal dejó
// de usarse: la matrícula pasó a la ficha/lista y un punto de tamaño
// variable terminaba tapando a sus vecinas a zoom bajo. Las escuelas afectadas
// mantienen el radio y el badge actuales; las que no tienen reporte usan un
// punto neutro menor que crece suavemente con el zoom. Los clusters sin
// reportes también son menores que los que contienen escuelas afectadas.

// Color NEUTRO compartido por el borde del punto y los íconos del badge (el
// color de severidad ya está tomado por el relleno; reusarlo para el estado
// sería una segunda escala). El borde es un trazo mínimo fijo que separa el
// punto del fondo, ya no codifica el servicio.
const ANILLO_COLOR = '#1c1c1c'

// Los clusters afectados usan la gravedad más alta presente. Un cluster que
// contiene sólo escuelas sin reporte usa el fondo y el borde neutros del tema.
export function colorPorSeveridadRango(oscuro = false): ExpressionSpecification {
  const colorFondo = oscuro ? '#000000' : '#ffffff' // `--page` en globals.css; MapLibre no resuelve var().
  const expresion: ExpressionSpecification = [
    'case', ['==', ['get', 'escuelasAfectadas'], 0], colorFondo, colorSeveridad(SEVERIDADES[0]),
  ]
  for (let i = SEVERIDADES.length - 1; i >= 1; i--) {
    expresion.splice(expresion.length - 1, 0, ['>=', ['get', 'gravedad'], i + 1], colorSeveridad(SEVERIDADES[i]))
  }
  return expresion
}

// El radio del cluster sube por tramos con la cantidad de escuelas.
export const RADIO_CLUSTER_MENOR = 16
export const RADIO_CLUSTER_MEDIO = 22
export const RADIO_CLUSTER_MAYOR = 28

export function expresionRadioCluster(): ExpressionSpecification {
  return ['step', ['get', 'point_count'], RADIO_CLUSTER_MENOR, 10, RADIO_CLUSTER_MEDIO, 50, RADIO_CLUSTER_MAYOR]
}

export function expresionRadioClusterSinReporte(): ExpressionSpecification {
  return ['step', ['get', 'point_count'], 10, 10, 12, 50, 14]
}

export function circlePaintPartes(oscuro = false): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      RADIOS_ESCUELA_SIN_REPORTE[0][0], [
        'case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], RADIOS_ESCUELA_SIN_REPORTE[0][1],
        ['case', ['==', ['get', 'gravedad'], 0], radioPunto(0), radioPunto(1)],
      ],
      RADIOS_ESCUELA_SIN_REPORTE[1][0], [
        'case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], RADIOS_ESCUELA_SIN_REPORTE[1][1],
        ['case', ['==', ['get', 'gravedad'], 0], radioPunto(0), radioPunto(1)],
      ],
      RADIOS_ESCUELA_SIN_REPORTE[2][0], [
        'case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], RADIOS_ESCUELA_SIN_REPORTE[2][1],
        ['case', ['==', ['get', 'gravedad'], 0], radioPunto(0), radioPunto(1)],
      ],
    ],
    'circle-color': [
      'case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'],
      colorEscuelaSinReporte(oscuro), ['get', 'color'],
    ],
    'circle-opacity': ['case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], 1, 0.9],
    'circle-stroke-color': [
      'case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'],
      colorBordeSinReporte(oscuro), ANILLO_COLOR,
    ],
    'circle-stroke-width': ['case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], 1.5, 1],
  }
}

export function circlePaintCluster(oscuro = false): CircleLayerSpecification['paint'] {
  return {
    'circle-color': colorPorSeveridadRango(oscuro),
    'circle-radius': [
      'case', ['==', ['get', 'escuelasAfectadas'], 0], expresionRadioClusterSinReporte(), expresionRadioCluster(),
    ],
    'circle-stroke-color': ['case', ['==', ['get', 'escuelasAfectadas'], 0], colorBordeSinReporte(oscuro), ANILLO_COLOR],
    'circle-stroke-width': ['case', ['==', ['get', 'escuelasAfectadas'], 0], 1.5, 1],
  }
}

export function expresionConteoCluster(): ExpressionSpecification {
  return ['to-string', ['case', ['==', ['get', 'escuelasAfectadas'], 0], ['get', 'point_count'], ['get', 'escuelasAfectadas']]]
}

export function colorTextoCluster(oscuro = false): ExpressionSpecification {
  // `--ink-soft` en globals.css; MapLibre no resuelve var().
  return ['case', ['==', ['get', 'escuelasAfectadas'], 0], oscuro ? '#c9c6c3' : '#5f5e5c', ['<=', ['get', 'severidadRango'], 1], '#1c1c1c', '#ffffff']
}

export function filtroIconoEscuelaAfectada(): FilterSpecification {
  return ['all', ['!', ['has', 'point_count']], ['==', ['get', 'estado'], 'afectada']]
}

export function filtroIconoEscuelaSolucionada(): FilterSpecification {
  return ['all', ['!', ['has', 'point_count']], ['==', ['get', 'solucionadaReciente'], true]]
}

// Componente Lucide por nombre lógico devuelto por la función pura `iconoPunto`.
const ICONOS_BADGE_ESTADO: Record<IconoPunto, LucideIcon> = {
  sin: BookX,
  parcial: BookMinus,
  evacuado: DoorOpen,
  centro: House,
  reloj: Clock,
}

// Texto accesible de cada badge, sin depender de una segunda escala de color.
const ETIQUETA_ICONO_ESTADO: Record<IconoPunto, string> = {
  sin: ETIQUETA_ESTADO_CLASES.sin,
  parcial: ETIQUETA_ESTADO_CLASES.parcial,
  evacuado: ETIQUETA_ESTADO_CLASES.evacuado,
  centro: ETIQUETA_ESTADO_CLASES.centro,
  reloj: 'Sin actualizar',
}

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

// Las capas territoriales adicionales arrancan apagadas. La ruta de acceso
// aparece automáticamente al seleccionar una escuela.
const CAPAS_ACCESOS_OCULTAS: Record<CapaAccesos, boolean> = {
  aislamiento: false,
  inundacion: false,
}

// ── Encuadre de la ruta de acceso ──────────────────────────────────────────
//
// Encajar el bbox de la ruta con un padding de 60 fijo metía la escuela (y
// parte de la ruta) debajo de la columna izquierda: el director tenía que
// volver a acercar a mano para ver el acceso. La ficha comparte esa columna,
// así que el padding reserva únicamente el ancho de la columna izquierda:
//
// - `.map-left-stack`: `left: 55px` + `width: min(20rem, …)` ⇒ ocupa hasta
//   x≈375px, pero sólo por arriba de 720px (debajo es un cajón overlay).
const PADDING_ENCUADRE_BASE = 60
const ANCHO_COLUMNA_IZQUIERDA = 340
// Fracción de la ventana que el padding puede comerse como máximo. MapLibre
// lanza si el padding deja sin caja al bbox; el recorte proporcional evita
// que el padding horizontal deje sin espacio el mapa en pantallas angostas.
const MAX_PADDING_ANCHO = 0.8
const MAX_PADDING_ALTO = 0.8

/**
 * Padding de `fitBounds` para la ruta de la escuela seleccionada.
 *
 * Puro salvo por la lectura del viewport: no toca estado ni el mapa, así que
 * se puede testear por viewport sin montar nada.
 */
export function paddingEncuadre(): PaddingOptions {
  const ancho = window.innerWidth
  const alto = window.innerHeight

  let top = PADDING_ENCUADRE_BASE
  let bottom = PADDING_ENCUADRE_BASE
  let left = PADDING_ENCUADRE_BASE + (ancho > 720 ? ANCHO_COLUMNA_IZQUIERDA : 0)
  let right = PADDING_ENCUADRE_BASE + (ancho > 720 ? 296 : 0)

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

function extraerEscuelasConCoordenadas(escuelas: EscuelaMapaPadron[]) {
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
  escuelasMapa: EscuelasMapaPadronResultado | null
  pestana: Exclude<PestanaMapa, 'estadisticas' | 'capas' | 'metodologia'>
  panel?: Exclude<PestanaMapa, 'estadisticas' | 'metodologia'>
  hazardContextEnabled?: boolean
  riskRadarEnabled?: boolean
  seasonalEnabled?: boolean
  visible?: boolean
  onRegistrarSeleccion?: (fn: ((escuela: EscuelaMapaPadron) => void) | null) => void
  // Element that fullscreen should cover (tabs, filters and map). Defaults to the map shell.
  contenedorPantallaCompleta?: RefObject<HTMLElement | null>
}) {
  const panel = props.panel ?? props.pestana
  const panelLateral = panel === 'radar' && !(props.riskRadarEnabled ?? false) ? 'actual' : panel
  const styles = useOverlayStyles()
  const { mode } = useThemeMode()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [capasVisibles, setCapasVisibles] = useState<CapasVisibles>(CAPAS_VISIBLES_DEFAULT)
  const [horasLluvia, setHorasLluvia] = useState<HorasLluvia>(72)
  const [metaLluvia, setMetaLluvia] = useState<MetaLluviaObservada | null>(null)
  const vistaPreviaRadar = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number } | null>(null)
  const [seleccionCue, setSeleccionCue] = useState<string | null>(null)
  // Abrir/cerrar la ficha es un estado DISTINTO del de selección. Antes cerrar
  // la ficha (X o Esc) borraba `seleccionCue` y con él la ruta, el resaltado y
  // la leyenda, sin forma de volver atrás. Ahora `seleccionCue` sigue siendo la
  // selección (dura hasta "Quitar selección" o hasta otro cue) y este estado
  // sólo recuerda el cue cuya ficha el usuario cerró, para que el sidebar
  // ofrezca "Ver ficha" de nuevo.
  //
  // `fichaAbierta` se DERIVA (sin sincronizarla con un useEffect): hay una
  // selección no cerrada y la pestaña donde se eligió es la actual. Toda
  // selección nueva o repetida limpia `fichaCerradaCue` y fija `fichaPestana`
  // para que la ficha se abra en la pestaña desde donde se eligió.
  const [fichaCerradaCue, setFichaCerradaCue] = useState<string | null>(null)
  const [fichaPestana, setFichaPestana] = useState<PestanaMapa | null>(null)
  const fichaAbierta = seleccionCue !== null && fichaCerradaCue !== seleccionCue && fichaPestana === panelLateral
  // F3.2/F3.3/F3.4: estado de los tres modales, deliberadamente separado del
  // estado de encuadre/filtros. Cerrar cualquiera de los tres sólo tiene que
  // tocar SU propio estado — nunca el encuadre del mapa (MapGL no se remonta acá).
  const [nominalAfectacionId, setNominalAfectacionId] = useState<string | null>(null)
  const [historialCue, setHistorialCue] = useState<string | null>(null)
  const [departamentoSeleccionado, setDepartamentoSeleccionado] = useState<string | null>(null)
  const [departamentoRadarId, setDepartamentoRadarId] = useState<string | null>(null)
  const cerrarFicha = useCallback(() => {
    setFichaCerradaCue(seleccionCue)
  }, [seleccionCue])
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
  // termina de moverse o hacer zoom (onMoveEnd). El halo "sin actualizar" y
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
  const [versionEstilo, setVersionEstilo] = useState(0)
  const ultimoEstiloCargado = useRef<string | null>(null)

  // ── Modo Radar (E4) ───────────────────────────────────────────
  //
  // El Radar es una pestaña del contenedor. Sin su flag, conserva el
  // comportamiento de Situación actual aunque la prop recibida sea "radar".
  const modoRadar = props.pestana === 'radar' && (props.riskRadarEnabled ?? false)
  // El horizonte de la pestaña se guarda como valor del motor; 72 h es la
  // opción inicial cuando todavía no hay evidencia disponible.
  const [horizonteSeleccionado, setHorizonteSeleccionado] = useState<HorizonteMotor>(72)
  const [variableRadar, setVariableRadar] = useState<VariableRadarUI>('lluvia')
  const [capasRadarVisibles, _setCapasRadarVisibles] = useState(CAPAS_RADAR_VISIBLES_DEFECTO)

  // El hook SIEMPRE se llama (regla de hooks), pero sólo dispara request con
  // `activo` true — es decir, flag prendido Y modo Radar. En "Situación actual"
  // o con el flag apagado no hay fetch ni Source/Layer nuevos.
  const filtrosRadar = useMemo(() => ({ horizonte: horizonteSeleccionado }), [horizonteSeleccionado])
  const radarActivo = modoRadar
  const { resumen: resumenRadar, error: resumenRadarError } = useResumenRadarMeteo(radarActivo)
  const [ahoraRadarMs] = useState(() => Date.now())
  const [claveAlertaRadar, setClaveAlertaRadar] = useState<string | null>(null)
  const gruposAlertasRadar = useMemo(
    () => agruparAlertas(resumenRadar?.alertasSmn ?? [], ahoraRadarMs),
    [resumenRadar, ahoraRadarMs],
  )
  const alertasResaltadas = radarActivo
    ? gruposAlertasRadar.find((grupo) => grupo.clave === claveAlertaRadar)?.alertas ?? []
    : []
  const irAAlertasRadar = () => document.getElementById('radar-alertas-smn')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const esPlanificacion = props.pestana === 'planificacion'
  const ocultarPartes = radarActivo || esPlanificacion
  // Al ocultar la pestaña, detener cualquier flyTo sobre un contenedor sin
  // layout. Al volver a mostrar el mapa, MapLibre recalcula el tamaño.
  useEffect(() => {
    const mapa = mapRef.current?.getMap()
    if (!mapa) return
    if (props.visible ?? true) {
      mapa.resize()
    } else {
      mapa.stop()
    }
  }, [props.visible])

  useEffect(() => {
    const contenedor = mapRef.current?.getMap().getContainer()
    if (contenedor) colapsarAtribucion(contenedor)
  }, [radarActivo, versionEstilo])
  const [vistaPlanificacion, setVistaPlanificacion] = useState<VistaPlanificacion>('aisladas')
  const pestanaPrevia = useRef(props.pestana)
  useEffect(() => {
    const anterior = pestanaPrevia.current
    pestanaPrevia.current = props.pestana
    if (anterior === props.pestana) return

    const radarAnterior = anterior === 'radar' && (props.riskRadarEnabled ?? false)
    const radarActual = modoRadar
    const map = mapRef.current?.getMap()
    if (radarAnterior !== radarActual && map) {
      if (radarActual && typeof map.getCenter === 'function') {
        const center = map.getCenter()
        vistaPreviaRadar.current = {
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        }
        map.flyTo({ center: [-58.15, -29.55], zoom: 6.3, duration: 900 })
      } else if (radarAnterior && vistaPreviaRadar.current) {
        map.flyTo({ ...vistaPreviaRadar.current, duration: 700 })
      }
    }
    setClusterInfoClic(null)
    setCruceInfoClic(null)
  }, [modoRadar, props.pestana, props.riskRadarEnabled])
  const { data: radarData, loading: radarLoading, error: radarError } = useRadar(
    filtrosRadar,
    radarActivo,
  )

  // La API devuelve los tres horizontes; la lista lateral y la coropleta
  // comparten el primer horizonte con evidencia si la opción guardada dejó
  // de estar disponible. No se sincroniza estado desde un efecto.
  const horizontesDisponibles = useMemo<HorizonteMotor[]>(() => {
    if (!radarData) return []
    const horas = new Set<number>()
    for (const fila of radarData.departamentos) {
      if (fila.peorNivel !== 'sin_dato') horas.add(fila.horizonteHoras)
    }
    for (const escuela of radarData.escuelas.items) horas.add(escuela.horizonteHoras)
    return ([24, 72, 240] as HorizonteMotor[]).filter((horizonte) => horas.has(horizonte))
  }, [radarData])
  const horizonteEfectivo = horizontesDisponibles.includes(horizonteSeleccionado)
    ? horizonteSeleccionado
    : (horizontesDisponibles[0] ?? horizonteSeleccionado)

  const { data, loading, error } = useAlertas()

  const [ahoraMs, setAhoraMs] = useState<number | null>(null)
  useEffect(() => {
    const id = setTimeout(() => setAhoraMs(Date.now()), 0)
    return () => clearTimeout(id)
  }, [data])

  const dataEscuelasMapa = props.escuelasMapa
  const contextoTerritorial = props.hazardContextEnabled ?? false
  const {
    data: territorio,
    loading: territorioLoading,
    error: territorioError,
  } = useTerritorioMapa(contextoTerritorial)
  const actualizadoEn = useMemo(
    () => ultimaActualizacion(dataEscuelasMapa?.escuelas ?? []),
    [dataEscuelasMapa],
  )
  const { data: dataTotalesMapa } = useTotalesMapa()
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
    () => construirEscuelasMapaFeatureCollection(dataEscuelasMapaVisible?.escuelas ?? []),
    [dataEscuelasMapaVisible],
  )
  const colorPorCue = useMemo(() => {
    const escuelasVisibles = dataEscuelasMapaVisible?.escuelas ?? []
    if (radarActivo) {
      return coloresRadar(radarData?.puntos ?? [], escuelasVisibles, horizonteEfectivo)
    }
    if (esPlanificacion) return coloresPlanificacion(escuelasVisibles, vistaPlanificacion, { territorio })
    return new Map<string, string>()
  }, [
    radarActivo,
    esPlanificacion,
    radarData,
    dataEscuelasMapaVisible,
    horizonteEfectivo,
    vistaPlanificacion,
    territorio,
  ])
  const puntosNivel = useMemo(() => {
    const escuelasVisibles = dataEscuelasMapaVisible?.escuelas ?? []
    const cuesLaguna = esPlanificacion
      ? cuesJuntoLagunaPlanificacion(escuelasVisibles, vistaPlanificacion, { territorio })
      : new Set<string>()
    const puntos = construirPuntosNivel(escuelasVisibles, colorPorCue, cuesLaguna)
    // Exposición a inundación dibuja Alto/Medio/Bajo y las escuelas junto a laguna; el resto queda fuera.
    return esPlanificacion && vistaPlanificacion === 'inundacion' ? soloConDatoOJuntoLaguna(puntos) : puntos
  }, [dataEscuelasMapaVisible, colorPorCue, esPlanificacion, vistaPlanificacion, territorio])
  // Estos selectores sólo agregan riesgo cuando el mapa representa la situación actual.
  const mostrarRiesgoSituacion = props.pestana === 'actual'
    && !radarActivo
    && !esPlanificacion
    && capasVisibles.escuelasAisladas
  const puntosRiesgo = useMemo(
    () => mostrarRiesgoSituacion
      ? puntosRiesgoSobreSituacion(dataEscuelasMapaVisible?.escuelas ?? [], territorio)
      : construirPuntosNivel([], new Map()),
    [mostrarRiesgoSituacion, dataEscuelasMapaVisible, territorio],
  )

  // Cierre con Esc de los popups de cruce y cluster abiertos por clic. Un solo
  // listener vive mientras alguno está abierto.
  useEffect(() => {
    if (!clusterInfoClic && !cruceInfoClic) return
    const alPresionarTecla = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setClusterInfoClic(null)
      setCruceInfoClic(null)
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [clusterInfoClic, cruceInfoClic])

  const datosAlertasFiltrados = useMemo(() => {
    if (!data || !props.escuelasMapa) return data
    const cuesVisibles = new Set(props.escuelasMapa.escuelas.map((escuela) => escuela.cueAnexo))
    const partes = data.partes.filter((parte) => cuesVisibles.has(parte.cueAnexo))
    return { partes, indicadores: indicadoresDePartes(partes, ahoraMs ?? 0) }
  }, [data, props.escuelasMapa, ahoraMs])
  const dataVisible = useMemo(
    () => datosAlertasFiltrados
      ? filtrarDepartamentoMapa(datosAlertasFiltrados, departamentoSeleccionado, ahoraMs)
      : null,
    [datosAlertasFiltrados, departamentoSeleccionado, ahoraMs],
  )

  // Un punto por escuela: la ficha y la lista seleccionan por cueAnexo, no
  // hace falta una agrupación intermedia como la que existía cuando un mismo
  // cue podía tener features en dos capas distintas.
  const partesPorCue = useMemo(() => {
    const map = new Map<string, ParteMapa>()
    for (const parte of dataVisible?.partes ?? []) map.set(parte.cueAnexo, parte)
    return map
  }, [dataVisible])

  // V2: badge de estado por escuela afectada NO agrupada. Un ícono lucide por punto,
  // La función pura resume el estado de clases o, si es normal, el reloj de
  // actualización. Cada escuela muestra como máximo un badge.
  const badgesEstado = useMemo(() => {
    if (cuesNoAgrupados === null) return []
    const badges: Array<{
      cueAnexo: string
      nombre: string
      lng: number
      lat: number
      icono: IconoPunto
    }> = []
    for (const escuela of dataEscuelasMapaVisible?.escuelas ?? []) {
      if (escuela.lat === null || escuela.lon === null) continue
      if (escuela.estado !== 'afectada') continue
      if (!cuesNoAgrupados.has(escuela.cueAnexo)) continue
      const icono = iconoPunto(escuela)
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
  ])

  // F2.4: el GeoJSON de departamentos se pide una vez más, aparte del que ya
  // pide <Source> por URL, porque <Source> no expone sus features parseadas
  // de vuelta a React — sólo así se puede cruzar contra `data.partes` en el
  // cliente. Es la misma decisión que documenta la tarea: son 25 polígonos y
  // ~44 KB, pedirlos dos veces (uno cacheado por el browser) es barato al
  // lado de duplicar esa lógica de join en el servidor.
  const [departamentosRaw, setDepartamentosRaw] = useState<FeatureCollection<
    Polygon | MultiPolygon,
    { nombre: string; id?: string; centroide?: { lon: number; lat: number } }
  > | null>(null)

  useEffect(() => {
    let cancelado = false
    fetch(DEPARTAMENTOS_URL)
      .then((respuesta) => respuesta.json())
      .then((geojson: FeatureCollection<
        Polygon | MultiPolygon,
        { nombre: string; id?: string; centroide?: { lon: number; lat: number } }
      >) => {
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

  const departamentoRadarNombre = useMemo(
    () => radarActivo
      ? departamentosRaw?.features.find((feature) => feature.properties.id === departamentoRadarId)?.properties.nombre ?? null
      : null,
    [radarActivo, departamentosRaw, departamentoRadarId],
  )
  const seleccionarDepartamentoRadar = (id: string | null) => {
    setDepartamentoRadarId(id)
    if (id === null) return
    const centroide = departamentosRaw?.features.find((feature) => feature.properties.id === id)?.properties.centroide
    if (centroide) {
      mapRef.current?.getMap()?.flyTo({ center: [centroide.lon, centroide.lat], zoom: 8, duration: 800 })
    }
  }

  const departamentosGeojson = useMemo(() => {
    if (!departamentosRaw) return null

    const nombresConocidos = departamentosRaw.features.map((f) => f.properties.nombre)
    const escuelas = (data?.partes ?? []).map((parte) => ({
      departamento: parte.departamento,
      servicio: parte.servicio,
    }))
    const { escuelasCaidasPorDepartamento, departamentosSinMatch: sinMatch } =
      agregarEscuelasCaidasPorDepartamento(escuelas, nombresConocidos)

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

    return { type: 'FeatureCollection' as const, features }
  }, [departamentosRaw, data])

  // Coropleta de peligro: copia del MISMO `departamentosRaw` ya cargado (no se
  // duplica el fetch de DEPARTAMENTOS_URL). El radar entrega una fila por
  // (departamento, horizonte); se filtra al horizonte que está en uso en el
  // panel.
  const peligroGeojson = useMemo(() => {
    if (!departamentosRaw) return null
    const niveles: NivelPorDepartamento[] = (radarData?.departamentos ?? [])
      .filter((fila) => fila.horizonteHoras === horizonteEfectivo)
      .map((fila) => ({ departamento: fila.departamento, peorNivel: fila.peorNivel }))
    return construirCoropletaPeligro(departamentosRaw, niveles)
  }, [departamentosRaw, radarData, horizonteEfectivo])

  // Coordenadas de riesgo: el padrón completo de M1 (`useEscuelasMapa`), no
  // `dataVisible.partes`. El padrón es la fuente de coordenadas de todas las
  // escuelas del departamento visible, incluidas las que no tienen parte; reusar
  // partes dejaba sin punto a toda escuela sin afectación reportada.
  const escuelasConCoordenadas = useMemo(
    () => extraerEscuelasConCoordenadas(dataEscuelasMapaVisible?.escuelas ?? []),
    [dataEscuelasMapaVisible],
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

  // R2: en tema oscuro se usa el estilo oscuro real del proveedor en vez del
  // filtro CSS que invertía todo el canvas (ver comentario en globals.css).
  const mapStyle = radarActivo || mode === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : BASEMAPS[basemap].styleUrl
  const mapStyleRef = useRef(mapStyle)
  useEffect(() => {
    mapStyleRef.current = mapStyle
  }, [mapStyle])
  // Q6a: identidad de la escuela seleccionada. El padrón COMPLETO
  // (`dataEscuelasMapa`, afectadas y sin afectación reportada) indexa por
  // cueAnexo; cubre también las escuelas que NO están en `partesPorCue`, así
  // el encabezado de la ficha siempre puede mostrar nombre/CUE/localidad/
  // departamento, exista o no una afectación vigente.
  const escuelasPorCue = useMemo(() => {
    const index = new Map<string, EscuelaMapaPadron>()
    for (const escuela of dataEscuelasMapa?.escuelas ?? []) index.set(escuela.cueAnexo, escuela)
    return index
  }, [dataEscuelasMapa])

  const escuelaSeleccionada = seleccionCue ? (escuelasPorCue.get(seleccionCue) ?? null) : null
  const parteSeleccionado = seleccionCue ? (partesPorCue.get(seleccionCue) ?? null) : null

  // ── Accesos territoriales (T5c2) ─────────────────────────────────────────
  //
  // La ficha puede consultar acceso territorial en cualquier pestaña. Las
  // capas y controles del mapa siguen apagados en Radar.
  const hazardOn = contextoTerritorial && !modoRadar

  // Los puntos territoriales siguen el padrón VISIBLE (mismo criterio que los
  // puntos de riesgo): todas las escuelas del departamento en foco, tengan o
  // no afectación. El resumen de cobertura de la leyenda, en cambio, cuenta
  // sobre TODO el padrón (la cobertura no depende del filtro de pantalla).
  // La ficha y la ruta usan la misma selección en las tres pestañas.
  const cueRuta = seleccionCue

  // La geometría se pide SÓLO para la escuela seleccionada, nunca para todas
  // las rutas. Se deshabilita cuando el contexto territorial no está activo.
  const {
    data: geometria,
    loading: geometriaLoading,
    error: geometriaError,
  } = useGeometriaAcceso(cueRuta, contextoTerritorial && cueRuta !== null)
  const {
    data: exposicion,
    loading: exposicionLoading,
  } = useExposicionRuta(cueRuta, contextoTerritorial && cueRuta !== null)

  const rutaGeojson = useMemo(() => construirRutaAcceso(geometria), [geometria])
  const crucesGeojson = useMemo(() => construirCrucesAcceso(geometria), [geometria])

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

  // Seleccionar desde un punto o el buscador abre la misma ficha y encuadre.
  const handleSeleccionarEscuelaBuscada = useCallback((escuela: EscuelaMapaPadron) => {
    if (escuela.lat === null || escuela.lon === null) {
      setAvisoBusqueda(
        `La escuela "${escuela.nombre}" no tiene ubicación cargada: se muestra la ficha, pero no se puede señalar en el mapa.`,
      )
      setEscuelaResaltada(null)
      setSeleccionCue(escuela.cueAnexo)
      setFichaCerradaCue(null)
      setFichaPestana(panelLateral)
      encuadreRutaPendiente.current = escuela.cueAnexo
      return
    }
    setAvisoBusqueda(null)
    setEscuelaResaltada({ cueAnexo: escuela.cueAnexo, lng: escuela.lon, lat: escuela.lat })
    mapRef.current?.getMap()?.flyTo({ center: [escuela.lon, escuela.lat], zoom: 14, duration: 900 })
    setSeleccionCue(escuela.cueAnexo)
    setFichaCerradaCue(null)
    setFichaPestana(panelLateral)
    encuadreRutaPendiente.current = escuela.cueAnexo
  }, [panelLateral])

  // El cluster también es clickeable para hacer zoom de expansión.
  const capasInteractivas = [
    CAPA_PARTES_ID,
    // Q13b: el ícono de escuela es el área de hit-testing real del punto
    // individual (~22 px contra los 12 px del círculo). Sin esto, el click
    // sobre una escuela del padrón lo gana el polígono del departamento.
    CAPA_PARTES_ESCUELA_ICONO_ID,
    CAPA_PARTES_ESCUELA_SOLUCIONADA_ICONO_ID,
    CAPA_PARTES_CLUSTER_ID,
    CAPA_DEPARTAMENTOS_RELLENO_ID,
    'infra-departamentos-etiqueta',
    // Radar: sólo cuando está activo. Agregarlas de a una evita que el mapa
    // capture clicks sobre capas no montadas (no pasa nada, pero es ruido).
    ...(radarActivo && capasRadarVisibles.peligro ? [CAPA_PELIGRO_FILL_ID] : []),
    ...(radarActivo || esPlanificacion ? [CAPA_PUNTOS_NIVEL_ID] : []),
    // Los cruces de la ruta seleccionada quedan interactivos sólo cuando la
    // geometría de esa ruta está montada.
    ...(hazardOn && rutaGeojson !== null ? [CAPA_CRUCES_ACCESO_ID] : []),
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

    setClusterInfoClic(null)
    setCruceInfoClic(null)

    if (radarActivo || esPlanificacion) {
      const puntoNivel = features.find((item) => item.layer?.id === CAPA_PUNTOS_NIVEL_ID)
      const cue = puntoNivel?.properties?.cueAnexo
      if (typeof cue === 'string') {
        const escuela = dataEscuelasMapaVisible?.escuelas.find((item) => item.cueAnexo === cue)
        if (escuela) handleSeleccionarEscuelaBuscada(escuela)
        return
      }
      if (radarActivo) {
        if (event.lngLat) window.dispatchEvent(new CustomEvent('radar-meteo-map-click', { detail: { lat: event.lngLat.lat, lng: event.lngLat.lng } }))
        return
      }
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
          item.layer?.id === CAPA_PARTES_ESCUELA_ICONO_ID ||
          item.layer?.id === CAPA_PARTES_ESCUELA_SOLUCIONADA_ICONO_ID,
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
      setFichaPestana(panelLateral)
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
    }
  }, [
    radarActivo,
    esPlanificacion,
    dataEscuelasMapaVisible,
    handleSeleccionarEscuelaBuscada,
    departamentoSeleccionado,
    setClusterInfoClic,
    setCruceInfoClic,
    setSeleccionCue,
    setPuntosVisibles,
    setDepartamentoSeleccionado,
    setFichaCerradaCue,
    setFichaPestana,
    panelLateral,
  ])

  useEffect(() => {
    props.onRegistrarSeleccion?.(handleSeleccionarEscuelaBuscada)
    return () => props.onRegistrarSeleccion?.(null)
  }, [props.onRegistrarSeleccion, handleSeleccionarEscuelaBuscada])

  // Encuadre de la ruta, una sola vez, cuando su geometría llega. Elegir una
  // escuela vuela a zoom 14 sobre ella, así que sin esto una ruta de 30 km
  // queda como un trazo vertical de un píxel. El ref se limpia siempre que
  // la geometría corresponde a la escuela pendiente: si viene
  // `{ disponible: false }` no hay bbox que encuadrar.
  useEffect(() => {
    if (encuadreRutaPendiente.current !== cueRuta) return
    if (geometria === null || geometria.cueAnexo !== cueRuta) return
    encuadreRutaPendiente.current = null
    const bbox = bboxRuta(rutaGeojson)
    if (bbox === null) return
    mapRef.current?.getMap()?.fitBounds(bbox, {
      padding: paddingEncuadre(),
      duration: 700,
    })
  }, [geometria, rutaGeojson, cueRuta])

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
    const map = mapRef.current?.getMap()
    if (map) {
      ultimoEstiloCargado.current = mapStyleRef.current
      const handleStyleLoad = () => {
        if (!map.isStyleLoaded()) return
        const estiloCargado = mapStyleRef.current
        if (cambioEstiloCargado(ultimoEstiloCargado.current, estiloCargado, true)) {
          setVersionEstilo((version) => version + 1)
          setIconosClusterListos(false)
        }
        ultimoEstiloCargado.current = estiloCargado
        registrarIconosCluster()
        window.dispatchEvent(new CustomEvent('radar-meteo-map-ready', { detail: map }))
      }
      map.on('style.load', handleStyleLoad)
      window.dispatchEvent(new CustomEvent('radar-meteo-map-ready', { detail: map }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCuesNoAgrupados, setIconosClusterListos])

  // Encuadre de la ruta seleccionada: sólo si la geometría dibujada tiene un
  // bbox real (una ruta ausente dejaría un `fitBounds` inválido). El padding
  // descuenta la columna izquierda, donde también vive la ficha.
  if (error && !data) {
    return (
      <div className={`${styles.status} ${styles.statusError}`}>{error}</div>
    )
  }

  const panelActual = dataVisible ? (
    <>
      {!modoRadar && (
        <>
          <PanelSituacionActual
            escuelas={dataEscuelasMapaVisible?.escuelas ?? []}
            actualizadoEn={actualizadoEn}
            onSeleccionar={(cueAnexo) => {
              const escuela = dataEscuelasMapa?.escuelas.find((item) => item.cueAnexo === cueAnexo)
              if (escuela) handleSeleccionarEscuelaBuscada(escuela)
            }}
          />
        </>
      )}
    </>
  ) : null

  return (
    <div className={styles.shell} ref={shellRef} data-ficha-abierta={fichaAbierta ? 'true' : 'false'} data-radar-activo={radarActivo ? 'true' : 'false'}>
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
          // Los estilos claro y oscuro son distintos: el diff descarta las fuentes propias sin emitir `style.load`.
          styleDiffing={false}
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
          // MapLibre descarta fuentes, capas e imágenes al cambiar el estilo.
          // El style.load (registrado en onLoad) determina el final real de
          // setStyle; styledata también puede pertenecer al estilo anterior.
          onStyleData={() => {
            const map = mapRef.current?.getMap()
            registrarIconosCluster()
            if (map?.isStyleLoaded()) window.dispatchEvent(new CustomEvent('radar-meteo-map-ready', { detail: map }))
          }}
          onMoveEnd={actualizarCuesNoAgrupados}
          onIdle={() => {
            if (entradaPuntosPendiente.current) {
              entradaPuntosPendiente.current = false
              setPuntosVisibles(true)
            }
          }}
        >
          <Fragment key={versionEstilo}>
          <NavigationControl position="top-left" showCompass={!radarActivo} />
          {/* La atribución compacta deja libre la esquina inferior derecha del mapa. */}
          <AttributionControl key={radarActivo ? 'radar-attribution' : 'map-attribution'} position={radarActivo ? 'top-right' : 'bottom-right'} compact />

          <Source id="infra-mascara-src" type="geojson" data={MASCARA_URL}>
            <Layer id={CAPA_MASCARA_ID} type="fill" paint={radarActivo ? { 'fill-color': '#020811', 'fill-opacity': 0.62 } : fillPaintMascara()} />
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
              paint={fillPaintDepartamentos(radarActivo)}
            />
            <Layer
              id={CAPA_DEPARTAMENTOS_BORDE_ID}
              type="line"
              layout={{ visibility: visibilidadCapa(capasVisibles.limitesDepartamentos) }}
              paint={radarActivo ? { 'line-color': '#d6e9f4', 'line-width': 0.7, 'line-opacity': 0.55 } : linePaintDepartamentos()}
            />
            <Layer
              id={CAPA_DEPARTAMENTO_HOVER_ID}
              type="fill"
              paint={fillPaintDepartamentoHover()}
              filter={['==', ['get', 'nombre'], (radarActivo ? departamentoRadarNombre : departamentoSeleccionado) ?? '']}
            />
            <Layer
              id={CAPA_DEPARTAMENTO_HOVER_BORDE_ID}
              type="line"
              paint={linePaintDepartamentoHover()}
              filter={['==', ['get', 'nombre'], (radarActivo ? departamentoRadarNombre : departamentoSeleccionado) ?? '']}
            />
            <Layer
              id="infra-departamentos-etiqueta"
              type="symbol"
              layout={{ ...symbolLayoutDepartamentos(), visibility: visibilidadCapa(capasVisibles.nombresDepartamentos) }}
              paint={symbolPaintDepartamentos(radarActivo)}
            />
          </Source>

          {/*
            Radar (E4): fuente y layers PROPIOS, montados ENCIMA de las capas
            actuales (decisión 2: SUMAR, no reemplazar). Así el modo Radar no
            desmonta nada de lo existente ni toca sus ids. `peligroGeojson`
            reutiliza el mismo departamentosRaw; no hay fetch extra para la
            coropleta.
          */}
          {radarActivo && peligroGeojson && (
            <Source id="infra-peligro-src" type="geojson" data={peligroGeojson}>
              {capasRadarVisibles.peligro && (
                <Layer
                  id={CAPA_PELIGRO_FILL_ID}
                  type="fill"
                  layout={{ visibility: 'none' }}
                  paint={paintCoropletaPeligro()}
                />
              )}
            </Source>
          )}

          {/*
            Riesgo de acceso (E6): capa HERMANA de los puntos de riesgo, apagada
            por defecto (capasRadarVisibles['riesgo-acceso'] arranca en
            false). Esta capa sigue apagada mientras el producto define su disponibilidad.
          */}
          {false && radarActivo && capasRadarVisibles['riesgo-acceso'] && (
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
            Accesos territoriales (T5c2): contexto estático (aislamiento OSM,
            susceptibilidad physrisk, ruta y cruces de la escuela elegida).
            Va DESPUÉS de los departamentos/radar y ANTES del bloque de
            escuelas/partes: las escuelas tienen que quedar por encima y seguir
            siendo clickeables. Sus capas NO se registran en
            `capasInteractivas` — no agregan handlers de click nuevos.
          */}
          {hazardOn && (
            <CapasAccesosTerritoriales
              puntosAislamiento={null}
              puntosInundacion={null}
              ruta={rutaGeojson}
              cruces={crucesGeojson}
              visibles={CAPAS_ACCESOS_OCULTAS}
              iconosListos={iconosClusterListos}
              oscuro={mode === 'dark'}
              mostrarRuta={capasVisibles.rutaAcceso}
              mostrarCruces={capasVisibles.crucesAgua}
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
                // T1.1c: en el cluster `sinActualizar` se agrega como 0/1 con
                // max() — el cluster vale 1 si AL MENOS UNO de sus puntos
                // está sin actualizar (semántica OR), a diferencia de los
                // puntos individuales donde sigue siendo un booleano real.
                sinActualizar: ['max', ['case', ['get', 'sinActualizar'], 1, 0]],
                gravedad: ['max', ['get', 'gravedad']],
                // En el cluster `esEvacuado` se agrega como 0/1 con max() —
                // el cluster vale 1 si AL MENOS UNO de sus puntos es un
                // establecimiento evacuado/centro de evacuados (semántica
                // OR), igual que `sinActualizar`.
                esEvacuado: ['max', ['case', ['get', 'esEvacuado'], 1, 0]],
                // V2: mismo OR pero sólo para centro_evacuados. Es lo que
                // permite elegir el ícono del cluster por prioridad (Tent si
                // hay algún centro, si no DoorOpen si hay algún evacuado), en
                // vez del anillo genérico que no distinguía cuál de los dos
                // estados contenía la burbuja (hallazgo 3).
                esCentroEvacuados: ['max', ['case', ['get', 'esCentroEvacuados'], 1, 0]],
                // Suma de alumnos alcanzados (consecuencia) de los puntos del cluster.
                alumnosAlcanzados: ['+', ['get', 'alumnosAlcanzados']],
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
              {/* Las escuelas sin reporte usan un punto neutro menor. */}
              <Layer
                id={CAPA_PARTES_ID}
                type="circle"
                layout={{ visibility: ocultarPartes ? 'none' : 'visible' }}
                filter={['!', ['has', 'point_count']]}
                paint={{
                  ...circlePaintPartes(mode === 'dark'),
                  'circle-opacity': ['case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], puntosVisibles ? 1 : 0, puntosVisibles ? 0.9 : 0],
                  'circle-opacity-transition': { duration: 180, delay: 0 },
                }}
              />
              {/*
                Q13a: ícono de escuela individual sobre el círculo de
                severidad (que se conserva debajo). El filtro de esta capa
                limita los íconos a las escuelas afectadas, y el
                mismo gate de imágenes registradas que las capas symbol de
                cluster. `icon-allow-overlap` para que no desaparezcan al
                estar juntas. Q13b: esta capa también es interactiva (ver
                `capasInteractivas`), así el click/hover acierta el ícono
                completo y no sólo el centro del círculo.

                Q17: `icon-size: 1.2` agranda la escuela individual (~26 px)
                SÓLO en esta capa; el SVG base compartido queda igual para no
                agrandar de rebote los íconos Tent/DoorOpen de cluster. Las
                variantes de severidad son las mismas en ambos temas.
              */}
              {iconosClusterListos && (
                <Layer
                  id={CAPA_PARTES_ESCUELA_ICONO_ID}
                  type="symbol"
                  filter={filtroIconoEscuelaAfectada()}
                  layout={{
                    visibility: ocultarPartes ? 'none' : 'visible',
                    'icon-image': [
                      'case',
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
              {iconosClusterListos && (
                <Layer
                  id={CAPA_PARTES_ESCUELA_SOLUCIONADA_ICONO_ID}
                  type="symbol"
                  filter={filtroIconoEscuelaSolucionada()}
                  layout={{
                    visibility: ocultarPartes ? 'none' : 'visible',
                    'icon-image': ID_IMAGEN_ESCUELA_SOLUCIONADA,
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
              {/* Los clusters afectados usan la severidad más alta; los que
                  sólo tienen escuelas sin reporte son neutros y más chicos. */}
              <Layer
                id={CAPA_PARTES_CLUSTER_ID}
                type="circle"
                layout={{ visibility: ocultarPartes ? 'none' : 'visible' }}
                filter={['has', 'point_count']}
                paint={{
                  ...circlePaintCluster(mode === 'dark'),
                  'circle-opacity': puntosVisibles ? 1 : 0,
                  'circle-opacity-transition': { duration: 180, delay: 0 },
                }}
              />
              <Layer
                id={CAPA_PARTES_CLUSTER_COUNT_ID}
                type="symbol"
                layout={{
                  'text-field': expresionConteoCluster(),
                  'text-size': 12,
                  'text-font': ['Noto Sans Regular'],
                  'text-allow-overlap': false,
                  visibility: ocultarPartes ? 'none' : 'visible',
                }}
                filter={['has', 'point_count']}
                paint={{
                  'text-color': colorTextoCluster(mode === 'dark'),
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
              {iconosClusterListos && (
                <Layer
                  id={CAPA_CLUSTER_CENTRO_EVACUADOS_ID}
                  type="symbol"
                  filter={['all', ['has', 'point_count'], ['==', ['get', 'esCentroEvacuados'], 1]]}
                  layout={{ ...layoutIconoCluster(ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS), visibility: ocultarPartes ? 'none' : 'visible' }}
                />
              )}
              {iconosClusterListos && (
                <Layer
                  id={CAPA_CLUSTER_EVACUADO_ID}
                  type="symbol"
                  filter={[
                    'all',
                    ['has', 'point_count'],
                    ['==', ['get', 'esEvacuado'], 1],
                    ['==', ['get', 'esCentroEvacuados'], 0],
                  ]}
                  layout={{ ...layoutIconoCluster(ID_IMAGEN_CLUSTER_EVACUADO), visibility: ocultarPartes ? 'none' : 'visible' }}
                />
              )}
            </Source>
          )}

          {mostrarRiesgoSituacion && (
            <CapaRiesgoSituacion puntos={puntosRiesgo} beforeId={CAPA_PARTES_ID} />
          )}

          {/*
            V2: badge de estado por escuela NO agrupada. Mismo criterio de
            visibilidad que tenían los marcadores de evacuación
            (`cuesNoAgrupados`), pero un solo badge que resume la condición de
            mayor prioridad (servicio, evacuación o sin actualizar) en vez de
            anillos/halos/formas apiladas. Sólo se renderizan las escuelas con
            badge (las normales no agregan ruido).
          */}
          {!ocultarPartes && badgesEstado.map((badge) => {
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

          {(radarActivo || esPlanificacion) && (
            <CapaPuntosNivel
              idCapa={CAPA_PUNTOS_NIVEL_ID}
              idFuente={FUENTE_PUNTOS_NIVEL_ID}
              puntos={puntosNivel}
              oscuro={mode === 'dark'}
            />
          )}

          <RadarMeteo
            activo={radarActivo}
            variable={variableRadar}
            escuelas={dataEscuelasMapa?.escuelas ?? []}
            resumen={resumenRadar}
            alertasResaltadas={alertasResaltadas}
            onVerAlertas={irAAlertasRadar}
          />

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
                  <strong>{total}</strong> escuelas · <strong>{afectadas}</strong> con situaciones abiertas ({criticas} críticas, {altas} altas)
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

          </Fragment>
          <CapaLluviaObservada visible={capasVisibles.lluviaObservada} horas={horasLluvia} onMeta={setMetaLluvia} />
          <CapaEstacionesRio visible={capasVisibles.estacionesRio} />
        </MapGL>
      </div>

      {radarActivo ? (
        <LeyendaMapa pestana="radar" horizonte={horizonteEfectivo} estacionesRio={capasVisibles.estacionesRio} lluviaObservada={capasVisibles.lluviaObservada ? metaLluvia : null} />
      ) : props.pestana === 'planificacion' ? (
        <LeyendaMapa pestana="planificacion" vista={vistaPlanificacion} estacionesRio={capasVisibles.estacionesRio} lluviaObservada={capasVisibles.lluviaObservada ? metaLluvia : null} />
      ) : props.pestana === 'actual' ? (
        <LeyendaMapa pestana="actual" estacionesRio={capasVisibles.estacionesRio} lluviaObservada={capasVisibles.lluviaObservada ? metaLluvia : null} />
      ) : null}

      <AlcanceNominalModal
        afectacionId={nominalAfectacionId}
        onOpenChange={(open) => !open && setNominalAfectacionId(null)}
      />

      <HistorialParteModal
        cueAnexo={historialCue}
        onOpenChange={(open) => !open && setHistorialCue(null)}
      />

      {dataVisible && (
        <div
          className={styles.leftStack}
          id="infra-left-stack"
        >
          {!modoRadar && avisoBusqueda && (
            <p role="status" className={styles.hint} data-testid="aviso-busqueda-sin-ubicacion">
              {avisoBusqueda}
            </p>
          )}
          <PanelLateral
            pestana={panelLateral}
            seleccion={fichaAbierta ? seleccionCue : null}
            onCerrarFicha={cerrarFicha}
            cabecera={(
              <>
                {seleccionCue !== null && !fichaAbierta && (
                  <SeleccionEscuela
                    nombre={escuelasPorCue.get(seleccionCue)?.nombre ?? seleccionCue}
                    onVerFicha={() => {
                      setFichaPestana(panelLateral)
                      setFichaCerradaCue(null)
                    }}
                    onQuitarSeleccion={() => {
                      setSeleccionCue(null)
                      setEscuelaResaltada(null)
                      setFichaCerradaCue(null)
                      setFichaPestana(null)
                      setAvisoBusqueda(null)
                      setCruceInfoClic(null)
                    }}
                  />
                )}
                {departamentoSeleccionado && (
                  <ResumenDepartamento
                    nombre={departamentoSeleccionado}
                    totales={totalesPorDepartamento.get(normalizarNombreDepartamento(departamentoSeleccionado)) ?? null}
                    onQuitar={() => {
                      entradaPuntosPendiente.current = true
                      setPuntosVisibles(false)
                      setDepartamentoSeleccionado(null)
                      mapRef.current?.getMap()?.fitBounds(LIMITES_CORRIENTES, { padding: 24 })
                    }}
                  />
                )}
              </>
            )}
            subtitulos={{
              actual: actualizadoEn && ahoraMs !== null ? horaActualizacion(actualizadoEn, ahoraMs) : undefined,
              radar: 'Pronóstico',
            }}
            ficha={fichaAbierta && escuelaSeleccionada ? (
              <FichaEscuelaPanel
                key={seleccionCue}
                escuela={escuelaSeleccionada}
                acceso={(
                  <BloqueAcceso
                    geometria={geometria}
                    exposicion={exposicion}
                    claseEscuela={claseInundacion(territorio?.susceptibilidad?.escuelas[escuelaSeleccionada.cueAnexo]?.claseRio)}
                    juntoLaguna={territorio?.susceptibilidad?.escuelas[escuelaSeleccionada.cueAnexo]?.juntoLaguna === true}
                    cargando={geometriaLoading || exposicionLoading}
                    error={Boolean(geometriaError)}
                  />
                )}
                mostrarEnlaceNominal={props.mostrarEnlaceNominal}
                onVerAlumnosAlcanzados={setNominalAfectacionId}
                onVerHistorialCompleto={() => setHistorialCue(seleccionCue)}
                onCerrar={cerrarFicha}
              />
            ) : undefined}
            actual={panelActual}
            radar={(
              <PanelRadar
                horizonte={horizonteEfectivo}
                disponibles={horizontesDisponibles}
                onHorizonte={setHorizonteSeleccionado}
                variable={variableRadar}
                onVariable={setVariableRadar}
                puntos={radarData?.puntos ?? null}
                escuelas={dataEscuelasMapaVisible?.escuelas ?? []}
                cargando={radarLoading && radarData === null}
                error={radarError}
                onSeleccionar={(cue) => {
                  const escuela = dataEscuelasMapa?.escuelas.find((item) => item.cueAnexo === cue)
                  if (escuela) handleSeleccionarEscuelaBuscada(escuela)
                }}
                alertas={{
                  grupos: gruposAlertasRadar,
                  cargando: resumenRadar === null && !resumenRadarError,
                  error: resumenRadarError && resumenRadar === null,
                  claveSeleccionada: claveAlertaRadar,
                  onSeleccionar: setClaveAlertaRadar,
                }}
                pronostico={{ resumen: resumenRadar, cargando: resumenRadar === null && !resumenRadarError, error: resumenRadarError && resumenRadar === null, departamentoId: radarActivo ? departamentoRadarId : null, onDepartamento: seleccionarDepartamentoRadar }}
              />
            )}
            planificacion={(
              <PanelPlanificacion
                vista={vistaPlanificacion}
                onVista={setVistaPlanificacion}
                escuelas={dataEscuelasMapaVisible?.escuelas ?? []}
                territorio={territorio}
                cargando={contextoTerritorial && territorioLoading}
                error={territorioError !== null}
                onSeleccionar={(cue) => {
                  const escuela = dataEscuelasMapa?.escuelas.find((item) => item.cueAnexo === cue)
                  if (escuela) handleSeleccionarEscuelaBuscada(escuela)
                }}
              />
            )}
            capas={(
              <PanelCapas
                value={basemap}
                onChange={(id) => {
                  setBasemap(id)
                  // Cambiar de base recarga el estilo y descarta las imágenes registradas.
                  setIconosClusterListos(false)
                }}
                capasVisibles={capasVisibles}
                onCapasVisiblesChange={setCapasVisibles}
                horasLluvia={horasLluvia}
                onHorasLluviaChange={setHorasLluvia}
                haySeleccion={seleccionCue !== null}
                riesgoDisponible={contextoTerritorial}
              />
            )}
          />
        </div>
      )}

      {!radarActivo && <FullscreenButton targetRef={props.contenedorPantallaCompleta ?? shellRef} />}

    </div>
  )
}
