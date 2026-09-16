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
import type { CircleLayerSpecification } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import { BasemapControl } from '@/components/mapas/basemap-control'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Indicadores } from '@/components/infraestructura/indicadores'
import { ListaAlertas } from '@/components/infraestructura/lista-alertas'
import { FichaAlerta } from '@/components/infraestructura/ficha-alerta'
import { BASEMAPS, MAP_CENTER, MAP_ZOOM, type BasemapId } from '@/lib/map-types'
import { ensureMapWorker } from '@/lib/map-worker'
import { useAlertas } from '@/lib/infraestructura/use-alertas'
import type { AlertaActiva } from '@/lib/infraestructura/consulta'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'

ensureMapWorker()

const ALERTAS_LAYER_ID = 'infra-alertas'

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

function circlePaint(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': ['get', 'radius'],
    'circle-color': ['get', 'color'],
    'circle-stroke-color': '#1c1c1c',
    'circle-stroke-width': 1,
    'circle-opacity': 0.9,
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

export default function MapInfraestructuraPage(props: { mostrarEnlaceNominal: boolean }) {
  const styles = useOverlayStyles()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [filtrosForm, setFiltrosForm] = useState<FiltrosForm>(FILTROS_VACIOS)
  const [seleccionCue, setSeleccionCue] = useState<string | null>(null)

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

  // Agrupación por cue_anexo: varias alertas activas sobre el mismo
  // establecimiento se superponen en el mismo punto geográfico y se
  // muestran como un único punto en el mapa, sin sumar afectaciones.
  const grupos = useMemo(() => {
    const map = new Map<string, AlertaActiva[]>()
    for (const alerta of data?.alertas ?? []) {
      if (alerta.lat == null || alerta.lon == null) continue
      const existentes = map.get(alerta.cueAnexo)
      if (existentes) existentes.push(alerta)
      else map.set(alerta.cueAnexo, [alerta])
    }
    return map
  }, [data])

  const featureCollection = useMemo<
    FeatureCollection<
      Point,
      { cueAnexo: string; count: number; color: string; radius: number }
    >
  >(() => {
    const features = Array.from(grupos.entries()).map(
      ([cueAnexo, alertas]) => {
        const primera = alertas[0]
        const peor = peorAlerta(alertas)
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [primera.lon as number, primera.lat as number],
          },
          properties: {
            cueAnexo,
            count: alertas.length,
            color: colorSeveridad(peor.severidad),
            radius: 7 + Math.min(alertas.length - 1, 5) * 2,
          },
        }
      },
    )
    return { type: 'FeatureCollection', features }
  }, [grupos])

  const mapStyle = BASEMAPS[basemap].styleUrl
  const seleccionAlertas = seleccionCue ? (grupos.get(seleccionCue) ?? []) : []
  const seleccionCoords =
    seleccionAlertas.length > 0
      ? ([seleccionAlertas[0].lon as number, seleccionAlertas[0].lat as number] as [
          number,
          number,
        ])
      : null

  function handleClick(event: MapLayerMouseEvent) {
    const feature = (event.features ?? [])[0]
    if (!feature || !feature.properties) {
      setSeleccionCue(null)
      return
    }
    setSeleccionCue(String(feature.properties.cueAnexo))
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
          initialViewState={{
            longitude: MAP_CENTER[0],
            latitude: MAP_CENTER[1],
            zoom: MAP_ZOOM,
          }}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={[ALERTAS_LAYER_ID]}
          onClick={handleClick}
          cursor="pointer"
        >
          <NavigationControl position="top-left" />

          <Source id="infra-alertas-src" type="geojson" data={featureCollection}>
            <Layer id={ALERTAS_LAYER_ID} type="circle" paint={circlePaint()} />
          </Source>

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

      <div className={styles.controlsStack}>
        <BasemapControl value={basemap} onChange={setBasemap} />
      </div>

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
