'use client'

import { Layer, Source } from 'react-map-gl/maplibre'
import { COLOR_POSIBLE_CENTRO, type CaminoCentro } from '@/lib/infraestructura/evacuacion/mapa'

export const CAPA_CAMINO_CENTRO_CASING_ID = 'infra-camino-centro-casing'
export const CAPA_CAMINO_CENTRO_ID = 'infra-camino-centro-line'
export const CAPA_CAMINO_CENTRO_RECTA_ID = 'infra-camino-centro-recta'
export const CAPA_DESTINO_CENTRO_ID = 'infra-destino-centro-circle'

interface CapaCentroEvacuadosProps {
  /** Camino hacia el centro más cercano, sólo cuando la persona lo pidió. */
  camino: CaminoCentro | null
  oscuro: boolean
}

export function CapaCentroEvacuados({ camino, oscuro }: CapaCentroEvacuadosProps) {
  return (
    <>
      {camino !== null && (
        <>
          <Source id="infra-camino-centro-src" type="geojson" data={camino.linea}>
            <Layer
              id={CAPA_CAMINO_CENTRO_CASING_ID}
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': oscuro ? '#111827' : '#ffffff', 'line-width': 8 }}
            />
            <Layer
              id={CAPA_CAMINO_CENTRO_ID}
              type="line"
              filter={['==', ['get', 'tipo'], 'camino']}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': COLOR_POSIBLE_CENTRO, 'line-width': 5 }}
            />
            <Layer
              id={CAPA_CAMINO_CENTRO_RECTA_ID}
              type="line"
              filter={['==', ['get', 'tipo'], 'linea_recta']}
              layout={{ 'line-join': 'round', 'line-cap': 'butt' }}
              paint={{ 'line-color': COLOR_POSIBLE_CENTRO, 'line-width': 4, 'line-dasharray': [2, 2] }}
            />
          </Source>
          <Source id="infra-destino-centro-src" type="geojson" data={camino.destino}>
            <Layer
              id={CAPA_DESTINO_CENTRO_ID}
              type="circle"
              paint={{ 'circle-radius': 9, 'circle-color': COLOR_POSIBLE_CENTRO, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 }}
            />
          </Source>
        </>
      )}
    </>
  )
}
