import type { CircleLayerSpecification } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { PropiedadesPuntoNivel } from '@/lib/infraestructura/mapa/puntos-nivel'
import { radioPunto } from '@/lib/infraestructura/mapa/punto'

const COLOR_BORDE_CLARO = '#1c1c1c'
const COLOR_BORDE_OSCURO = '#f4f1ec'

export function paintPuntosNivel(oscuro: boolean): CircleLayerSpecification['paint'] {
  return {
    'circle-color': ['get', 'color'],
    'circle-radius': ['case', ['get', 'conDato'], radioPunto(1), radioPunto(0)],
    'circle-stroke-color': oscuro ? COLOR_BORDE_OSCURO : COLOR_BORDE_CLARO,
    'circle-stroke-width': 1,
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
