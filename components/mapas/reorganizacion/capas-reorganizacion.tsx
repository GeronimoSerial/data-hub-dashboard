import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { LineString } from 'geojson'
import type { SymbolLayerSpecification } from 'maplibre-gl'
import { coloresMapa } from '@/lib/mapas/colores-mapa'
import {
  CAPA_RECORRIDO_PUNTOS,
  CAPA_RECORRIDO_TRAZADO,
  CAPA_SECUNDARIAS,
  CAPA_OTRAS_PRIMARIAS,
  CAPA_SELECCION,
  CAPA_UNIVERSO,
  CAPA_ZONAS,
  FILTRO_RECORRIDO_PUNTOS,
  FILTRO_RECORRIDO_TRAZADO,
  FUENTE_OTRAS_PRIMARIAS,
  FUENTE_RECORRIDO,
  FUENTE_SECUNDARIAS,
  FUENTE_SELECCION,
  FUENTE_UNIVERSO,
  FUENTE_ZONAS,
  construirReferencias,
  construirRecorrido,
  construirSeleccion,
  construirUniverso,
  construirZonas,
  paintRecorrido,
  paintRecorridoPuntos,
  paintReferencias,
  paintSeleccion,
  paintUniverso,
  paintZonas,
  type PuntoRecorrido,
} from '@/lib/reorganizacion/capas'
import type { DatasetV29 } from '@/lib/reorganizacion/tipos'

export const CAPA_ETIQUETA_SELECCION = 'reorganizacion-seleccion-etiqueta'

const LAYOUT_ETIQUETA_SELECCION: SymbolLayerSpecification['layout'] = {
  'text-field': ['get', 'nombre'],
  'text-size': 12,
  'text-font': ['Noto Sans Regular'],
  'text-anchor': 'top',
  'text-offset': [0, 1.2],
  'text-allow-overlap': true,
}

function paintEtiquetaSeleccion(oscuro: boolean): SymbolLayerSpecification['paint'] {
  const colores = coloresMapa(oscuro)
  return {
    'text-color': colores.tinta,
    'text-halo-color': colores.halo,
    'text-halo-width': 1.5,
  }
}

const PAINT_ZONAS = paintZonas()
const PAINT_OTRAS_PRIMARIAS = paintReferencias('primaria')
const PAINT_SECUNDARIAS = paintReferencias('secundaria')
const PAINT_SELECCION = paintSeleccion()
const PAINT_RECORRIDO = paintRecorrido()
const PAINT_RECORRIDO_PUNTOS = paintRecorridoPuntos()

export interface VisibilidadCapas {
  zonas: boolean
  otrasPrimarias: boolean
  secundarias: boolean
}

export interface RecorridoMapa {
  origen: PuntoRecorrido
  destino: PuntoRecorrido
  /** Null cuando el proveedor no entregó trazado: no se dibuja línea. */
  geometria: LineString | null
}

export interface CapasReorganizacionProps {
  dataset: DatasetV29
  idsCoincidentes: ReadonlySet<string>
  hayFiltroActivo: boolean
  resaltados: ReadonlySet<string>
  seleccionada: string | null
  visibles: VisibilidadCapas
  recorrido: RecorridoMapa | null
  tema: 'claro' | 'oscuro'
}

/**
 * Capas del mapa de reorganización, de abajo hacia arriba: zonas, otras
 * primarias, secundarias, universo, selección y recorrido. El universo se
 * dibuja siempre completo; el filtro sólo lo atenúa.
 */
export function CapasReorganizacion({
  dataset,
  idsCoincidentes,
  hayFiltroActivo,
  resaltados,
  seleccionada,
  visibles,
  recorrido,
  tema,
}: CapasReorganizacionProps) {
  const oscuro = tema === 'oscuro'
  const { escuelas, referencias, centros } = dataset

  const zonas = useMemo(() => construirZonas(centros, escuelas), [centros, escuelas])
  const otrasPrimarias = useMemo(
    () => construirReferencias(referencias, 'primaria', escuelas),
    [referencias, escuelas],
  )
  const secundarias = useMemo(
    () => construirReferencias(referencias, 'secundaria', escuelas),
    [referencias, escuelas],
  )
  const universo = useMemo(
    () => construirUniverso(escuelas, { idsCoincidentes, hayFiltroActivo, resaltados, seleccionada }),
    [escuelas, idsCoincidentes, hayFiltroActivo, resaltados, seleccionada],
  )
  const escuelaSeleccionada = useMemo(
    () => escuelas.find((escuela) => escuela.cue === seleccionada) ?? null,
    [escuelas, seleccionada],
  )
  const seleccion = useMemo(() => construirSeleccion(escuelaSeleccionada), [escuelaSeleccionada])
  const ruta = useMemo(
    () => (recorrido ? construirRecorrido(recorrido.origen, recorrido.destino, recorrido.geometria) : null),
    [recorrido],
  )
  const paintUniversoTema = useMemo(() => paintUniverso({ oscuro }), [oscuro])
  const paintEtiqueta = useMemo(() => paintEtiquetaSeleccion(oscuro), [oscuro])

  return (
    <>
      {visibles.zonas && (
        <Source id={FUENTE_ZONAS} type="geojson" data={zonas}>
          <Layer id={CAPA_ZONAS} type="fill" paint={PAINT_ZONAS} />
        </Source>
      )}

      {visibles.otrasPrimarias && (
        <Source id={FUENTE_OTRAS_PRIMARIAS} type="geojson" data={otrasPrimarias}>
          <Layer id={CAPA_OTRAS_PRIMARIAS} type="circle" paint={PAINT_OTRAS_PRIMARIAS} />
        </Source>
      )}

      {visibles.secundarias && (
        <Source id={FUENTE_SECUNDARIAS} type="geojson" data={secundarias}>
          <Layer id={CAPA_SECUNDARIAS} type="circle" paint={PAINT_SECUNDARIAS} />
        </Source>
      )}

      <Source id={FUENTE_UNIVERSO} type="geojson" data={universo}>
        <Layer id={CAPA_UNIVERSO} type="circle" paint={paintUniversoTema} />
      </Source>

      {escuelaSeleccionada && (
        <Source id={FUENTE_SELECCION} type="geojson" data={seleccion}>
          <Layer id={CAPA_SELECCION} type="circle" paint={PAINT_SELECCION} />
          <Layer
            id={CAPA_ETIQUETA_SELECCION}
            type="symbol"
            layout={LAYOUT_ETIQUETA_SELECCION}
            paint={paintEtiqueta}
          />
        </Source>
      )}

      {ruta && (
        <Source id={FUENTE_RECORRIDO} type="geojson" data={ruta}>
          <Layer id={CAPA_RECORRIDO_TRAZADO} type="line" filter={FILTRO_RECORRIDO_TRAZADO} paint={PAINT_RECORRIDO} />
          <Layer id={CAPA_RECORRIDO_PUNTOS} type="circle" filter={FILTRO_RECORRIDO_PUNTOS} paint={PAINT_RECORRIDO_PUNTOS} />
        </Source>
      )}
    </>
  )
}
