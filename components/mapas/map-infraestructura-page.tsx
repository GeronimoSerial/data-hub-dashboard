'use client'

import { useMemo, useRef, useState } from 'react'
import MapGL, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
} from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import { BasemapControl } from '@/components/mapas/basemap-control'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Indicadores } from '@/components/infraestructura/indicadores'
import { ListaAlertas } from '@/components/infraestructura/lista-alertas'
import { FichaAlerta } from '@/components/infraestructura/ficha-alerta'
import {
  InfraLayerControl,
  type CapaInfraestructura,
} from '@/components/mapas/layer-control'
import { InfraLegendPanel } from '@/components/mapas/legend-panel'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import {
  COLORES_DEPARTAMENTO,
  DEPARTAMENTOS_URL,
  LIMITES_CORRIENTES,
  MASCARA_COLOR,
  MASCARA_OPACIDAD,
  MASCARA_URL,
} from '@/lib/mapas/departamentos'
import { ensureMapWorker } from '@/lib/map-worker'
import { useAlertas } from '@/lib/infraestructura/use-alertas'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { esCategoria, type CategoriaProblematica } from '@/lib/infraestructura/categorias'
import type { EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'

ensureMapWorker()

// Fase 2 (parte-mapa): una escuela = un punto, no una capa por categoría. La
// capa vieja distinguía establecimiento/alumnos con símbolo (relleno/anillo);
// ahora esos dos canales están ocupados por severidad (color) y servicio
// (anillo, ver circlePaintPartes), y la categoría pasó a filtro + ficha.
const CAPA_PARTES_ID = 'infra-partes'

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

function fillPaintDepartamentos(): FillLayerSpecification['paint'] {
  return {
    'fill-color': COLORES_DEPARTAMENTO.rellenoNormal,
    'fill-opacity': COLORES_DEPARTAMENTO.opacidadRellenoNormal,
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

// ── Radio: alumnos alcanzados, no cantidad de afectaciones ──────────────────
//
// Antes: 'circle-radius': ['get', 'radius'] con radius = 7 + min(len-1,5)*2,
// escalado por CANTIDAD de problemáticas del cue_anexo. Eso era una mentira
// visual: una escuela con una sola afectación gravísima y 900 alumnos se
// veía IGUAL que una con una afectación menor y 5 alumnos.
//
// Ahora escala por `alumnosAlcanzados`, en área, no en radio: el ojo compara
// el ÁREA de un círculo, no su radio (es la razón por la que los mapas de
// símbolos proporcionales —ver Flannery— interpolan sobre la raíz cuadrada
// del valor en vez del valor directo: área = π·r², así que r ∝ √valor
// mantiene el área proporcional al dato, mientras que r ∝ valor la
// exagera cuadráticamente).
//
// Piso y techo: RADIO_PISO=6 asegura que una escuela con alumnosAlcanzados
// === 0 (categoría "establecimiento" sin selección nominal) siga siendo un
// punto visible y clickeable, no un pixel. ALUMNOS_TECHO=800 y RADIO_TECHO=26
// son una escuela grande de la provincia (por encima de la matrícula típica
// de un establecimiento) — evita que una escuela excepcionalmente numerosa
// dibuje un círculo que tape a sus vecinas; por encima del techo el radio se
// achata (MapLibre extrapola el último tramo del interpolate).
const RADIO_PISO = 6
const RADIO_TECHO = 26
const ALUMNOS_TECHO = 800

// Anillo: color NEUTRO (el color ya está tomado por severidad, no se puede
// reusar acá sin generar una segunda escala). "suspendido" y "parcial" se
// distinguen por grosor + opacidad de trazo, no por color: MapLibre no
// soporta circle-stroke-dasharray, así que un trazo punteado real no es una
// opción. A zoom provincial un anillo grueso y sólido se distingue de uno
// fino y traslúcido incluso con varios puntos superpuestos; "normal" queda
// con el mismo trazo mínimo que ya traía el punto (línea de separación con
// el fondo), que a esa distancia se lee como "sin anillo".
const ANILLO_COLOR = '#1c1c1c'

function circlePaintPartes(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['sqrt', ['get', 'alumnosAlcanzados']],
      0,
      RADIO_PISO,
      Math.sqrt(ALUMNOS_TECHO),
      RADIO_TECHO,
    ],
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
}

// Función de módulo (no closure del componente) a propósito: así useMemo
// puede depender sólo de `partes` sin arrastrar warnings de exhaustive-deps
// por una función recreada en cada render.
function construirFeatureCollection(
  partes: ParteMapa[],
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
      },
    }))
  return { type: 'FeatureCollection', features }
}

const CAPAS_VISIBLES_DEFECTO: Record<CapaInfraestructura, boolean> = {
  escuelas: true,
}

export default function MapInfraestructuraPage(props: { mostrarEnlaceNominal: boolean }) {
  const styles = useOverlayStyles()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [filtrosForm, setFiltrosForm] = useState<FiltrosForm>(FILTROS_VACIOS)
  const [seleccionCue, setSeleccionCue] = useState<string | null>(null)
  const [capasVisibles, setCapasVisibles] = useState(CAPAS_VISIBLES_DEFECTO)
  const [departamentoHover, setDepartamentoHover] = useState<{
    nombre: string
    lng: number
    lat: number
  } | null>(null)

  const filtros = useMemo(
    () => ({
      territorio: filtrosForm.territorio || undefined,
      nivel: filtrosForm.nivel || undefined,
      cueAnexo: filtrosForm.establecimiento || undefined,
      motivo: filtrosForm.motivo || undefined,
      severidad: filtrosForm.severidad || undefined,
      categoria:
        filtrosForm.categoria && esCategoria(filtrosForm.categoria)
          ? (filtrosForm.categoria as CategoriaProblematica)
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

  const featureCollection = useMemo(
    () => construirFeatureCollection(data?.partes ?? []),
    [data],
  )

  const mapStyle = BASEMAPS[basemap].styleUrl
  const parteSeleccionado = seleccionCue ? (partesPorCue.get(seleccionCue) ?? null) : null
  const seleccionCoords =
    parteSeleccionado && parteSeleccionado.lat !== null && parteSeleccionado.lon !== null
      ? ([parteSeleccionado.lon, parteSeleccionado.lat] as [number, number])
      : null

  const capasInteractivas = capasVisibles.escuelas ? [CAPA_PARTES_ID] : []

  function handleClick(event: MapLayerMouseEvent) {
    const feature = (event.features ?? [])[0]
    if (!feature || !feature.properties) {
      setSeleccionCue(null)
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
        >
          <NavigationControl position="top-left" />

          <Source id="infra-mascara-src" type="geojson" data={MASCARA_URL}>
            <Layer id={CAPA_MASCARA_ID} type="fill" paint={fillPaintMascara()} />
          </Source>

          <Source id="infra-departamentos-src" type="geojson" data={DEPARTAMENTOS_URL}>
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
          </Source>

          {capasVisibles.escuelas && (
            <Source id="infra-partes-src" type="geojson" data={featureCollection}>
              <Layer id={CAPA_PARTES_ID} type="circle" paint={circlePaintPartes()} />
            </Source>
          )}

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

          {seleccionCoords && (
            <Popup
              longitude={seleccionCoords[0]}
              latitude={seleccionCoords[1]}
              anchor="bottom"
              onClose={() => setSeleccionCue(null)}
              closeOnClick={false}
              maxWidth="390px"
            >
              <FichaAlerta
                parte={parteSeleccionado}
                mostrarEnlaceNominal={props.mostrarEnlaceNominal}
              />
            </Popup>
          )}
        </MapGL>
      </div>

      {data && <Indicadores indicadores={data.indicadores} loading={loading} />}

      {data && (
        <ListaAlertas
          partes={data.partes}
          filtros={filtrosForm}
          onFiltroChange={setFiltro}
          seleccionadaCue={seleccionCue}
          onSeleccionar={setSeleccionCue}
        />
      )}

      {/*
        La leyenda va fuera del stack de controles, como hermana: usa las
        clases map-panel/map-legend-panel, que son `position: absolute` con
        offsets propios (abajo a la izquierda). Adentro del stack — que también
        es absolute — se posicionaba respecto de él y se montaba encima de los
        otros dos controles. Mismo armado que el mapa de matrícula.
      */}
      {data && <InfraLegendPanel indicadores={data.indicadores} />}

      <div className={styles.controlsStack}>
        <BasemapControl value={basemap} onChange={setBasemap} />
        <InfraLayerControl capas={capasVisibles} onChange={alternarCapa} />
      </div>

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
