'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import MapGL, {
  AttributionControl,
  Layer,
  Marker,
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
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'
import type { PaddingOptions } from 'maplibre-gl'
import { localeMaplibre } from '@/lib/i18n/locale-maplibre'
import { useIdioma } from '@/lib/i18n/idioma-provider'
// V8: MapLibre trae sus cadenas de UI (tooltips de controles, aria-labels) en
// inglés por defecto. `locale` acepta la tabla `{ clave: texto }` de
// `maplibre-gl` y sólo pisa las claves presentes en el objeto, así que acá se
// declaran las que este mapa realmente monta: NavigationControl (zoom y
// orientación), el canvas del mapa (`Map.Title`), los attr de atribución y los
// del popup (`Popup.Close`). En español neutro y profesional.
import {
  MapPin,
} from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import { PanelLateral } from '@/components/mapas/panel-lateral'
import { PanelCapas } from '@/components/mapas/panel-capas'
import { ResumenDepartamento } from '@/components/mapas/resumen-departamento'
import { desgloseSuperficies, superficieVia } from '@/lib/infraestructura/mapa/acceso'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { Button } from '@/components/ui/button'
// Veredicto diario: punto de entrada mínimo (ver odd/tasks/veredicto-diario-ia.md, Integración)
import { VeredictoModal } from '@/components/veredicto/veredicto-modal'
import { useThemeMode } from '@/app/providers'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { ControlesZoom } from '@/components/mapas/controles-zoom'
import { bboxGeometria } from '@/lib/mapas/geo'
import { aquietarBasemap } from '@/lib/mapas/basemap-sereno'
import { horaActualizacion, PanelSituacionActual } from '@/components/mapas/panel-situacion-actual'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { PanelRadar } from '@/components/mapas/panel-radar'
import { PanelPlanificacion } from '@/components/mapas/panel-planificacion'
import { FichaEscuelaPanel } from '@/components/mapas/ficha-escuela-panel'
import { useDraftCounts } from '@/components/infraestructura/borradores/use-draft-counts'
import { BloqueAcceso } from '@/components/mapas/bloque-acceso'
import { BloqueCentroEvacuados } from '@/components/mapas/bloque-centro-evacuados'
import { CapaCentroEvacuados } from '@/components/mapas/capa-centro-evacuados'
import { construirCaminoCentro } from '@/lib/infraestructura/evacuacion/mapa'
import { useCentroEvacuados } from '@/lib/infraestructura/use-centro-evacuados'
import { AlcanceNominalModal } from '@/components/infraestructura/alcance-nominal-modal'
import { HistorialParteModal } from '@/components/infraestructura/historial-parte-modal'
import {
  construirUrlFichaEscuela,
  guardarSnapshotRetornoMapa,
  type EstadoCamaraMapa,
} from '@/lib/infraestructura/mapa/estado-retorno'
import {
  type CapaAccesos,
  type CapaRadar,
} from '@/components/mapas/layer-control'
import { LeyendaMapa } from '@/components/mapas/leyenda-mapa'
import { CAPA_ESTACIONES_RIO_ID, CapaEstacionesRio } from '@/components/mapas/capa-estaciones-rio'
import { CapaLluviaObservada, ID_CAPA_LLUVIA_HIT, type HorasLluvia, type MetaLluviaObservada } from '@/components/mapas/capa-lluvia-observada'
import { TarjetaCruceAgua } from '@/components/mapas/tarjeta-cruce-agua'
import {
  CapasAccesosTerritoriales,
  CAPA_CRUCES_ACCESO_ID,
  bboxRuta,
} from '@/components/mapas/capas-accesos'
import { RadarMeteo } from '@/components/mapas/radar-meteo/radar-meteo'
import { PronosticoEscuelaBloque } from '@/components/mapas/radar-meteo/escuela-card'
import type { VariableRadarUI } from '@/components/mapas/radar-meteo/selector'
import { agruparAlertas } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'
import { useResumenRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-resumen-radar-meteo'
import { useRadar } from '@/lib/infraestructura/use-radar'
import { colapsarAtribucion } from '@/lib/infraestructura/mapa/atribucion'
import { CAPAS_VISIBLES_DEFAULT, guardarCapas, leerCapasGuardadas, visibilidadCapa, type CapasVisibles } from '@/lib/infraestructura/mapa/capas'
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
  construirEdificioEscuela,
  ETIQUETAS_CRUCE,
  iconosAccesosMapa,
  claseInundacion,
  type ClasificacionCruce,
} from '@/lib/mapas/accesos-capas'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import {
  agregarEscuelasCaidasPorDepartamento,
  COLORES_DEPARTAMENTO,
  DEPARTAMENTOS_INFRA_URL,
  MASCARA_INFRA_URL,
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
import { COLOR_SIN_AFECTACION, construirEscuelasMapaFeatureCollection } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'
import type { EscuelaMapaPadron, EscuelasMapaPadronResultado, ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import {
  circlePaintEscuelasSinReporte,
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
import { construirPuntosNivel, puntosRadarVisibles } from '@/lib/infraestructura/mapa/puntos-nivel'
import { coloresRadar, escuelasPorRiesgo } from '@/lib/infraestructura/mapa/radar'
import { coloresPlanificacion, etiquetaNivelPlan, nivelPlanificacion, tituloLeyendaVista, VISTA_PLANIFICACION_DEFAULT, VISTAS_ESTRUCTURALES } from '@/lib/infraestructura/mapa/planificacion'
import type { VistaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import { CapaPuntosNivel, CapaRiesgoSituacion } from '@/components/mapas/capa-puntos-nivel'
import { mantenerPopupsVisibles } from '@/components/mapas/popups-visibles'
import { instalarGanchoE2E } from '@/components/mapas/e2e-hook'
import { puntosRiesgoSobreSituacion } from '@/lib/infraestructura/mapa/puntos-nivel'
import {
  iconosClusterMapa,
  idImagenBadgeEstado,
  OFFSET_BADGE_ESQUINA,
  ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS,
  ID_IMAGEN_CLUSTER_EVACUADO,
  ID_IMAGEN_ESCUELA_ALTA,
  ID_IMAGEN_ESCUELA_BAJA,
  ID_IMAGEN_ESCUELA_CRITICA,
  ID_IMAGEN_ESCUELA_MEDIA,
  ID_IMAGEN_ESCUELA_SOLUCIONADA,
} from '@/lib/mapas/iconos-mapa'
import { COLORES_MAPA_CLARO, coloresMapa } from '@/lib/mapas/colores-mapa'
import { registrarImagenesSvg } from '@/lib/mapas/insignias-mapa'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import type { RegionPublica } from '@/lib/infraestructura/region/esquema'
import { regionPublicaActual } from '@/lib/infraestructura/region/publica'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa, type PestanaMapa } from '@/lib/infraestructura/mapa/tipos'

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
const CAPA_PARTES_CLUSTER_HALO_ID = 'infra-partes-cluster-halo'
const CAPA_PARTES_CLUSTER_COUNT_ID = 'infra-partes-cluster-count'

// Umbral de clustering: sólo `clusterMaxZoom` de la fuente de escuelas — el
// zoom al que supercluster deja de agrupar en clusters. Ni el badge por
// escuela ni el ícono de evacuación del cluster dependen de este umbral:
// derivan su visibilidad del estado de clustering REAL del mapa (ver
// `cuesNoAgrupados` y los agregados de clusterProperties).
// T4: split earlier (zoom 10) so a couple of clicks reach individual schools.
const CAPA_PARTES_CLUSTER_MAX_ZOOM = 10
const RADIO_AGRUPAMIENTO_CLUSTER = 32

// V2: badge de estado por escuela individual. Un único ícono Lucide
// superpuesto al punto de color reemplaza a los anillos/halos apilados que
// codificaban servicio (grosor/opacidad) y "sin actualizar" (halo gris), y a
// las formas CSS de evacuación. Es una capa `symbol` con el mismo rasterizado
// y offset que el badge del cluster, y sólo se dibuja sobre escuelas NO
// agrupadas (`cuesNoAgrupados`),
// igual que antes hacían los marcadores de evacuación. El ícono comunica QUÉ
// pasa; el color del punto sigue comunicando CUÁN grave es (nunca una
// segunda escala de color). Prioridad (una sola por escuela) en
// `iconoEstadoEscuela` (lib/mapas/severidad-visual.ts).
const CAPA_BADGE_ESTADO_ID = 'infra-badge-estado'
const FUENTE_BADGE_ESTADO_ID = 'infra-badge-estado-src'
const TAMANO_BADGE_ESTADO = 18

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
// Affected-school clusters stay above river station pins so their counts read.
const CAPAS_SOBRE_ESTACIONES = [
  CAPA_PARTES_CLUSTER_HALO_ID,
  CAPA_PARTES_CLUSTER_ID,
  CAPA_PARTES_CLUSTER_COUNT_ID,
  CAPA_CLUSTER_CENTRO_EVACUADOS_ID,
  CAPA_CLUSTER_EVACUADO_ID,
] as const
const CAPA_PARTES_ESCUELA_SOLUCIONADA_ICONO_ID = 'infra-partes-escuela-solucionada-icono'

// Color de foco/realce de la escuela seleccionada: mismo valor que el token
// `--marker` (= `--yellow`, globals.css) que el hub usa para selección/foco.
// MapLibre no resuelve var() en el paint, así que se repite el literal.
const COLOR_FOCO_SELECCION = COLORES_MAPA_CLARO.foco

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
const CAPA_RIESGO_HOY_ID = 'infra-riesgo-hoy'
const FUENTE_RIESGO_HOY_ID = 'infra-riesgo-hoy-src'

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
    'icon-size': 1,
    'icon-anchor': 'center',
    'icon-offset': expresionOffsetBadgeCluster(),
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

// Color NEUTRO del borde del punto y del badge (el color de severidad ya está
// tomado por el relleno; reusarlo para el estado sería una segunda escala). El
// borde es un trazo mínimo que separa el punto del fondo: tinta oscura en el
// tema claro y clara en el oscuro, donde `#1c1c1c` se perdía sobre el basemap.
const anilloColor = (oscuro = false) => coloresMapa(oscuro).tinta

// Los clusters afectados usan la gravedad más alta presente. Un cluster que
// contiene sólo escuelas sin reporte es un disco suave y chico que retrocede.
export function colorPorSeveridadRango(oscuro = false): ExpressionSpecification {
  const colorFondo = coloresMapa(oscuro).clusterNeutro
  const expresion: ExpressionSpecification = [
    'case', ['==', ['get', 'escuelasAfectadas'], 0], colorFondo,
    ['==', ['get', 'gravedad'], 0], colorFondo, colorSeveridad(SEVERIDADES[0]),
  ]
  for (let i = SEVERIDADES.length - 1; i >= 1; i--) {
    expresion.splice(expresion.length - 1, 0, ['>=', ['get', 'gravedad'], i + 1], colorSeveridad(SEVERIDADES[i]))
  }
  return expresion
}

// El radio del cluster sube por tramos con la cantidad de escuelas.
export const RADIO_CLUSTER_MENOR = 15
export const RADIO_CLUSTER_MEDIO = 19
export const RADIO_CLUSTER_MAYOR = 23

export function expresionRadioCluster(): ExpressionSpecification {
  return ['step', ['get', 'point_count'], RADIO_CLUSTER_MENOR, 10, RADIO_CLUSTER_MEDIO, 50, RADIO_CLUSTER_MAYOR]
}

export function expresionRadioClusterSinReporte(): ExpressionSpecification {
  return ['step', ['get', 'point_count'], 9, 10, 11, 50, 13]
}

// Badge de evacuación en la esquina superior derecha del cluster: el offset
// sigue al radio para que el badge quede sobre el borde y no tape el número.
export function expresionOffsetBadgeCluster(): ExpressionSpecification {
  return ['step', ['get', 'point_count'], ['literal', [12, -12]], 10, ['literal', [15, -15]], 50, ['literal', [18, -18]]]
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
      coloresMapa(oscuro).clusterNeutro, ['get', 'color'],
    ],
    'circle-opacity': ['case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], 1, 0.9],
    'circle-stroke-color': [
      'case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'],
      coloresMapa(oscuro).halo, anilloColor(oscuro),
    ],
    'circle-stroke-width': ['case', ['==', ['get', 'estado'], 'sin_afectacion_reportada'], 1.5, 1],
  }
}

// Neutral clusters: soft fill, no ring. Affected clusters: severity fill with
// a white rim that lifts them off the basemap.
export function circlePaintCluster(oscuro = false): CircleLayerSpecification['paint'] {
  return {
    'circle-color': colorPorSeveridadRango(oscuro),
    'circle-radius': [
      'case', ['==', ['get', 'escuelasAfectadas'], 0], expresionRadioClusterSinReporte(), expresionRadioCluster(),
    ],
    'circle-stroke-color': coloresMapa(oscuro).halo,
    'circle-stroke-width': ['case', ['==', ['get', 'escuelasAfectadas'], 0], 0, 2],
  }
}

// Halo del cluster: sólo los afectados llevan un anillo difuso de su propio
// color de severidad; los neutros no tienen halo y retroceden.
export function circlePaintHaloCluster(oscuro = false): CircleLayerSpecification['paint'] {
  return {
    'circle-color': colorPorSeveridadRango(oscuro),
    'circle-radius': ['+', expresionRadioCluster(), 7],
    'circle-opacity': ['case', ['==', ['get', 'escuelasAfectadas'], 0], 0, 0.22],
    'circle-blur': 0.5,
  }
}

export function expresionConteoCluster(): ExpressionSpecification {
  return ['to-string', ['case', ['==', ['get', 'escuelasAfectadas'], 0], ['get', 'point_count'], ['get', 'escuelasAfectadas']]]
}

export function colorTextoCluster(oscuro = false): ExpressionSpecification {
  return ['case', ['==', ['get', 'escuelasAfectadas'], 0], coloresMapa(oscuro).clusterNeutroTexto, ['<=', ['get', 'severidadRango'], 1], '#1c1c1c', '#ffffff']
}

export function filtroIconoEscuelaAfectada(): FilterSpecification {
  return ['all', ['!', ['has', 'point_count']], ['==', ['get', 'estado'], 'afectada']]
}

export function filtroIconoEscuelaSolucionada(): FilterSpecification {
  return ['all', ['!', ['has', 'point_count']], ['==', ['get', 'solucionadaReciente'], true]]
}

// Popup del cruce de agua clickeado: misma forma (anclado al `lngLat` del
// evento) que el del departamento. Guarda la CLASE del cruce, no su texto: la
// etiqueta sale de `ETIQUETAS_CRUCE`, la única fuente de verdad del dominio.
type InfoCruceClic = {
  lng: number
  lat: number
  clasificacion: ClasificacionCruce
  // Position in the route's `cruces` (set by `construirCrucesAcceso`); null if absent.
  indice: number | null
  nombreCurso: string | null
  nombrePuente: string | null
  // IMERG cell under the crossing when the observed-rain layer is on.
  lluvia: { mm: number; horas: HorasLluvia } | null
}

const OFFSET_POPUP_DEPARTAMENTO: [number, number] = [0, -12]

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

  const top = PADDING_ENCUADRE_BASE
  const bottom = PADDING_ENCUADRE_BASE
  const left = PADDING_ENCUADRE_BASE + (ancho > 720 ? ANCHO_COLUMNA_IZQUIERDA : 0)
  const right = PADDING_ENCUADRE_BASE + (ancho > 720 ? 296 : 0)

  return recortarPadding({ top, bottom, left, right }, ancho, alto)
}

/**
 * Recorte proporcional: si el padding se come más del 80% de la ventana no
 * queda caja para el bbox y MapLibre tira. Se achica el par culpable (el
 * horizontal o el vertical) en la misma proporción, no a pelo.
 */
function recortarPadding(padding: { top: number; bottom: number; left: number; right: number }, ancho: number, alto: number): PaddingOptions {
  let { top, bottom, left, right } = padding
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

// Encuadre de la provincia (inicial, "Ver provincia" y salida de un departamento).
// En escritorio (>720 px) la columna "Situación actual" ocupa hasta x≈440, la
// leyenda (desde 1280 px, abierta) hasta 360 px del borde derecho y la barra de
// filtros cubre ~60 px arriba. Sin ese margen las estaciones de los bordes
// quedaban tapadas.
const PADDING_PROVINCIA_BASE = 24
const PADDING_PROVINCIA_TOP = 80
const PADDING_PROVINCIA_IZQUIERDA = 456
const PADDING_PROVINCIA_DERECHA = 360

/** Padding de `fitBounds` para la provincia completa, esquivando los paneles flotantes. */
export function paddingProvincia(): PaddingOptions {
  if (typeof window === 'undefined') return { top: PADDING_PROVINCIA_BASE, bottom: PADDING_PROVINCIA_BASE, left: PADDING_PROVINCIA_BASE, right: PADDING_PROVINCIA_BASE }
  const ancho = window.innerWidth
  const alto = window.innerHeight
  if (ancho <= 720) return { top: PADDING_PROVINCIA_BASE, bottom: PADDING_PROVINCIA_BASE, left: PADDING_PROVINCIA_BASE, right: PADDING_PROVINCIA_BASE }
  return recortarPadding(
    {
      top: PADDING_PROVINCIA_TOP,
      bottom: PADDING_PROVINCIA_BASE,
      left: PADDING_PROVINCIA_IZQUIERDA,
      right: ancho >= 1280 ? PADDING_PROVINCIA_DERECHA : PADDING_PROVINCIA_BASE,
    },
    ancho,
    alto,
  )
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
// Vista inicial del radar: el centro y zoom de la región, no literales de Corrientes.
export function vistaRadarDeRegion(region: RegionPublica): { center: [number, number]; zoom: number } {
  return { center: region.vistaInicial.centro, zoom: region.vistaInicial.zoom }
}

// Fuente de departamentos cuando el GeoJSON no se pudo cargar (región sin
// datasets publicados): las capas siguen montadas pero no dibujan nada, sin
// volver a pedir la URL que ya respondió con error.
const DEPARTAMENTOS_SIN_DATOS = { type: 'FeatureCollection' as const, features: [] }

export default function MapInfraestructuraPage(props: {
  // Región pública; por defecto la activa en el cliente.
  region?: RegionPublica
  mostrarEnlaceNominal: boolean
  escuelasMapa: EscuelasMapaPadronResultado | null
  pestana: Exclude<PestanaMapa, 'estadisticas' | 'capas' | 'metodologia' | 'exportar'>
  panel?: Exclude<PestanaMapa, 'estadisticas' | 'metodologia' | 'exportar'>
  hazardContextEnabled?: boolean
  riskRadarEnabled?: boolean
  seasonalEnabled?: boolean
  visible?: boolean
  onRegistrarSeleccion?: (
    fn: ((escuela: EscuelaMapaPadron, opciones?: { conservarCamara?: boolean }) => void) | null
  ) => void
  // Element that fullscreen should cover (tabs, filters and map). Defaults to the map shell.
  contenedorPantallaCompleta?: RefObject<HTMLElement | null>
  filtrosActivos?: FiltrosMapa
}) {
  const idiomaMapa = useIdioma()
  const panel = props.panel ?? props.pestana
  const panelLateral = panel === 'radar' && !(props.riskRadarEnabled ?? false) ? 'actual' : panel
  const styles = useOverlayStyles()
  const { mode } = useThemeMode()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const soltarPopupsVisibles = useRef<(() => void) | null>(null)
  useEffect(() => () => soltarPopupsVisibles.current?.(), [])
  const t = useTextos().panelesMapa
  const dictMapa = useTextos()
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [capasVisibles, setCapasVisibles] = useState<CapasVisibles>(CAPAS_VISIBLES_DEFAULT)
  // Restored after mount (not in the initializer) so server and client render the same first frame.
  const capasRestauradas = useRef(false)
  useEffect(() => {
    if (!capasRestauradas.current) {
      capasRestauradas.current = true
      setCapasVisibles(leerCapasGuardadas(almacenLocal()))
      return
    }
    guardarCapas(almacenLocal(), capasVisibles)
  }, [capasVisibles])
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
  // Veredicto diario: punto de entrada mínimo (ver odd/tasks/veredicto-diario-ia.md, Integración)
  const [veredictoAbierto, setVeredictoAbierto] = useState(false)
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

  const [vistaPlanificacion, setVistaPlanificacion] = useState<VistaPlanificacion>(VISTA_PLANIFICACION_DEFAULT)
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
        const vista = vistaRadarDeRegion(props.region ?? regionPublicaActual())
        map.flyTo({ center: vista.center, zoom: vista.zoom, duration: 900 })
      } else if (radarAnterior && vistaPreviaRadar.current) {
        map.flyTo({ ...vistaPreviaRadar.current, duration: 700 })
      }
    }
    setCruceInfoClic(null)
  }, [modoRadar, props.pestana, props.riskRadarEnabled, props.region])
  // "Escuelas en riesgo hoy" outside Radar reuses the same engine snapshot.
  // Planificación › Riesgo hoy colorea el mapa con el motor: no depende de riskRadarEnabled
  // y reemplaza a la capa superpuesta para no dibujar el riesgo dos veces.
  const riesgoPlanificacion = esPlanificacion && vistaPlanificacion === 'riesgo'
  const riesgoHoyFueraDeRadar = !radarActivo && !riesgoPlanificacion && (props.riskRadarEnabled ?? false) && capasVisibles.escuelasEnRiesgo
  const { data: radarData, loading: radarLoading, error: radarError } = useRadar(
    filtrosRadar,
    radarActivo || esPlanificacion || riesgoHoyFueraDeRadar,
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
  const borradoresMapa = useDraftCounts()
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
    if (radarActivo || riesgoPlanificacion) {
      return coloresRadar(radarData?.puntos ?? [], escuelasVisibles, horizonteEfectivo)
    }
    if (esPlanificacion && vistaPlanificacion !== 'riesgo') return coloresPlanificacion(escuelasVisibles, vistaPlanificacion, { territorio })
    return new Map<string, string>()
  }, [
    radarActivo,
    riesgoPlanificacion,
    esPlanificacion,
    radarData,
    dataEscuelasMapaVisible,
    horizonteEfectivo,
    vistaPlanificacion,
    territorio,
  ])
  const puntosNivel = useMemo(() => {
    const escuelasVisibles = dataEscuelasMapaVisible?.escuelas ?? []
    const puntos = construirPuntosNivel(escuelasVisibles, colorPorCue)
    if (radarActivo || riesgoPlanificacion) {
      const nivelPorCue = new Map(escuelasPorRiesgo(radarData?.puntos ?? [], escuelasVisibles, horizonteEfectivo)
        .map(({ escuela, nivel }) => [escuela.cueAnexo, nivel]))
      return puntosRadarVisibles(puntos, nivelPorCue)
    }
    return puntos
  }, [dataEscuelasMapaVisible, colorPorCue, riesgoPlanificacion, radarActivo, radarData, horizonteEfectivo])
  const puntosRiesgoHoy = useMemo(() => {
    if (!riesgoHoyFueraDeRadar) return construirPuntosNivel([], new Map())
    const escuelasVisibles = dataEscuelasMapaVisible?.escuelas ?? []
    const nivelPorCue = new Map(escuelasPorRiesgo(radarData?.puntos ?? [], escuelasVisibles, horizonteEfectivo)
      .map(({ escuela, nivel }) => [escuela.cueAnexo, nivel]))
    const puntos = construirPuntosNivel(escuelasVisibles, coloresRadar(radarData?.puntos ?? [], escuelasVisibles, horizonteEfectivo))
    const visibles = puntosRadarVisibles(puntos, nivelPorCue)
    return { ...visibles, features: visibles.features.filter((feature) => (feature.properties.peso ?? 0) > 0) }
  }, [riesgoHoyFueraDeRadar, dataEscuelasMapaVisible, radarData, horizonteEfectivo])
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

  // Cierre con Esc del popup de cruce abierto por clic.
  useEffect(() => {
    if (!cruceInfoClic) return
    const alPresionarTecla = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
        setCruceInfoClic(null)
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [cruceInfoClic])

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
  const fuenteBadgesEstado = useMemo<FeatureCollection<Point, { imagen: string }>>(() => ({
    type: 'FeatureCollection',
    features: badgesEstado.map((badge) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [badge.lng, badge.lat] },
      properties: { imagen: idImagenBadgeEstado(badge.icono) },
    })),
  }), [badgesEstado])

  const badgesBorradores = useMemo(() => {
    if (cuesNoAgrupados === null || ocultarPartes) return []
    return (dataEscuelasMapaVisible?.escuelas ?? []).flatMap((escuela) => {
      const count = borradoresMapa.counts.get(escuela.cueAnexo) ?? 0
      if (count < 1 || escuela.lat === null || escuela.lon === null || !cuesNoAgrupados.has(escuela.cueAnexo)) return []
      return [{ cue: escuela.cueAnexo, nombre: escuela.nombre, lat: escuela.lat, lon: escuela.lon, count }]
    })
  }, [borradoresMapa.counts, cuesNoAgrupados, dataEscuelasMapaVisible, ocultarPartes])

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

  const [errorGeografia, setErrorGeografia] = useState(false)
  const [intentoGeografia, setIntentoGeografia] = useState(0)
  const limitesCorrientes = useMemo<[[number, number], [number, number]] | null>(() => {
    if (!departamentosRaw) return null
    const puntos = departamentosRaw.features.flatMap((f) => f.geometry.type === 'Polygon'
      ? f.geometry.coordinates.flat() : f.geometry.coordinates.flat(2))
    if (!puntos.length) return null
    return [[Math.min(...puntos.map((p) => p[0])), Math.min(...puntos.map((p) => p[1]))],
      [Math.max(...puntos.map((p) => p[0])), Math.max(...puntos.map((p) => p[1]))]]
  }, [departamentosRaw])

  // Sin departamentos (sin límites), el encuadre de la provincia cae a la vista
  // inicial de la región en vez de fitBounds sobre un bbox inexistente.
  const vistaInicialRegion = useMemo(
    () => vistaRadarDeRegion(props.region ?? regionPublicaActual()),
    [props.region],
  )
  const encuadrarProvincia = useCallback((opciones: { padding: PaddingOptions; duration?: number }) => {
    const mapa = mapRef.current?.getMap()
    if (!mapa) return
    if (limitesCorrientes) mapa.fitBounds(limitesCorrientes, opciones)
    else mapa.flyTo({ center: vistaInicialRegion.center, zoom: vistaInicialRegion.zoom, duration: opciones.duration })
  }, [limitesCorrientes, vistaInicialRegion])

  // Closing the preview deselects the school and returns to the province view.
  const cerrarFicha = useCallback(() => {
    setSeleccionCue(null)
    setEscuelaResaltada(null)
    setFichaCerradaCue(null)
    setFichaPestana(null)
    setAvisoBusqueda(null)
    setCruceInfoClic(null)
    encuadrarProvincia({ padding: paddingProvincia(), duration: 600 })
  }, [encuadrarProvincia])

  useEffect(() => {
    const contenedor = mapRef.current?.getMap().getContainer()
    if (contenedor) colapsarAtribucion(contenedor)
  }, [radarActivo, versionEstilo, departamentosRaw])

  useEffect(() => {
    let cancelado = false
    fetch(DEPARTAMENTOS_INFRA_URL)
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error('Geografía no disponible')
        return respuesta.json()
      })
      .then((geojson: FeatureCollection<
        Polygon | MultiPolygon,
        { nombre: string; id?: string; centroide?: { lon: number; lat: number } }
      >) => {
        if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features) || !geojson.features.length) throw new Error('Geografía inválida')
        if (!cancelado) setDepartamentosRaw(geojson)
      })
      .catch(() => { if (!cancelado) setErrorGeografia(true) })
    return () => {
      cancelado = true
    }
  }, [intentoGeografia])

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
  // Veredicto diario: punto de entrada mínimo (ver odd/tasks/veredicto-diario-ia.md, Integración)
  const centrarDepartamentoVeredicto = (id: string) => {
    const feature = departamentosRaw?.features.find((item) => normalizarNombreDepartamento(item.properties.nombre) === id)
    const centroide = feature?.properties.centroide
    if (centroide) {
      mapRef.current?.getMap()?.flyTo({ center: [centroide.lon, centroide.lat], zoom: 8, duration: 800 })
    }
    setVeredictoAbierto(false)
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
  // duplica el fetch de DEPARTAMENTOS_INFRA_URL). El radar entrega una fila por
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
  // El borde de los íconos depende del tema; los handlers de `style.load` se
  // registran una sola vez, así que leen el tema vigente desde un ref.
  const oscuroRef = useRef(mode === 'dark')
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
    for (const sinUb of dataEscuelasMapa?.sinUbicacion ?? []) {
      if (!index.has(sinUb.cueAnexo)) {
        index.set(sinUb.cueAnexo, {
          cueAnexo: sinUb.cueAnexo,
          nombre: sinUb.nombre,
          departamento: sinUb.departamento,
          localidad: sinUb.localidad,
          lat: null,
          lon: null,
          estado: 'sin_afectacion_reportada',
          niveles: [],
          alumnos: 0,
          gravedad: 0,
          categoriaPrincipal: null,
          clases: 'normal',
          apoyo: null,
          sinActualizar: false,
          ultimaNovedad: null,
          alumnosSinClases: 0,
          situacionesHistoricas: 0,
          solucionadasRecientes: 0,
        })
      }
    }
    return index
  }, [dataEscuelasMapa])

  const escuelaSeleccionada = seleccionCue ? (escuelasPorCue.get(seleccionCue) ?? null) : null
  const parteSeleccionado = seleccionCue ? (partesPorCue.get(seleccionCue) ?? null) : null

  const quitarSeleccion = useCallback(() => {
    setSeleccionCue(null)
    setEscuelaResaltada(null)
    setFichaCerradaCue(null)
    setFichaPestana(null)
    setAvisoBusqueda(null)
    setCruceInfoClic(null)
  }, [])

  const urlFichaCompleta = useMemo(() => {
    if (!escuelaSeleccionada) return undefined
    const filtros = props.filtrosActivos ?? FILTROS_MAPA_VACIOS
    const filtrosConDepto: FiltrosMapa =
      departamentoSeleccionado && !filtros.departamentos.includes(departamentoSeleccionado)
        ? { ...filtros, departamentos: [...filtros.departamentos, departamentoSeleccionado] }
        : filtros
    return construirUrlFichaEscuela(escuelaSeleccionada.cueAnexo, {
      tab: panelLateral,
      filtros: filtrosConDepto,
      horizonte: horizonteEfectivo,
      variable: variableRadar,
      vista: vistaPlanificacion,
      desdeMapa: true,
    })
  }, [
    escuelaSeleccionada,
    panelLateral,
    props.filtrosActivos,
    departamentoSeleccionado,
    horizonteEfectivo,
    variableRadar,
    vistaPlanificacion,
  ])

  const guardarSnapshotAlAbrirFicha = useCallback(() => {
    if (!escuelaSeleccionada) return
    const map = mapRef.current?.getMap()
    let camara: EstadoCamaraMapa | null = null
    if (map && typeof map.getCenter === 'function') {
      const c = map.getCenter()
      camara = {
        lng: c.lng,
        lat: c.lat,
        zoom: typeof map.getZoom === 'function' ? map.getZoom() : 10,
        bearing: typeof map.getBearing === 'function' ? map.getBearing() : 0,
        pitch: typeof map.getPitch === 'function' ? map.getPitch() : 0,
      }
    }
    guardarSnapshotRetornoMapa({
      version: 1,
      origen: 'mapa',
      tab: panelLateral,
      ultimaPestanaMapa: panelLateral,
      filtros: props.filtrosActivos ?? FILTROS_MAPA_VACIOS,
      seleccionCue: escuelaSeleccionada.cueAnexo,
      previewAbierto: true,
      camara,
      basemap,
      capasVisibles,
      horasLluvia,
      horizonteSeleccionado: horizonteEfectivo,
      variableRadar,
      vistaPlanificacion,
      departamentoSeleccionado,
      departamentoRadarId,
    })
  }, [
    escuelaSeleccionada,
    panelLateral,
    props.filtrosActivos,
    basemap,
    capasVisibles,
    horasLluvia,
    horizonteEfectivo,
    variableRadar,
    vistaPlanificacion,
    departamentoSeleccionado,
    departamentoRadarId,
  ])

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

  // Camino al centro de evacuados más cercano: se pide recién cuando la persona
  // aprieta el botón de la ficha, y se oculta solo al cambiar de escuela.
  const [centroCaminoCue, setCentroCaminoCue] = useState<string | null>(null)
  const centroCaminoVisible = cueRuta !== null && centroCaminoCue === cueRuta
  const {
    data: centroEvacuados,
    loading: centroEvacuadosLoading,
    error: centroEvacuadosError,
  } = useCentroEvacuados(cueRuta, centroCaminoVisible)
  const caminoCentro = useMemo(() => {
    if (!centroCaminoVisible || centroEvacuados === null || centroEvacuados.cueAnexo !== cueRuta) return null
    const origen = cueRuta !== null ? escuelasPorCue.get(cueRuta) : null
    return construirCaminoCentro(
      centroEvacuados,
      origen && origen.lat !== null && origen.lon !== null ? { lat: origen.lat, lon: origen.lon } : null,
    )
  }, [centroCaminoVisible, centroEvacuados, cueRuta, escuelasPorCue])
  useEffect(() => {
    if (caminoCentro === null) return
    const bbox = bboxRuta(caminoCentro.linea)
    if (bbox === null) return
    mapRef.current?.getMap()?.fitBounds(bbox, { padding: paddingEncuadre(), duration: 700 })
  }, [caminoCentro])

  const rutaGeojson = useMemo(() => construirRutaAcceso(geometria), [geometria])
  const crucesGeojson = useMemo(() => construirCrucesAcceso(geometria), [geometria])
  // La huella del edificio toma el mismo color que el pin de la escuela elegida.
  const colorEscuelaRuta = useMemo(() => {
    if (cueRuta === null) return COLOR_SIN_AFECTACION
    return colorPorCue.get(cueRuta)
      ?? featureCollectionPadron.features.find((f) => f.properties.cueAnexo === cueRuta)?.properties.color
      ?? COLOR_SIN_AFECTACION
  }, [cueRuta, colorPorCue, featureCollectionPadron])
  const edificioGeojson = useMemo(
    () => construirEdificioEscuela(geometria, colorEscuelaRuta),
    [geometria, colorEscuelaRuta],
  )

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
  const handleSeleccionarEscuelaBuscada = useCallback(
    (escuela: EscuelaMapaPadron, opciones?: { conservarCamara?: boolean }) => {
      if (escuela.lat === null || escuela.lon === null) {
        setAvisoBusqueda(t.mapaAvisoSinUbicacion(escuela.nombre))
        setEscuelaResaltada(null)
        setSeleccionCue(escuela.cueAnexo)
        setFichaCerradaCue(null)
        setFichaPestana(panelLateral)
        if (!opciones?.conservarCamara) {
          encuadreRutaPendiente.current = escuela.cueAnexo
        }
        return
      }
      setAvisoBusqueda(null)
      setEscuelaResaltada({ cueAnexo: escuela.cueAnexo, lng: escuela.lon, lat: escuela.lat })
      if (!opciones?.conservarCamara) {
        mapRef.current?.getMap()?.flyTo({ center: [escuela.lon, escuela.lat], zoom: 14, duration: 900 })
        encuadreRutaPendiente.current = escuela.cueAnexo
      }
      setSeleccionCue(escuela.cueAnexo)
      setFichaCerradaCue(null)
      setFichaPestana(panelLateral)
    },
    [panelLateral, t],
  )

  // Lista de riesgo, marcadores del radar y bloque territorial seleccionan por CUE.
  const seleccionarPorCue = useCallback((cue: string) => {
    const escuela = escuelasPorCue.get(cue) ?? dataEscuelasMapa?.escuelas.find((item) => item.cueAnexo === cue)
    if (escuela) handleSeleccionarEscuelaBuscada(escuela)
  }, [escuelasPorCue, dataEscuelasMapa, handleSeleccionarEscuelaBuscada])

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
    ...(riesgoHoyFueraDeRadar ? [CAPA_RIESGO_HOY_ID] : []),
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
      const expansion = await source.getClusterExpansionZoom(clusterId)
      // Always move at least one level so the click is visibly answered.
      const zoom = Math.max(expansion, mapa.getZoom() + 1)
      mapa.easeTo({ center: [coords[0], coords[1]], zoom, duration: 500 })
    } catch {
      // Cualquier fallo (fuente todavía cargando, supercluster no listo) es
      // ruido transitorio: mejor no hacer nada que romper el flujo del mapa.
    }
  }

  const handleClick = useCallback((event: MapLayerMouseEvent) => {
    const features = event.features ?? []

    setCruceInfoClic(null)

    // Station symbols open their own popup: a cluster underneath must not open a second one.
    const mapaGl = mapRef.current?.getMap()
    const estacionesConPopupPropio = mapaGl?.getLayer?.(CAPA_ESTACIONES_RIO_ID) ? [CAPA_ESTACIONES_RIO_ID] : []
    if (estacionesConPopupPropio.length > 0 && (mapaGl?.queryRenderedFeatures?.(event.point, { layers: estacionesConPopupPropio }).length ?? 0) > 0) return

    const puntoRiesgoHoy = features.find((item) => item.layer?.id === CAPA_RIESGO_HOY_ID)
    const cueRiesgoHoy = puntoRiesgoHoy?.properties?.cueAnexo
    if (typeof cueRiesgoHoy === 'string') {
      const escuela = dataEscuelasMapaVisible?.escuelas.find((item) => item.cueAnexo === cueRiesgoHoy)
      if (escuela) {
        handleSeleccionarEscuelaBuscada(escuela)
        return
      }
    }

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
      const indice = Number(cruceClic.properties?.indice)
      const texto = (valor: unknown) => (typeof valor === 'string' && valor !== '' && valor !== 'null' ? valor : null)
      // The rain layer only exists while it is visible; its hit polygons carry the cell total.
      const celdaLluvia = mapaGl?.getLayer?.(ID_CAPA_LLUVIA_HIT)
        ? mapaGl.queryRenderedFeatures?.(event.point, { layers: [ID_CAPA_LLUVIA_HIT] })?.[0]
        : undefined
      const mm = Number(celdaLluvia?.properties?.acumuladoMm)
      setCruceInfoClic({
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
        clasificacion:
          typeof clase === 'string' && clase in ETIQUETAS_CRUCE
            ? (clase as ClasificacionCruce)
            : 'sin_evidencia',
        indice: Number.isInteger(indice) && indice >= 0 ? indice : null,
        nombreCurso: texto(cruceClic.properties?.nombreCurso),
        nombrePuente: texto(cruceClic.properties?.nombrePuente),
        lluvia: celdaLluvia && Number.isFinite(mm) ? { mm, horas: horasLluvia } : null,
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
      // T4: a cluster click zooms straight in; no intermediate popup.
      void acercarAlCluster(feature)
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
      const limites = siguiente === null
        ? null
        : bboxGeometria(departamentosRaw?.features.find((item) => item.properties.nombre === siguiente)?.geometry ?? null)
      if (limites) {
        mapRef.current?.getMap()?.fitBounds(limites, { padding: paddingEncuadre(), duration: 600 })
      } else {
        encuadrarProvincia({ padding: paddingProvincia() })
      }
    }
  }, [
    radarActivo,
    esPlanificacion,
    dataEscuelasMapaVisible,
    handleSeleccionarEscuelaBuscada,
    departamentoSeleccionado,
    encuadrarProvincia,
    departamentosRaw,
    setCruceInfoClic,
    horasLluvia,
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
  function registrarIconosCluster(reemplazar = false) {
    const mapa = mapRef.current?.getMap()
    if (!mapa || typeof mapa.hasImage !== 'function' || typeof mapa.addImage !== 'function') {
      return
    }
    const iconos = [...iconosClusterMapa(oscuroRef.current), ...iconosAccesosMapa(oscuroRef.current)]
    if (!reemplazar && iconos.every(({ id }) => mapa.hasImage(id))) {
      setIconosClusterListos(true)
      return
    }
    void registrarImagenesSvg(mapa, iconos, reemplazar).then(() => setIconosClusterListos(true))
  }

  const handleMapLoad = useCallback(() => {
    registrarIconosCluster()
    actualizarCuesNoAgrupados()
    const map = mapRef.current?.getMap()
    if (map) aquietarBasemap(map)
    if (map && process.env.NEXT_PUBLIC_E2E === 'true') instalarGanchoE2E(map)
    if (map) {
      soltarPopupsVisibles.current?.()
      soltarPopupsVisibles.current = mantenerPopupsVisibles(map)
      ultimoEstiloCargado.current = mapStyleRef.current
      const handleStyleLoad = () => {
        if (!map.isStyleLoaded()) return
        const estiloCargado = mapStyleRef.current
        if (cambioEstiloCargado(ultimoEstiloCargado.current, estiloCargado, true)) {
          setVersionEstilo((version) => version + 1)
          setIconosClusterListos(false)
        }
        ultimoEstiloCargado.current = estiloCargado
        aquietarBasemap(map)
        registrarIconosCluster()
        window.dispatchEvent(new CustomEvent('radar-meteo-map-ready', { detail: map }))
      }
      map.on('style.load', handleStyleLoad)
      window.dispatchEvent(new CustomEvent('radar-meteo-map-ready', { detail: map }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCuesNoAgrupados, setIconosClusterListos])

  // Cambio de tema: con radar activo el estilo no se recarga, así que las
  // imágenes ya registradas se reemplazan por las del tema nuevo.
  useEffect(() => {
    const oscuro = mode === 'dark'
    if (oscuroRef.current === oscuro) return
    oscuroRef.current = oscuro
    registrarIconosCluster(true)
  }, [mode])

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
              const escuela = escuelasPorCue.get(cueAnexo) ?? dataEscuelasMapa?.escuelas.find((item) => item.cueAnexo === cueAnexo)
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
      {((loading && !data) || !limitesCorrientes) && (
        <div className={`${styles.panel} ${styles.titlePanel}`}>
          {errorGeografia ? <>{t.mapaErrorLimites} <Button onClick={() => { setErrorGeografia(false); setIntentoGeografia((n) => n + 1) }}>{t.mapaReintentar}</Button></> : t.mapaCargando}
        </div>
      )}
      <div className={styles.mapRoot}>
        {/* El mapa se monta cuando hay límites o cuando la carga de departamentos falló de forma definitiva: sin datasets publicados el basemap igual aparece, con la vista de la región. Mientras carga, no se monta (el encuadre sale del bbox). */}
        {(limitesCorrientes || errorGeografia) && <MapGL
          ref={mapRef}
          attributionControl={false}
          mapStyle={mapStyle}
          // Los estilos claro y oscuro son distintos: el diff descarta las fuentes propias sin emitir `style.load`.
          styleDiffing={false}
          locale={localeMaplibre(idiomaMapa)}
          // Encuadre inicial ajustado a la provincia. MAP_CENTER/MAP_ZOOM son
          // los del mapa de matrícula y dejaban a Corrientes descentrada y
          // demasiado cerca; acá el encuadre sale del bbox real del GeoJSON, y
          // sin GeoJSON, de la vista inicial de la región.
          initialViewState={limitesCorrientes ? {
            bounds: limitesCorrientes,
            fitBoundsOptions: { padding: paddingProvincia() },
          } : {
            longitude: vistaInicialRegion.center[0],
            latitude: vistaInicialRegion.center[1],
            zoom: vistaInicialRegion.zoom,
          }}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={capasInteractivas}
          onClick={handleClick}
          cursor="pointer"
          // No compass control: rotation stays off so north is always up.
          dragRotate={false}
          pitchWithRotate={false}
          touchPitch={false}
          onLoad={handleMapLoad}
          // MapLibre descarta fuentes, capas e imágenes al cambiar el estilo.
          // El style.load (registrado en onLoad) determina el final real de
          // setStyle; styledata también puede pertenecer al estilo anterior.
          onStyleData={() => {
            const map = mapRef.current?.getMap()
            registrarIconosCluster()
            if (map?.isStyleLoaded()) aquietarBasemap(map)
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
          <ControlesZoom
            mapRef={mapRef}
            onVerProvincia={() => encuadrarProvincia({ padding: paddingProvincia(), duration: 600 })}
          />
          {/* La atribución compacta deja libre la esquina inferior derecha del mapa. */}
          <AttributionControl key={radarActivo ? 'radar-attribution' : 'map-attribution'} position={radarActivo ? 'top-right' : 'bottom-right'} compact />

          <Source id="infra-mascara-src" type="geojson" data={MASCARA_INFRA_URL}>
            <Layer id={CAPA_MASCARA_ID} type="fill" paint={radarActivo ? { 'fill-color': '#020811', 'fill-opacity': 0.62 } : fillPaintMascara()} />
          </Source>

          {/*
            F2.4: `data` pasa a ser el GeoJSON ya cruzado con `escuelasCaidas`
            (departamentosGeojson) apenas termina de resolverse el fetch +
            useMemo. Sin departamentos publicados la fuente queda vacía
            (DEPARTAMENTOS_SIN_DATOS): el mapa monta igual y no dibuja límites.
          */}
          <Source
            id="infra-departamentos-src"
            type="geojson"
            data={departamentosGeojson ?? DEPARTAMENTOS_SIN_DATOS}
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
              edificio={edificioGeojson}
              visibles={CAPAS_ACCESOS_OCULTAS}
              iconosListos={iconosClusterListos}
              oscuro={mode === 'dark'}
              mostrarRuta={capasVisibles.rutaAcceso}
              mostrarCruces={capasVisibles.crucesAgua}
            />
          )}

          <CapaCentroEvacuados camino={caminoCentro} oscuro={mode === 'dark'} />

          {(
            <Source
              id="infra-partes-src"
              type="geojson"
              data={featureCollectionPadron}
              cluster={true}
              clusterMaxZoom={CAPA_PARTES_CLUSTER_MAX_ZOOM}
              clusterRadius={RADIO_AGRUPAMIENTO_CLUSTER}
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

                Q17: la escuela individual se rasteriza a 26 px y el badge de
                cluster a 18 px, ambos con `icon-size: 1` y `pixelRatio: 2`
                (nítidos en HiDPI). El borde sigue el tema.
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
                    'icon-size': 1,
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
                    'icon-size': 1,
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
                  sólo tienen escuelas sin reporte son neutros y más chicos.
                  El halo va debajo y los despega del basemap. */}
              <Layer
                id={CAPA_PARTES_CLUSTER_HALO_ID}
                type="circle"
                layout={{ visibility: ocultarPartes ? 'none' : 'visible' }}
                filter={['has', 'point_count']}
                paint={{
                  ...circlePaintHaloCluster(mode === 'dark'),
                  ...(puntosVisibles ? {} : { 'circle-opacity': 0 }),
                  'circle-opacity-transition': { duration: 180, delay: 0 },
                }}
              />
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
                  'text-size': ['case', ['==', ['get', 'escuelasAfectadas'], 0], 10.5, 13],
                  'text-font': ['case', ['==', ['get', 'escuelasAfectadas'], 0], ['literal', ['Noto Sans Regular']], ['literal', ['Noto Sans Bold']]],
                  'text-allow-overlap': true,
                  'text-ignore-placement': true,
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
          {!ocultarPartes && iconosClusterListos && (
            <Source id={FUENTE_BADGE_ESTADO_ID} type="geojson" data={fuenteBadgesEstado}>
              <Layer
                id={CAPA_BADGE_ESTADO_ID}
                type="symbol"
                layout={{
                  'icon-image': ['get', 'imagen'],
                  'icon-size': 1,
                  'icon-anchor': 'center',
                  'icon-offset': OFFSET_BADGE_ESQUINA,
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': true,
                }}
              />
            </Source>
          )}
          {/* El canvas no es accesible: el mismo resumen queda como texto para lectores de pantalla. */}
          {!ocultarPartes && badgesEstado.length > 0 && (
            <ul className="sr-only" data-capa={CAPA_BADGE_ESTADO_ID}>
              {badgesEstado.map((badge) => (
                <li key={badge.cueAnexo}>{`${badge.icono === 'reloj' ? t.sitSinActualizar : t.sitClases[badge.icono]}: ${badge.nombre}`}</li>
              ))}
            </ul>
          )}

          {badgesBorradores.map((badge) => (
            <Marker
              key={`infra-borradores-${badge.cue}`}
              longitude={badge.lon}
              latitude={badge.lat}
              anchor="center"
              offset={[11, 11]}
            >
              <span
                role="img"
                aria-label={`${t.mapaBorradores(badge.count)}: ${badge.nombre}`}
                title={t.mapaBorradores(badge.count)}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: TAMANO_BADGE_ESTADO, height: TAMANO_BADGE_ESTADO, padding: '0 4px', border: `1px solid ${anilloColor(mode === 'dark')}`, borderRadius: 999, background: 'var(--card)', color: 'var(--ink-soft)', boxShadow: `0 1px 3px ${coloresMapa(mode === 'dark').sombra}`, fontSize: 'var(--t-micro)', fontWeight: 700, lineHeight: 1 }}
              >
                {badge.count}
              </span>
            </Marker>
          ))}

          {(radarActivo || esPlanificacion) && (
            <CapaPuntosNivel
              radar={radarActivo}
              idCapa={CAPA_PUNTOS_NIVEL_ID}
              idFuente={FUENTE_PUNTOS_NIVEL_ID}
              puntos={puntosNivel}
              oscuro={mode === 'dark'}
            />
          )}

          {riesgoHoyFueraDeRadar && (
            <CapaPuntosNivel
              radar
              idCapa={CAPA_RIESGO_HOY_ID}
              idFuente={FUENTE_RIESGO_HOY_ID}
              puntos={puntosRiesgoHoy}
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
            onSeleccionarEscuela={seleccionarPorCue}
          />

          {/* Popup del CRUCE DE AGUA clickeado sobre la ruta (ver `handleClick`).
              Tarjeta con el estilo de la estación de río: clase del cruce,
              contexto de la ruta de la escuela seleccionada y, si la capa
              está prendida, la lluvia IMERG en ese punto. Nunca dice si hoy
              se puede pasar. */}
          {cruceInfoClic && (
            <Popup
              longitude={cruceInfoClic.lng}
              latitude={cruceInfoClic.lat}
              anchor="bottom"
              maxWidth="340px"
              closeButton={false}
              closeOnClick={false}
              offset={OFFSET_POPUP_DEPARTAMENTO}
            >
              <TarjetaCruceAgua
                clasificacion={cruceInfoClic.clasificacion}
                nombreCurso={cruceInfoClic.nombreCurso}
                nombrePuente={cruceInfoClic.nombrePuente}
                indice={cruceInfoClic.indice}
                escuela={escuelaSeleccionada}
                geometria={geometria}
                lluvia={capasVisibles.lluviaObservada ? cruceInfoClic.lluvia : null}
              />
            </Popup>
          )}

          {/* V2 (hallazgo 5): realce de foco de la escuela seleccionada, sea
              por el buscador o por la ficha abierta. Un pin DOM (MapPin) en el
              color de foco del hub (`--marker`) con borde de tinta del tema y
              sombra, anclado por su punta inferior
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
                size={28}
                strokeWidth={2}
                color={anilloColor(mode === 'dark')}
                fill={COLOR_FOCO_SELECCION}
                style={{ filter: `drop-shadow(0 2px 3px ${coloresMapa(mode === 'dark').sombra})` }}
                aria-hidden="true"
              />
            </Marker>
          ))}

          </Fragment>
          {/* Stacking (bottom → top): rain raster below the department areas; events
              below the school layers; river stations on top of everything (school
              clusters must not cover them). DOM popups sit above all GL layers. */}
          <CapaLluviaObservada visible={capasVisibles.lluviaObservada} horas={horasLluvia} onMeta={setMetaLluvia} beforeId={CAPA_DEPARTAMENTOS_RELLENO_ID} sinPopup={modoRadar} />
          <CapaEstacionesRio visible={capasVisibles.estacionesRio} capasEncima={CAPAS_SOBRE_ESTACIONES} />
        </MapGL>}
      </div>

      {/* En radar no va la leyenda de situación actual: el radar trae la suya (lluvia, viento...). */}
      {radarActivo ? null : props.pestana === 'planificacion' ? (
        <LeyendaMapa pestana="planificacion" vista={vistaPlanificacion} horizonte={horizonteEfectivo} estacionesRio={capasVisibles.estacionesRio} riesgoHoy={riesgoHoyFueraDeRadar} lluviaObservada={capasVisibles.lluviaObservada ? metaLluvia : null} />
      ) : props.pestana === 'actual' ? (
        <LeyendaMapa pestana="actual" estacionesRio={capasVisibles.estacionesRio} riesgoHoy={riesgoHoyFueraDeRadar} lluviaObservada={capasVisibles.lluviaObservada ? metaLluvia : null} />
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
              </>
            )}
            subtitulos={{
              actual: actualizadoEn && ahoraMs !== null ? horaActualizacion(actualizadoEn, ahoraMs, t) : undefined,
              radar: t.mapaPronostico,
            }}
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
                onSeleccionar={seleccionarPorCue}
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
                onSeleccionar={seleccionarPorCue}
                riesgo={{
                  horizonte: horizonteEfectivo,
                  disponibles: horizontesDisponibles,
                  onHorizonte: setHorizonteSeleccionado,
                  puntos: radarData?.puntos ?? null,
                  cargando: radarLoading && radarData === null,
                  error: radarError,
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
                riesgoHoyDisponible={props.riskRadarEnabled ?? false}
              />
            )}
          />
        </div>
      )}
      {dataVisible && !fichaAbierta && !radarActivo && departamentoSeleccionado && (
        <aside className="map-ficha-flotante" aria-label={t.mapaAriaVistaPrevia} data-testid="preview-departamento">
          <ResumenDepartamento
            nombre={departamentoSeleccionado}
            totales={totalesPorDepartamento.get(normalizarNombreDepartamento(departamentoSeleccionado)) ?? null}
            onQuitar={() => {
              entradaPuntosPendiente.current = true
              setPuntosVisibles(false)
              setDepartamentoSeleccionado(null)
              encuadrarProvincia({ padding: paddingProvincia() })
            }}
          />
        </aside>
      )}
      {dataVisible && fichaAbierta && escuelaSeleccionada && (
        <aside className="map-ficha-flotante" aria-label={t.mapaAriaFicha} data-testid="ficha-flotante">
              <FichaEscuelaPanel
                key={seleccionCue}
                escuela={escuelaSeleccionada}
                borradoresServerCount={borradoresMapa.error ? null : (borradoresMapa.counts.get(escuelaSeleccionada.cueAnexo) ?? (borradoresMapa.loading ? null : 0))}
                horizonteRiesgo={horizonteEfectivo}
                planificacion={VISTAS_ESTRUCTURALES.map((vista) => ({
                  etiquetaVista: tituloLeyendaVista(dictMapa, vista),
                  etiquetaNivel: vista === 'historial'
                    ? `${etiquetaNivelPlan(dictMapa, nivelPlanificacion(escuelaSeleccionada, vista, { territorio }))} (${escuelaSeleccionada.situacionesHistoricas})`
                    : etiquetaNivelPlan(dictMapa, nivelPlanificacion(escuelaSeleccionada, vista, { territorio })),
                }))}
                centroEvacuados={(
                  <BloqueCentroEvacuados
                    visible={centroCaminoVisible}
                    onAlternar={() => setCentroCaminoCue(centroCaminoVisible ? null : escuelaSeleccionada.cueAnexo)}
                    respuesta={centroEvacuados?.cueAnexo === escuelaSeleccionada.cueAnexo ? centroEvacuados : null}
                    cargando={centroEvacuadosLoading}
                    error={Boolean(centroEvacuadosError)}
                  />
                )}
                acceso={(
                  <>
                  <BloqueAcceso
                    geometria={geometria}
                    exposicion={exposicion}
                    claseEscuela={claseInundacion(territorio?.susceptibilidad?.escuelas[escuelaSeleccionada.cueAnexo]?.claseRio)}
                    juntoLaguna={territorio?.susceptibilidad?.escuelas[escuelaSeleccionada.cueAnexo]?.juntoLaguna === true}
                    cargando={geometriaLoading || exposicionLoading}
                    error={Boolean(geometriaError)}
                  />
                  </>
                )}
                mostrarEnlaceNominal={props.mostrarEnlaceNominal}
                onVerAlumnosAlcanzados={setNominalAfectacionId}
                onVerHistorialCompleto={() => setHistorialCue(seleccionCue)}
                onCerrar={cerrarFicha}
                urlFichaCompleta={urlFichaCompleta}
                onAbrirFichaCompleta={guardarSnapshotAlAbrirFicha}
                onQuitarSeleccion={quitarSeleccion}
                extraVistaPrevia={radarActivo ? <PronosticoEscuelaBloque cueAnexo={escuelaSeleccionada.cueAnexo} /> : null}
                aislamiento={territorio?.aislamiento?.escuelas[escuelaSeleccionada.cueAnexo]?.nivel ?? null}
                distanciaLocalidad={geometria?.disponible && typeof geometria.distanciaKm === 'number'
                  ? { nombre: geometria.destino?.nombre ?? null, km: geometria.distanciaKm, superficie: superficieVia(geometria.viaPrincipal), desglose: desgloseSuperficies(geometria.superficies) }
                  : null}
              />
        </aside>
      )}

      {/* Veredicto diario: punto de entrada mínimo (ver odd/tasks/veredicto-diario-ia.md, Integración) */}
      {!radarActivo && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="map-veredicto-btn"
          aria-haspopup="dialog"
          onClick={() => setVeredictoAbierto(true)}
        >
          {t.mapaVeredicto}
        </Button>
      )}
      {/* Veredicto diario: punto de entrada mínimo (ver odd/tasks/veredicto-diario-ia.md, Integración) */}
      <VeredictoModal
        open={veredictoAbierto}
        onOpenChange={setVeredictoAbierto}
        onSeleccionarDepartamento={centrarDepartamentoVeredicto}
      />

      {!radarActivo && <FullscreenButton targetRef={props.contenedorPantallaCompleta ?? shellRef} />}

    </div>
  )
}

function almacenLocal(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
