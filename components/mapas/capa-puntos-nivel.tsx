import type { CircleLayerSpecification } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { PropiedadesPuntoNivel } from '@/lib/infraestructura/mapa/puntos-nivel'
import { colorBordeSinReporte, colorEscuelaSinReporte, radioPuntoNivel } from '@/lib/infraestructura/mapa/punto'

export const CAPA_RIESGO_SITUACION_ID = 'infra-riesgo-situacion'
export const FUENTE_RIESGO_SITUACION_ID = 'infra-riesgo-situacion-src'

const COLOR_BORDE_CLARO = '#1c1c1c'
const COLOR_BORDE_OSCURO = '#f4f1ec'

export function paintPuntosNivel(oscuro: boolean): CircleLayerSpecification['paint'] {
  return {
    'circle-color': ['case', ['get', 'conDato'], ['get', 'color'], colorEscuelaSinReporte(oscuro)],
    'circle-radius': radioPuntoNivel(),
    'circle-stroke-color': ['case', ['get', 'conDato'], oscuro ? COLOR_BORDE_OSCURO : COLOR_BORDE_CLARO, colorBordeSinReporte(oscuro)],
    'circle-stroke-width': ['case', ['get', 'conDato'], 1, 1.5],
    'circle-opacity': 1,
  }
}

export function CapaPuntosNivel(props: {
  idCapa: string
  idFuente: string
  puntos: FeatureCollection<Point, PropiedadesPuntoNivel>
  oscuro: boolean
}) {
  return (
    <Source id={props.idFuente} type="geojson" data={props.puntos}>
      <Layer id={props.idCapa} type="circle" paint={paintPuntosNivel(props.oscuro)} />
    </Source>
  )
}

export function CapaRiesgoSituacion(props: {
  puntos: FeatureCollection<Point, PropiedadesPuntoNivel>
  beforeId: string
}) {
  return (
    <Source id={FUENTE_RIESGO_SITUACION_ID} type="geojson" data={props.puntos}>
      <Layer
        id={CAPA_RIESGO_SITUACION_ID}
        type="circle"
        beforeId={props.beforeId}
        paint={{
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4.5, 10, 6.5, 14, 8],
          'circle-opacity': 0.45,
        }}
      />
    </Source>
  )
}
