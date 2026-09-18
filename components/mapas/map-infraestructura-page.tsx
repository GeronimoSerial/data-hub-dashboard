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
import type { AlertaActiva } from '@/lib/infraestructura/consulta'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'

ensureMapWorker()

// Capa "establecimiento": círculo relleno, igual que el punto único de antes
// de la categorización. Capa "alumnos": anillo hueco (circle-opacity: 0,
// stroke visible), dibujada después en el árbol de capas para quedar encima:
// una escuela con problemáticas de ambas categorías se ve como ◉.
const CAPA_ESTABLECIMIENTO_ID = 'infra-alertas-establecimiento'
const CAPA_ALUMNOS_ID = 'infra-alertas-alumnos'

// Límites departamentales. Se declaran antes que las capas de alertas en el
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
}

const FILTROS_VACIOS: FiltrosForm = {
  territorio: '',
  nivel: '',
  establecimiento: '',
  motivo: '',
  severidad: '',
}

function circlePaintEstablecimiento(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': ['get', 'radius'],
    'circle-color': ['get', 'color'],
    'circle-stroke-color': '#1c1c1c',
    'circle-stroke-width': 1,
    'circle-opacity': 0.9,
  }
}

// Anillo hueco: mismo radio y color de severidad que la capa de
// establecimiento, pero sin relleno y con un trazo grueso para distinguirse
// como símbolo (categoría), no como intensidad (eso lo sigue codificando el
// color).
function circlePaintAlumnos(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': ['get', 'radius'],
    'circle-opacity': 0,
    'circle-stroke-width': 3,
    'circle-stroke-color': ['get', 'color'],
  }
}

// Orden de severidad de menor a mayor, para elegir el color del punto
// cuando varias alertas activas comparten el mismo cue_anexo.
const ORDEN_SEVERIDAD = SEVERIDADES

function peorAlerta(alertas: AlertaActiva[]): AlertaActiva {
  return alertas.reduce((peor, actual) => {
    const iActual = ORDEN_SEVERIDAD.indexOf(
      actual.severidad as (typeof ORDEN_SEVERIDAD)[number],
    )
    const iPeor = ORDEN_SEVERIDAD.indexOf(
      peor.severidad as (typeof ORDEN_SEVERIDAD)[number],
    )
    return iActual > iPeor ? actual : peor
  }, alertas[0])
}

// Función de módulo (no closure del componente) a propósito: así useMemo
// puede depender sólo de `grupos` sin arrastrar warnings de exhaustive-deps
// por una función recreada en cada render.
function construirFeatureCollection(
  grupos: Map<string, AlertaActiva[]>,
  categoria: CapaInfraestructura,
): FeatureCollection<Point, { cueAnexo: string; count: number; color: string; radius: number }> {
  const features = Array.from(grupos.values())
    .filter((alertas) => alertas[0].categoria === categoria)
    .map((alertas) => {
      const primera = alertas[0]
      const peor = peorAlerta(alertas)
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [primera.lon as number, primera.lat as number],
        },
        properties: {
          cueAnexo: primera.cueAnexo,
          count: alertas.length,
          color: colorSeveridad(peor.severidad),
          radius: 7 + Math.min(alertas.length - 1, 5) * 2,
        },
      }
    })
  return { type: 'FeatureCollection', features }
}

const CAPAS_VISIBLES_DEFECTO: Record<CapaInfraestructura, boolean> = {
  establecimiento: true,
  alumnos: true,
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
    }),
    [filtrosForm],
  )

  const { data, loading, error } = useAlertas(filtros)

  // Agrupación por cue_anexo, sin distinguir categoría: usada para la ficha
  // (popup), que sigue mostrando todas las alertas activas de la escuela sin
  // importar de qué capa vino el click.
  const gruposPorCue = useMemo(() => {
    const map = new Map<string, AlertaActiva[]>()
    for (const alerta of data?.alertas ?? []) {
      if (alerta.lat == null || alerta.lon == null) continue
      const existentes = map.get(alerta.cueAnexo)
      if (existentes) existentes.push(alerta)
      else map.set(alerta.cueAnexo, [alerta])
    }
    return map
  }, [data])

  // Agrupación por clave compuesta cue_anexo|categoria: una escuela con
  // problemáticas de ambas categorías produce dos features en las mismas
  // coordenadas, una por capa. `peorAlerta` se aplica dentro de cada grupo
  // (por categoría), no sobre todas las alertas del CUE.
  const gruposPorClave = useMemo(() => {
    const map = new Map<string, AlertaActiva[]>()
    for (const alerta of data?.alertas ?? []) {
      if (alerta.lat == null || alerta.lon == null) continue
      const clave = `${alerta.cueAnexo}|${alerta.categoria}`
      const existentes = map.get(clave)
      if (existentes) existentes.push(alerta)
      else map.set(clave, [alerta])
    }
    return map
  }, [data])

  const featureCollectionEstablecimiento = useMemo(
    () => construirFeatureCollection(gruposPorClave, 'establecimiento'),
    [gruposPorClave],
  )
  const featureCollectionAlumnos = useMemo(
    () => construirFeatureCollection(gruposPorClave, 'alumnos'),
    [gruposPorClave],
  )

  const mapStyle = BASEMAPS[basemap].styleUrl
  const seleccionAlertas = seleccionCue ? (gruposPorCue.get(seleccionCue) ?? []) : []
  const seleccionCoords =
    seleccionAlertas.length > 0
      ? ([seleccionAlertas[0].lon as number, seleccionAlertas[0].lat as number] as [
          number,
          number,
        ])
      : null

  const capasInteractivas = [
    ...(capasVisibles.establecimiento ? [CAPA_ESTABLECIMIENTO_ID] : []),
    ...(capasVisibles.alumnos ? [CAPA_ALUMNOS_ID] : []),
  ]

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

          {capasVisibles.establecimiento && (
            <Source
              id="infra-alertas-establecimiento-src"
              type="geojson"
              data={featureCollectionEstablecimiento}
            >
              <Layer
                id={CAPA_ESTABLECIMIENTO_ID}
                type="circle"
                paint={circlePaintEstablecimiento()}
              />
            </Source>
          )}

          {capasVisibles.alumnos && (
            <Source id="infra-alertas-alumnos-src" type="geojson" data={featureCollectionAlumnos}>
              <Layer id={CAPA_ALUMNOS_ID} type="circle" paint={circlePaintAlumnos()} />
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
                alertas={seleccionAlertas}
                mostrarEnlaceNominal={props.mostrarEnlaceNominal}
              />
            </Popup>
          )}
        </MapGL>
      </div>

      {data && <Indicadores indicadores={data.indicadores} loading={loading} />}

      {data && (
        <ListaAlertas
          alertas={data.alertas}
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
      <InfraLegendPanel />

      <div className={styles.controlsStack}>
        <BasemapControl value={basemap} onChange={setBasemap} />
        <InfraLayerControl capas={capasVisibles} onChange={alternarCapa} />
      </div>

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
