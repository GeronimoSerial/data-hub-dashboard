import type { CircleLayerSpecification } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { PropiedadesPuntoNivel } from '@/lib/infraestructura/mapa/puntos-nivel'
import { colorBordeSinReporte, colorEscuelaSinReporte, radioPuntoNivel } from '@/lib/infraestructura/mapa/punto'

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
