import type { CircleLayerSpecification, FilterSpecification } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { PropiedadesPuntoNivel } from '@/lib/infraestructura/mapa/puntos-nivel'
import { COLOR_JUNTO_LAGUNA } from '@/lib/infraestructura/mapa/planificacion'
import { colorBordeSinReporte, colorEscuelaSinReporte, radioPunto, radioPuntoNivel } from '@/lib/infraestructura/mapa/punto'

export const CAPA_RIESGO_SITUACION_ID = 'infra-riesgo-situacion'
export const FUENTE_RIESGO_SITUACION_ID = 'infra-riesgo-situacion-src'

/** Anillo violeta: amenaza alta hoy (no es un nivel de riesgo, por eso no usa la escala de colores). */
export const COLOR_AMENAZA_ALTA = '#7c3aed'

const COLOR_BORDE_CLARO = '#1c1c1c'
const COLOR_BORDE_OSCURO = '#f4f1ec'

export function paintPuntosNivel(oscuro: boolean): CircleLayerSpecification['paint'] {
  return {
    // Con clase de río: color del nivel. Sólo junto a laguna: punto azul. Resto: neutro.
    'circle-color': ['case', ['get', 'conDato'], ['get', 'color'], ['get', 'juntoLaguna'], COLOR_JUNTO_LAGUNA, colorEscuelaSinReporte(oscuro)],
    'circle-radius': radioPuntoNivel(),
    'circle-stroke-color': ['case', ['get', 'conDato'], oscuro ? COLOR_BORDE_OSCURO : COLOR_BORDE_CLARO, colorBordeSinReporte(oscuro)],
    'circle-stroke-width': ['case', ['get', 'conDato'], 1, 1.5],
    'circle-opacity': 1,
  }
}

/** Anillo azul sobre los puntos con nivel de río que también están junto a una laguna. */
export function filtroAnilloLaguna(): FilterSpecification {
  return ['all', ['get', 'conDato'], ['==', ['get', 'juntoLaguna'], true]]
}

export function paintAnilloLaguna(): CircleLayerSpecification['paint'] {
  return {
    'circle-color': 'rgba(0, 0, 0, 0)',
    'circle-radius': radioPunto(1) + 3,
    'circle-stroke-color': COLOR_JUNTO_LAGUNA,
    'circle-stroke-width': 2,
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
      <Layer id={`${props.idCapa}-laguna`} type="circle" filter={filtroAnilloLaguna()} paint={paintAnilloLaguna()} />
      <Layer id={`${props.idCapa}-amenaza`} type="circle" filter={['==', ['get', 'amenazaAlta'], true]} paint={{ ...paintAnilloLaguna(), 'circle-stroke-color': COLOR_AMENAZA_ALTA }} />
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
