'use client'

// Capas y leyenda del mapa territorial.
//
// La leyenda reutiliza los MISMOS SVG con los que se rasterizan los símbolos del
// mapa (`ICONOS_ACCESOS_MAPA`), así el ícono de la leyenda nunca puede
// desincronizarse del ícono dibujado. El color de texto sale siempre de los
// tokens de `useOverlayStyles`: los colores de `paint` de MapLibre, en cambio,
// son literales a propósito (una paint expression no lee variables CSS).

import type { SymbolLayerSpecification, LineLayerSpecification } from 'maplibre-gl'
import { Layer, Source } from 'react-map-gl/maplibre'
import {
  COLOR_RUTA_ACCESO,
  ETIQUETAS_AISLAMIENTO,
  ETIQUETAS_INUNDACION,
  SVG_ICONO_AISLAMIENTO_0,
  SVG_ICONO_AISLAMIENTO_1,
  SVG_ICONO_AISLAMIENTO_2,
  SVG_ICONO_AISLAMIENTO_3,
  SVG_ICONO_AISLAMIENTO_SIN_DATOS,
  SVG_ICONO_INUNDACION_ALTA,
  SVG_ICONO_INUNDACION_BAJA,
  SVG_ICONO_INUNDACION_MEDIA,
  TEXTOS_ACCESOS,
} from '@/lib/mapas/accesos-capas'
import type { resumirCobertura } from '@/lib/mapas/accesos-capas'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import { CAPA_CELDAS_EXPOSICION_ID, COLOR_BORDE_CELDAS_EXPOSICION, COLOR_CELDAS_EXPOSICION, OPACIDAD_CELDAS_EXPOSICION } from '@/lib/mapas/exposicion-ruta-capas'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { CapaAccesos } from '@/components/mapas/layer-control'
import { MOSTRAR_AGUA_ESTIMADA } from '@/lib/mapas/flags'

// ---------------------------------------------------------------------------
// Ids de capas (los consume la página para `fitBounds` e interactividad)
// ---------------------------------------------------------------------------

export const CAPA_AISLAMIENTO_ID = 'infra-aislamiento-symbol'
export const CAPA_INUNDACION_ID = 'infra-inundacion-symbol'
export const CAPA_RUTA_ACCESO_CASING_ID = 'infra-ruta-acceso-casing'
export const CAPA_RUTA_ACCESO_ID = 'infra-ruta-acceso-line'
export const CAPA_CRUCES_ACCESO_ID = 'infra-cruces-acceso-symbol'

// Ids de fuentes: internos del componente (la página sólo necesita los layers).
const FUENTE_AISLAMIENTO_ID = 'infra-accesos-aislamiento-src'
const FUENTE_INUNDACION_ID = 'infra-accesos-inundacion-src'
const FUENTE_RUTA_ID = 'infra-accesos-ruta-src'
const FUENTE_CRUCES_ID = 'infra-accesos-cruces-src'

// ---------------------------------------------------------------------------
// Layouts compartidos
// ---------------------------------------------------------------------------

// Símbolos de cobertura parcial (aislamiento / inundación): el icono lo elige
// `['get','icono']`. `icon-allow-overlap: false` deja que MapLibre resuelva la
// colisión entre escuelas vecinas; el tamaño crece con el zoom.
function layoutPuntoTerritorial(): SymbolLayerSpecification['layout'] {
  return {
    'icon-image': ['get', 'icono'],
    'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.55, 11, 0.9],
    'icon-allow-overlap': false,
  }
}

// Cruces de la ruta: sí permiten solapamiento, porque un puente y un vado
// pueden caer muy cerca y ambos deben verse.
function layoutCruce(): SymbolLayerSpecification['layout'] {
  return {
    'icon-image': ['get', 'icono'],
    'icon-size': 0.9,
    'icon-allow-overlap': true,
  }
}

function layoutRuta(): LineLayerSpecification['layout'] {
  return { 'line-join': 'round', 'line-cap': 'round' }
}

// ---------------------------------------------------------------------------
// a) Capas territoriales
// ---------------------------------------------------------------------------

type CapasAccesosTerritorialesProps = {
  puntosAislamiento: GeoJSON.FeatureCollection | null
  puntosInundacion: GeoJSON.FeatureCollection | null
  ruta: GeoJSON.FeatureCollection | null
  celdasExposicion?: GeoJSON.FeatureCollection<GeoJSON.Polygon> | null
  cruces: GeoJSON.FeatureCollection | null
  visibles: Record<CapaAccesos, boolean>
  iconosListos: boolean
  oscuro: boolean
}

export function CapasAccesosTerritoriales({
  puntosAislamiento,
  puntosInundacion,
  ruta,
  celdasExposicion = null,
  cruces,
  visibles,
  iconosListos,
  oscuro,
}: CapasAccesosTerritorialesProps) {
  return (
    <>
      {visibles.aislamiento && puntosAislamiento !== null && iconosListos && (
        <Source id={FUENTE_AISLAMIENTO_ID} type="geojson" data={puntosAislamiento}>
          <Layer id={CAPA_AISLAMIENTO_ID} type="symbol" layout={layoutPuntoTerritorial()} />
        </Source>
      )}

      {MOSTRAR_AGUA_ESTIMADA && visibles.inundacion && puntosInundacion !== null && iconosListos && (
        <Source id={FUENTE_INUNDACION_ID} type="geojson" data={puntosInundacion}>
          <Layer id={CAPA_INUNDACION_ID} type="symbol" layout={layoutPuntoTerritorial()} />
        </Source>
      )}

      {ruta !== null && celdasExposicion !== null && (
        <Source id="infra-celdas-exposicion-src" type="geojson" data={celdasExposicion}>
          <Layer id={CAPA_CELDAS_EXPOSICION_ID} type="fill" paint={{
            'fill-color': COLOR_CELDAS_EXPOSICION,
            'fill-opacity': OPACIDAD_CELDAS_EXPOSICION,
            'fill-outline-color': COLOR_BORDE_CELDAS_EXPOSICION,
          }} />
          <Layer id="infra-celdas-exposicion-outline" type="line" layout={{ 'line-join': 'round' }} paint={{
            'line-color': COLOR_BORDE_CELDAS_EXPOSICION,
            'line-width': 1.5,
          }} />
        </Source>
      )}

      {ruta !== null && (
        <Source id={FUENTE_RUTA_ID} type="geojson" data={ruta}>
          <Layer
            id={CAPA_RUTA_ACCESO_CASING_ID}
            type="line"
            layout={layoutRuta()}
            paint={{
              'line-color': oscuro ? '#111827' : '#ffffff',
              'line-width': 7,
            }}
          />
          <Layer
            id={CAPA_RUTA_ACCESO_ID}
            type="line"
            layout={layoutRuta()}
            paint={{ 'line-color': COLOR_RUTA_ACCESO, 'line-width': 4 }}
          />
        </Source>
      )}

      {ruta !== null && cruces !== null && iconosListos && (
        <Source id={FUENTE_CRUCES_ID} type="geojson" data={cruces}>
          <Layer id={CAPA_CRUCES_ACCESO_ID} type="symbol" layout={layoutCruce()} />
        </Source>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// b) Leyenda
// ---------------------------------------------------------------------------

const NIVELES_AISLAMIENTO = [0, 1, 2, 3, 'sin_datos_red'] as const

const ICONO_AISLAMIENTO: Record<(typeof NIVELES_AISLAMIENTO)[number], string> = {
  0: SVG_ICONO_AISLAMIENTO_0,
  1: SVG_ICONO_AISLAMIENTO_1,
  2: SVG_ICONO_AISLAMIENTO_2,
  3: SVG_ICONO_AISLAMIENTO_3,
  sin_datos_red: SVG_ICONO_AISLAMIENTO_SIN_DATOS,
}

const NIVELES_INUNDACION = ['baja', 'media', 'alta'] as const

const ICONO_INUNDACION: Record<(typeof NIVELES_INUNDACION)[number], string> = {
  baja: SVG_ICONO_INUNDACION_BAJA,
  media: SVG_ICONO_INUNDACION_MEDIA,
  alta: SVG_ICONO_INUNDACION_ALTA,
}

type LeyendaAccesosProps = {
  visibles: Record<CapaAccesos, boolean>
  territorio: TerritorioMapa | null
  territorioLoading: boolean
  territorioError: string | null
  resumen: ReturnType<typeof resumirCobertura> | null
}

export function LeyendaAccesos({
  visibles,
  territorio,
  territorioLoading,
  territorioError,
  resumen,
}: LeyendaAccesosProps) {
  // contenedor). El hook se llama siempre, antes del early return.
  const styles = useOverlayStyles()
  const hayBloqueTerritorio = visibles.aislamiento || visibles.inundacion
  if (!hayBloqueTerritorio) {
    return null
  }

  // Carga y error son del MISMO request territorial, así que se muestran una
  // sola vez para los bloques visibles (no un alert duplicado por capa).
  const territorioListo = !territorioLoading && territorioError === null

  // Una sola tarjeta opaca para los tres bloques. Antes cada bloque era un
  // `legendItemStack` suelto: sin fondo, el texto se imprimía sobre el mapa y
  // los tres se apilaban sin separación. `styles.panel` (.map-panel) da fondo
  // `--card`, borde y sombra; dentro de `.map-left-stack` la regla
  // `.map-left-stack > .map-panel` lo devuelve al flujo, así que se apila con
  // los demás paneles en vez de anclarse por su cuenta.
  return (
    <section
      className={`${styles.panel} map-leyenda-accesos`}
      data-testid="leyenda-accesos"
      aria-label="Datos territoriales"
    >
      {hayBloqueTerritorio && territorioLoading && (
        <div className={styles.legendItemStack} data-testid="leyenda-territorio-cargando">
          <div className={styles.hint}>Cargando capas territoriales…</div>
        </div>
      )}
      {hayBloqueTerritorio && !territorioLoading && territorioError !== null && (
        <div className={styles.legendItemStack} data-testid="leyenda-territorio-error">
          <div className={`${styles.hint} ${styles.statusError}`} role="alert">
            {territorioError}
          </div>
        </div>
      )}
      {visibles.aislamiento && territorioListo && (
        <BloqueAislamiento territorio={territorio} resumen={resumen} />
      )}
      {MOSTRAR_AGUA_ESTIMADA && visibles.inundacion && territorioListo && (
        <BloqueInundacion territorio={territorio} resumen={resumen} />
      )}
    </section>
  )
}

// Icono SVG (el MISMO que se dibuja en el mapa) como data URI. No es decorativo
// con significado propio: el texto de al lado nombra el nivel, por eso `alt=""`
// y `aria-hidden`.
function IconoSvg({ svg }: { svg: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={'data:image/svg+xml;utf8,' + encodeURIComponent(svg)}
      alt=""
      aria-hidden
      width={18}
      height={18}
    />
  )
}

// Fila visible de la leyenda: ícono + nombre corto + conteo. La explicación en
// lenguaje llano de cada fila vive en el `<details>` de ayuda del bloque, para
// que la leyenda sea una tabla de conteos y no un muro de texto.
function FilaConIcono({ svg, etiqueta, conteo }: { svg: string; etiqueta: string; conteo: number }) {
  const styles = useOverlayStyles()
  return (
    <div className={styles.legendItem}>
      <IconoSvg svg={svg} />
      <span>
        {etiqueta}: <b>{conteo}</b>
      </span>
    </div>
  )
}

// Bloque de la capa de aislamiento OSM (índice estático 0..3 + sin conexión).
function BloqueAislamiento({
  territorio,
  resumen,
}: {
  territorio: TerritorioMapa | null
  resumen: ReturnType<typeof resumirCobertura> | null
}) {
  const styles = useOverlayStyles()
  const sinDatos = territorio?.aislamiento == null || resumen === null

  return (
    <div className={styles.legendItemStack} data-testid="leyenda-aislamiento">
      <b>{TEXTOS_ACCESOS.tituloAcceso}</b>
      {sinDatos ? (
        <div className={styles.legendItemStack} data-testid="leyenda-aislamiento-sin-datos">
          <div className={styles.hint}>Sin datos de caminos cargados.</div>
        </div>
      ) : (
        <div data-testid="leyenda-aislamiento-contenido">
          {NIVELES_AISLAMIENTO.map((nivel) => (
            <FilaConIcono
              key={nivel}
              svg={ICONO_AISLAMIENTO[nivel]}
              etiqueta={
                nivel === 'sin_datos_red'
                  ? ETIQUETAS_AISLAMIENTO[nivel]
                  : `${ETIQUETAS_AISLAMIENTO[nivel]} (${nivel})`
              }
              conteo={resumen.aislamiento[nivel]}
            />
          ))}
          <div className={styles.legendItem}>
            <span>
              Sin dato (escuela fuera de los datos): <b>{resumen.aislamiento.sin_cobertura}</b>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Ayuda de la leyenda de inundación: qué estima el modelo, qué NO es y qué
// significan los conteos que no se dibujan. Cerrada por defecto.
function BloqueInundacion({
  territorio,
  resumen,
}: {
  territorio: TerritorioMapa | null
  resumen: ReturnType<typeof resumirCobertura> | null
}) {
  const styles = useOverlayStyles()
  const sinDatos = territorio?.susceptibilidad == null || resumen === null

  return (
    <div className={styles.legendItemStack} data-testid="leyenda-inundacion">
      <b>{TEXTOS_ACCESOS.tituloInundacion}</b>
      {sinDatos ? (
        <div className={styles.legendItemStack} data-testid="leyenda-inundacion-sin-datos">
          <div className={styles.hint}>Sin datos de agua estimada cargados.</div>
        </div>
      ) : (
        <div data-testid="leyenda-inundacion-contenido">
          {NIVELES_INUNDACION.map((clase) => (
            <FilaConIcono
              key={clase}
              svg={ICONO_INUNDACION[clase]}
              etiqueta={ETIQUETAS_INUNDACION[clase]}
              conteo={resumen.inundacion[clase]}
            />
          ))}
          <div className={styles.legendItem}>
            <span>
              Sin agua estimada (0 m):{' '}
              <b>{resumen.inundacion.sin_profundidad}</b>
            </span>
          </div>
          <div className={styles.legendItem}>
            <span>
              Sin dato (escuela fuera de los datos): <b>{resumen.inundacion.sin_cobertura}</b>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// c) Bounding box de la ruta para `map.fitBounds`
// ---------------------------------------------------------------------------

// min/max de las coordenadas de la(s) LineString de la ruta. Puro. Devuelve
// null si no hay ruta o no hay ninguna coordenada.
export function bboxRuta(
  ruta: GeoJSON.FeatureCollection | null,
): [[number, number], [number, number]] | null {
  if (ruta === null) return null

  let minLon = Number.POSITIVE_INFINITY
  let minLat = Number.POSITIVE_INFINITY
  let maxLon = Number.NEGATIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let hay = false

  for (const feature of ruta.features) {
    const geometria = feature.geometry
    if (geometria === null || geometria.type !== 'LineString') continue
    for (const [lon, lat] of geometria.coordinates) {
      hay = true
      if (lon < minLon) minLon = lon
      if (lat < minLat) minLat = lat
      if (lon > maxLon) maxLon = lon
      if (lat > maxLat) maxLat = lat
    }
  }

  if (!hay) return null
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ]
}
