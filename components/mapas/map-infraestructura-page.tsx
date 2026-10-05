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
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
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
  BookMinus,
  BookX,
  Clock,
  DoorOpen,
  House,
  MapPin,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import { BasemapControl } from '@/components/mapas/basemap-control'
import { PanelLateral } from '@/components/mapas/panel-lateral'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { Button } from '@/components/ui/button'
import { useThemeMode } from '@/app/providers'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { PanelSituacionActual } from '@/components/mapas/panel-situacion-actual'
import { FichaEscuelaPanel } from '@/components/mapas/ficha-escuela-panel'
import { BloqueAcceso } from '@/components/mapas/bloque-acceso'
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
import { LeyendaMapa } from '@/components/mapas/leyenda-mapa'
import {
  CapasAccesosTerritoriales,
  CAPA_AISLAMIENTO_ID,
  CAPA_CRUCES_ACCESO_ID,
  CAPA_INUNDACION_ID,
  LeyendaAccesos,
  bboxRuta,
} from '@/components/mapas/capas-accesos'
import { SelectorHorizonte, type HorizonteRadar } from '@/components/mapas/selector-horizonte'
import { RadarMeteo } from '@/components/mapas/radar-meteo/radar-meteo'
import { RiskExplanationPanel } from '@/components/mapas/risk-explanation-panel'
import { useRadar } from '@/lib/infraestructura/use-radar'
import { useRiesgoSnapshot } from '@/lib/infraestructura/use-riesgo-snapshot'
import { useTendenciaEstacional } from '@/lib/infraestructura/use-tendencia-estacional'
import { useTerritorioMapa } from '@/lib/infraestructura/use-territorio-mapa'
import { useGeometriaAcceso } from '@/lib/infraestructura/use-geometria-acceso'
import { useExposicionRuta } from '@/lib/infraestructura/use-exposicion-ruta'
import { construirCeldasExposicion } from '@/lib/mapas/exposicion-ruta-capas'
import { ultimaActualizacion } from '@/lib/infraestructura/mapa/agregar'
import { generarBriefing } from '@/lib/infraestructura/riesgo/briefing'
import { ETIQUETA_TIPO_FACTOR, etiqueta } from '@/lib/infraestructura/riesgo/etiquetas'
import {
  colorPuntoRiesgo,
  construirCoropletaPeligro,
  construirPuntosRiesgo,
  construirPuntosRiesgoAcceso,
  paintCoropletaPeligro,
  paintPuntosRiesgoAcceso,
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
import { filtrarDepartamentoMapa, indicadoresDePartes } from '@/lib/infraestructura/filtrar-departamento-mapa'
import { useTotalesMapa } from '@/lib/infraestructura/use-totales-mapa'
import type { TotalesDepartamento } from '@/lib/infraestructura/totales-mapa'
import { filtrarDepartamentoEscuelasMapa } from '@/lib/infraestructura/filtrar-departamento-escuelas-mapa'
import { construirEscuelasMapaFeatureCollection, COLOR_SIN_AFECTACION } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'
import type { EscuelaMapaPadron, EscuelasMapaPadronResultado, ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { iconoPunto, radioPunto, type IconoPunto } from '@/lib/infraestructura/mapa/punto'
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

// ── Modo Radar (E4) ─────────────────────────────────────────────
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
// severidad ni con el badge de estado.

// id lógico del contenedor del ícono de riesgo: mismo patrón `data-capa` que
// el badge de estado, para tests y estilos sin depender del texto accesible.
const CAPA_RIESGO_ICONO_ID = 'infra-riesgo-icono'
const TAMANO_ICONO_RIESGO = 18

const CAPA_RIESGO_ACCESO_CIRCLE_ID = 'infra-riesgo-acceso-circle'

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

// El color del punto o cluster sale de la gravedad más alta (0 sin reporte,
// 1 Baja, 2 Media, 3 Alta, 4 Crítica).
//
// Antes de mirar la severidad se chequea `escuelasAfectadas === 0`: un cluster
// que agrupa SÓLO escuelas sin afectación reportada (severidadRango = 0, el
// mismo 0 que 'Baja') se pinta con el gris neutro COLOR_SIN_AFECTACION, nunca
// con una severidad real. Sólo si hay al menos una afectada se usa la
// severidad más alta (`severidadRango`, agregado por max).
export function colorPorSeveridadRango(): DataDrivenPropertyValueSpecification<string> {
  const expresion: unknown[] = ['case', ['==', ['get', 'escuelasAfectadas'], 0], COLOR_SIN_AFECTACION]
  for (let i = SEVERIDADES.length - 1; i >= 1; i--) {
    expresion.push(['>=', ['get', 'gravedad'], i + 1], colorSeveridad(SEVERIDADES[i]))
  }
  expresion.push(['==', ['get', 'gravedad'], 0], COLOR_SIN_AFECTACION, colorSeveridad(SEVERIDADES[0]))
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
    'circle-radius': ['case', ['==', ['get', 'gravedad'], 0], radioPunto(0), radioPunto(1)],
    'circle-color': colorPorSeveridadRango(),
    'circle-opacity': 0.9,
    'circle-stroke-color': ['case', ['==', ['get', 'gravedad'], 0], COLOR_SIN_AFECTACION, ANILLO_COLOR],
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
  sin: 'Sin clases',
  parcial: 'Clases parciales',
  evacuado: 'Evacuado',
  centro: 'Centro de evacuados',
  reloj: 'Sin actualizar',
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
}

// Las capas territoriales adicionales arrancan apagadas. La ruta de acceso
// aparece automáticamente al seleccionar una escuela.
const CAPAS_ACCESOS_VISIBLES_DEFECTO: Record<CapaAccesos, boolean> = {
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
  pestana: Exclude<PestanaMapa, 'estadisticas'>
  hazardContextEnabled?: boolean
  riskRadarEnabled?: boolean
  seasonalEnabled?: boolean
  visible?: boolean
  onRegistrarSeleccion?: (fn: ((escuela: EscuelaMapaPadron) => void) | null) => void
}) {
  const styles = useOverlayStyles()
  const { mode } = useThemeMode()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const vistaPreviaRadar = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number } | null>(null)
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
  // Mismo patrón para el panel de base/capas (T1.3 extendido): en mobile tapaba
  // casi la mitad del mapa. Arranca cerrado y comparte el mismo cajón fijo a
  // pantalla completa; nunca se abre junto con leftStack (ver los onClick).
  const [controlsStackAbierto, setControlsStackAbierto] = useState(false)
  // F3.2/F3.3/F3.4: estado de los tres modales, deliberadamente separado del
  // estado de encuadre/filtros/capas de arriba. Cerrar cualquiera de los tres
  // sólo tiene que tocar SU propio estado — nunca `capasVisibles` ni el
  // encuadre del mapa (MapGL no se remonta acá).
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
  const cerrarFicha = useCallback(() => {
    setFichaCerradaCue(seleccionCue)
    setDepartamentoInfoClic(null)
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

  // ── Modo Radar (E4) ───────────────────────────────────────────
  //
  // El Radar es una pestaña del contenedor. Sin su flag, conserva el
  // comportamiento de Situación actual aunque la prop recibida sea "radar".
  const modoRadar = props.pestana === 'radar' && (props.riskRadarEnabled ?? false)
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
  const radarActivo = modoRadar
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
    setCueRadarSeleccionado(null)
    setDepartamentoRadarSeleccionado(null)
    setDepartamentoInfoClic(null)
    setClusterInfoClic(null)
    setCruceInfoClic(null)
  }, [modoRadar, props.pestana, props.riskRadarEnabled])
  const { data: radarData, loading: radarLoading, error: radarError } = useRadar(
    filtrosRadar,
    false,
  )

  // Capa opcional SEASONAL (E5+, Off por defecto): sólo consulta cuando el
  // flag está prendido, estamos en modo Radar Y hay un departamento
  // seleccionado — nunca dispara sola con sólo el flag encendido.
  const seasonalActivo =
    (props.seasonalEnabled ?? false) && radarActivo && !modoRadar && departamentoRadarSeleccionado !== null
  const { data: tendenciaEstacionalData } = useTendenciaEstacional(
    departamentoRadarSeleccionado,
    seasonalActivo,
  )

  const { data, loading, error } = useAlertas()

  const [ahoraMs, setAhoraMs] = useState<number | null>(null)
  useEffect(() => {
    const id = setTimeout(() => setAhoraMs(Date.now()), 0)
    return () => clearTimeout(id)
  }, [data])

  const dataEscuelasMapa = props.escuelasMapa
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

  // V2: badge de estado por escuela NO agrupada. Un ícono lucide por punto,
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

  // ── Datos derivados del radar (E4) ───────────────────────────
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
  const mapStyle = radarActivo || mode === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : BASEMAPS[basemap].styleUrl
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
  // Gate único: el flag de contexto territorial fuera del modo Radar. Con el
  // flag apagado esta sección no fetchea, no monta control, leyenda ni capas
  // — el mapa se comporta exactamente como antes. `hazardOn` ya incluye
  // modoRadar, así queda disponible sólo en situación actual.
  const hazardOn = (props.hazardContextEnabled ?? false) && !modoRadar

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
  // "Situación actual" (y es la de la ficha.
  const cueRuta = modoRadar ? cueRadarSeleccionado : seleccionCue

  // La geometría se pide SÓLO para la escuela seleccionada, nunca para todas
  // las rutas. Se deshabilita cuando el contexto territorial no está activo.
  const {
    data: geometria,
    loading: geometriaLoading,
    error: geometriaError,
  } = useGeometriaAcceso(cueRuta, hazardOn && cueRuta !== null)
  const {
    data: exposicion,
    loading: exposicionLoading,
  } = useExposicionRuta(cueRuta, hazardOn && cueRuta !== null)

  const rutaGeojson = useMemo(() => construirRutaAcceso(geometria), [geometria])
  const crucesGeojson = useMemo(() => construirCrucesAcceso(geometria), [geometria])
  const celdasExposicion = useMemo(
    () => (exposicion?.cueAnexo === cueRuta ? construirCeldasExposicion(exposicion) : null),
    [exposicion, cueRuta],
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

    // Cualquier clic cierra el popup de departamento vigente; si el clic cae
    // sobre un departamento, se vuelve a abrir más abajo con sus números.
    setDepartamentoInfoClic(null)
    setClusterInfoClic(null)
    setCruceInfoClic(null)

    if (radarActivo) {
      if (event.lngLat) window.dispatchEvent(new CustomEvent('radar-meteo-map-click', { detail: { lat: event.lngLat.lat, lng: event.lngLat.lng } }))
      return
    }

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
  const handleSeleccionarEscuelaBuscada = useCallback((escuela: EscuelaMapaPadron) => {
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
    setControlsStackAbierto(false)
  }, [])

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
    if (map) window.dispatchEvent(new CustomEvent('radar-meteo-map-ready', { detail: map }))
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
      {(props.pestana !== 'actual' || radarActivo) && (
        <InfraLegendPanel
          departamentosSinMatch={departamentosSinMatch}
          mostrarLeyendaPeligro={false}
          mostrarLeyendaAcceso={!radarActivo && capasRadarVisibles['riesgo-acceso']}
          hayNivelProvisorio={radarActivo ? (radarData?.hayNivelProvisorio ?? false) : false}
        />
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
          onMouseMove={(event) => {
            if (radarActivo && event.lngLat) {
              window.dispatchEvent(new CustomEvent('radar-meteo-map-click', { detail: { lat: event.lngLat.lat, lng: event.lngLat.lng } }))
            }
          }}
          cursor="pointer"
          onLoad={handleMapLoad}
          // V2: cambiar de base recarga el estilo y MapLibre descarta las
          // imágenes registradas; `styledata` vuelve a registrarlas.
          onStyleData={() => {
            registrarIconosCluster()
            const map = mapRef.current?.getMap()
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
              paint={radarActivo ? { 'line-color': '#d6e9f4', 'line-width': 0.7, 'line-opacity': 0.55 } : linePaintDepartamentos()}
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
              paint={symbolPaintDepartamentos(radarActivo)}
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
                // T1.1c: en el cluster `sinActualizar` se agrega como 0/1 con
                // max() — el cluster vale 1 si AL MENOS UNO de sus puntos
                // está sin reportar (semántica OR), a diferencia de los
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
                layout={{ visibility: radarActivo ? 'none' : 'visible' }}
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
                layout={{ visibility: radarActivo ? 'none' : 'visible' }}
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
                layout={{
                  'text-field': ['case', ['==', ['get', 'escuelasAfectadas'], 0], '', ['get', 'escuelasAfectadas']],
                  'text-size': 12,
                  'text-font': ['Noto Sans Regular'],
                  'text-allow-overlap': false,
                  visibility: radarActivo ? 'none' : 'visible',
                }}
                filter={filtroClusterPartes(capasVisibles.escuelas)}
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
              {iconosClusterListos && (
                <Layer
                  id={CAPA_CLUSTER_CENTRO_EVACUADOS_ID}
                  type="symbol"
                  filter={['all', ['has', 'point_count'], ['==', ['get', 'esCentroEvacuados'], 1]]}
                  layout={layoutIconoCluster(ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS)}
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
          {!radarActivo && badgesEstado.map((badge) => {
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
          {false && radarActivo && capasRadarVisibles.riesgo && marcadoresRiesgo.map((marcador) => (
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

          <RadarMeteo activo={radarActivo} escuelas={dataEscuelasMapa?.escuelas ?? []} />

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

      {!radarActivo && props.pestana === 'actual' && <LeyendaMapa pestana="actual" />}

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
          className={`${styles.leftStack} ${radarActivo ? 'radar-meteo-left-stack' : ''}`}
          id="infra-left-stack"
        >
          {!modoRadar && avisoBusqueda && (
            <p role="status" className={styles.hint} data-testid="aviso-busqueda-sin-ubicacion">
              {avisoBusqueda}
            </p>
          )}
          {hazardOn && (
            <LeyendaAccesos
              visibles={capasAccesosVisibles}
              territorio={territorio}
              territorioLoading={territorioLoading}
              territorioError={territorioError}
              resumen={resumenCobertura}
            />
          )}
          <PanelLateral
            pestana={modoRadar ? 'radar' : props.pestana === 'planificacion' ? 'planificacion' : 'actual'}
            seleccion={modoRadar ? cueRadarSeleccionado : fichaAbierta ? seleccionCue : null}
            onCerrarFicha={modoRadar
              ? () => setCueRadarSeleccionado(null)
              : cerrarFicha}
            ficha={!modoRadar && fichaAbierta && escuelaSeleccionada ? (
              <FichaEscuelaPanel
                key={seleccionCue}
                escuela={escuelaSeleccionada}
                acceso={(
                  <BloqueAcceso
                    geometria={hazardOn ? geometria : null}
                    exposicion={hazardOn ? exposicion : null}
                    cargando={hazardOn && (geometriaLoading || exposicionLoading)}
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
              // La Task 16 reemplaza este contenido por el panel real; hasta entonces no ocupa espacio.
              <div className="map-panel-radar" data-testid="panel-radar" hidden />
            )}
            planificacion={panelActual}
          />
        </div>
      )}

      <div
        className={styles.controlsStack}
        id="infra-controls-stack"
        data-open={controlsStackAbierto ? 'true' : 'false'}
        style={radarActivo ? { display: 'none' } : undefined}
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
        {radarActivo && false && (
          <RadarLayerControl capas={capasRadarVisibles} onChange={alternarCapaRadar} />
        )}
      </div>

      <Button
        variant="secondary"
        size="sm"
        className={styles.controlsStackToggle}
        style={radarActivo ? { display: 'none' } : undefined}
        onClick={() => setControlsStackAbierto((abierto) => !abierto)}
        aria-expanded={controlsStackAbierto}
        aria-controls="infra-controls-stack"
      >
        {controlsStackAbierto ? 'Cerrar' : 'Capas'}
      </Button>

      {!radarActivo && <FullscreenButton targetRef={shellRef} />}

      {/*
        Con una escuela seleccionada y la ficha cerrada, la selección queda
        visible en el mapa (resaltado + ruta) pero sin ningún control: la
        única forma de volver atrás era abrir otra escuela y perder el trabajo
        de leer la ruta. Este grupo devuelve las dos acciones que importan.

        Deliberadamente NO usa un modal: es un par de botones, y sin ficha
        abierta no hay backdrop que esconda nada. Sólo en "Situación actual" —
        en Radar el grupo estorbaría a los paneles de riesgo, y la
        selección de ficha no compite ahí con su propio panel de explicación.
      */}
      {seleccionCue !== null &&
        !fichaAbierta &&
        !modoRadar &&
        (
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
