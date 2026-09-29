'use client'

// Capas y leyenda del mapa de accesos (T5c1).
//
// Estas capas son CONTEXTO ESTÁTICO derivado offline, nunca un pronóstico:
//  - Aislamiento OSM: índice estático 0..3 de caminos y cruces de agua hasta la
//    cabecera departamental. "Sin conexión a la red OSM" no es lo mismo que 0.
//  - Inundación physrisk: profundidad histórica (m) para un período de retorno.
//    No es un río/cauce ni un pronóstico.
//  - Ruta y cruces: la ruta OSM que el cálculo realmente usó, desde el nodo de
//    la red vial MÁS CERCANO a la escuela hasta la cabecera departamental. Se
//    dibuja EXACTAMENTE la geometría recibida: no se inventan rectas ni puntos.
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
  DESCRIPCIONES_AISLAMIENTO,
  ETIQUETAS_AISLAMIENTO,
  ETIQUETAS_CRUCE,
  ETIQUETAS_INUNDACION,
  SVG_ICONO_AISLAMIENTO_0,
  SVG_ICONO_AISLAMIENTO_1,
  SVG_ICONO_AISLAMIENTO_2,
  SVG_ICONO_AISLAMIENTO_3,
  SVG_ICONO_AISLAMIENTO_SIN_DATOS,
  SVG_ICONO_CRUCE_PUENTE,
  SVG_ICONO_CRUCE_SIN_EVIDENCIA,
  SVG_ICONO_CRUCE_VADO,
  SVG_ICONO_INUNDACION_ALTA,
  SVG_ICONO_INUNDACION_BAJA,
  SVG_ICONO_INUNDACION_MEDIA,
  TEXTOS_ACCESOS,
  textoConPeriodo,
} from '@/lib/mapas/accesos-capas'
import type { resumirCobertura } from '@/lib/mapas/accesos-capas'
import type { GeometriaAccesoRespuesta, TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import { CAPA_CELDAS_EXPOSICION_ID, COLOR_CELDAS_EXPOSICION, OPACIDAD_CELDAS_EXPOSICION } from '@/lib/mapas/exposicion-ruta-capas'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Button } from '@/components/ui/button'
import type { CapaAccesos } from '@/components/mapas/layer-control'

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

      {visibles.inundacion && puntosInundacion !== null && iconosListos && (
        <Source id={FUENTE_INUNDACION_ID} type="geojson" data={puntosInundacion}>
          <Layer id={CAPA_INUNDACION_ID} type="symbol" layout={layoutPuntoTerritorial()} />
        </Source>
      )}

      {visibles.rutaSeleccion && ruta !== null && celdasExposicion !== null && (
        <Source id="infra-celdas-exposicion-src" type="geojson" data={celdasExposicion}>
          <Layer id={CAPA_CELDAS_EXPOSICION_ID} type="fill" paint={{
            'fill-color': COLOR_CELDAS_EXPOSICION,
            'fill-opacity': OPACIDAD_CELDAS_EXPOSICION,
            'fill-outline-color': COLOR_CELDAS_EXPOSICION,
          }} />
        </Source>
      )}

      {visibles.rutaSeleccion && ruta !== null && (
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

      {visibles.rutaSeleccion && ruta !== null && cruces !== null && iconosListos && (
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

const FILAS_CRUCES = [
  { clave: 'puente', campo: 'puente', svg: SVG_ICONO_CRUCE_PUENTE },
  { clave: 'vado', campo: 'vado', svg: SVG_ICONO_CRUCE_VADO },
  { clave: 'sin_evidencia', campo: 'sinEvidencia', svg: SVG_ICONO_CRUCE_SIN_EVIDENCIA },
] as const

type LeyendaAccesosProps = {
  visibles: Record<CapaAccesos, boolean>
  territorio: TerritorioMapa | null
  territorioLoading: boolean
  territorioError: string | null
  resumen: ReturnType<typeof resumirCobertura> | null
  seleccion: { nombre: string } | null
  geometria: GeometriaAccesoRespuesta | null
  celdasExposicion?: GeoJSON.FeatureCollection<GeoJSON.Polygon> | null
  geometriaLoading: boolean
  geometriaError: string | null
  onEncuadrarRuta?: () => void
}

export function LeyendaAccesos({
  visibles,
  territorio,
  territorioLoading,
  territorioError,
  resumen,
  seleccion,
  geometria,
  celdasExposicion = null,
  geometriaLoading,
  geometriaError,
  onEncuadrarRuta,
}: LeyendaAccesosProps) {
  // Sin ningún bloque visible no hay nada que mostrar (el llamador decide el
  // contenedor). El hook se llama siempre, antes del early return.
  const styles = useOverlayStyles()
  const hayBloqueTerritorio = visibles.aislamiento || visibles.inundacion
  if (!hayBloqueTerritorio && !visibles.rutaSeleccion) {
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
      aria-label="Referencias de las capas territoriales"
    >
      {visibles.rutaSeleccion && (
        <BloqueRuta
          seleccion={seleccion}
          geometria={geometria}
          geometriaLoading={geometriaLoading}
          geometriaError={geometriaError}
          celdasExposicion={celdasExposicion}
          onEncuadrarRuta={onEncuadrarRuta}
        />
      )}
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
      {visibles.inundacion && territorioListo && (
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

// Ayuda de la leyenda de aislamiento: qué mide el índice, cómo se leen los
// niveles (las reglas del cálculo) y qué NO representa. Cerrada por defecto.
function AyudaLeyendaAislamiento() {
  const styles = useOverlayStyles()
  return (
    <details className="ayuda-leyenda" data-testid="leyenda-aislamiento-ayuda">
      <summary>Qué significa</summary>
      <div className={styles.hint}>{TEXTOS_ACCESOS.queMideAcceso}</div>
      <div className={styles.hint}>{TEXTOS_ACCESOS.nivelesAcceso}</div>
      {NIVELES_AISLAMIENTO.map((nivel) => (
        <div key={nivel} className={styles.hint}>
          <b>{DESCRIPCIONES_AISLAMIENTO[nivel].nombre}:</b>{' '}
          {DESCRIPCIONES_AISLAMIENTO[nivel].detalle}
        </div>
      ))}
      <div className={styles.hint}>{TEXTOS_ACCESOS.sinCobertura}</div>
      <div className={styles.hint}>{TEXTOS_ACCESOS.noRepresentaAcceso}</div>
    </details>
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
          <div className={styles.hint}>Sin datos importados de OSM.</div>
        </div>
      ) : (
        <div data-testid="leyenda-aislamiento-contenido">
          <div className={styles.hint}>{TEXTOS_ACCESOS.subtituloAcceso}</div>
          {NIVELES_AISLAMIENTO.map((nivel) => (
            <FilaConIcono
              key={nivel}
              svg={ICONO_AISLAMIENTO[nivel]}
              etiqueta={ETIQUETAS_AISLAMIENTO[nivel]}
              conteo={resumen.aislamiento[nivel]}
            />
          ))}
          <div className={styles.legendItem}>
            <span>
              Sin dato: <b>{resumen.aislamiento.sin_cobertura}</b>
            </span>
          </div>
          <AyudaLeyendaAislamiento />
          <div className={styles.hint}>
            © OpenStreetMap contributors (ODbL) · extracto{' '}
            {territorio?.aislamiento?.fechaExtractoOsm}
          </div>
        </div>
      )}
    </div>
  )
}

// Ayuda de la leyenda de inundación: qué estima el modelo, qué NO es y qué
// significan los conteos que no se dibujan. Cerrada por defecto.
function AyudaLeyendaInundacion({ periodoRetornoAnios }: { periodoRetornoAnios: number | null }) {
  const styles = useOverlayStyles()
  return (
    <details className="ayuda-leyenda" data-testid="leyenda-inundacion-ayuda">
      <summary>Qué significa</summary>
      <div className={styles.hint}>
        {textoConPeriodo(TEXTOS_ACCESOS.queMideInundacion, periodoRetornoAnios)}
      </div>
      <div className={styles.hint}>{TEXTOS_ACCESOS.sinProfundidad}</div>
      <div className={styles.hint}>{TEXTOS_ACCESOS.sinCobertura}</div>
      <div className={styles.hint}>{TEXTOS_ACCESOS.noRepresentaInundacion}</div>
    </details>
  )
}

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
          <div className={styles.hint}>Sin datos importados de physrisk.</div>
        </div>
      ) : (
        <div data-testid="leyenda-inundacion-contenido">
          <div className={styles.hint}>
            {textoConPeriodo(
              TEXTOS_ACCESOS.subtituloInundacion,
              territorio?.susceptibilidad?.periodoRetornoAnios,
            )}
          </div>
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
              Sin profundidad estimada (0 m):{' '}
              <b>{resumen.inundacion.sin_profundidad}</b>
            </span>
          </div>
          <div className={styles.legendItem}>
            <span>
              Sin dato: <b>{resumen.inundacion.sin_cobertura}</b>
            </span>
          </div>
          <AyudaLeyendaInundacion
            periodoRetornoAnios={territorio?.susceptibilidad?.periodoRetornoAnios ?? null}
          />
          <div className={styles.hint}>
            OS-Climate physrisk (Apache-2.0) · corrida{' '}
            {territorio?.susceptibilidad?.fechaCorrida}
          </div>
        </div>
      )}
    </div>
  )
}

function mensajeMotivo(motivo: string | undefined): string {
  switch (motivo) {
    case 'sin_geometria_importada':
      return 'La geometría de accesos no está importada para esta escuela.'
    case 'sin_conexion_red':
      return 'La escuela no conecta con la red vial OSM: no hay ruta calculada.'
    case 'ruta_degenerada':
      return 'La escuela está junto a la cabecera departamental: no hay ruta que dibujar.'
    default:
      return 'Sin geometría de acceso para esta escuela.'
  }
}

function BloqueRuta({
  seleccion,
  geometria,
  geometriaLoading,
  geometriaError,
  celdasExposicion,
  onEncuadrarRuta,
}: {
  seleccion: { nombre: string } | null
  geometria: GeometriaAccesoRespuesta | null
  geometriaLoading: boolean
  geometriaError: string | null
  celdasExposicion: GeoJSON.FeatureCollection<GeoJSON.Polygon> | null
  onEncuadrarRuta?: () => void
}) {
  const styles = useOverlayStyles()

  if (seleccion === null) {
    return (
      <div className={styles.legendItemStack} data-testid="leyenda-ruta">
        <div className={styles.hint} data-testid="leyenda-ruta-sin-seleccion">
          Seleccioná una escuela para ver su ruta de acceso OSM.
        </div>
      </div>
    )
  }

  if (geometriaLoading) {
    return (
      <div className={styles.legendItemStack} data-testid="leyenda-ruta">
        <div className={styles.hint} data-testid="leyenda-ruta-cargando">
          Cargando ruta de acceso…
        </div>
      </div>
    )
  }

  if (geometriaError !== null) {
    return (
      <div className={styles.legendItemStack} data-testid="leyenda-ruta">
        <div
          className={`${styles.hint} ${styles.statusError}`}
          role="alert"
          data-testid="leyenda-ruta-error"
        >
          {geometriaError}
        </div>
      </div>
    )
  }

  if (geometria === null || !geometria.disponible) {
    return (
      <div className={styles.legendItemStack} data-testid="leyenda-ruta">
        <div className={styles.hint} data-testid="leyenda-ruta-motivo">
          {mensajeMotivo(geometria?.motivo)}
        </div>
      </div>
    )
  }

  const resumenCruces = geometria.resumen ?? { puente: 0, vado: 0, sinEvidencia: 0 }
  const totalCruces = resumenCruces.puente + resumenCruces.vado + resumenCruces.sinEvidencia

  return (
    <div className={styles.legendItemStack} data-testid="leyenda-ruta">
      <div data-testid="leyenda-ruta-disponible">
        <b>Ruta de acceso OSM · {seleccion.nombre}</b>
        <div className={styles.legendItem}>
        <span className={styles.swatch} style={{ background: COLOR_RUTA_ACCESO }} />
        <span>Ruta usada en el cálculo</span>
      </div>
        {celdasExposicion && celdasExposicion.features.length > 0 && (
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: COLOR_CELDAS_EXPOSICION, opacity: OPACIDAD_CELDAS_EXPOSICION, border: `1px solid ${COLOR_CELDAS_EXPOSICION}` }} />
            <span>Celdas de ~1 km con inundación histórica estimada (no es el trazado de un río)</span>
          </div>
        )}
        {FILAS_CRUCES.map((fila) => (
          <FilaConIcono
            key={fila.clave}
            svg={fila.svg}
            etiqueta={ETIQUETAS_CRUCE[fila.clave]}
            conteo={resumenCruces[fila.campo]}
          />
        ))}
        {totalCruces === 0 && (
          <div className={styles.hint}>Sin cruces de agua en esta ruta</div>
        )}
        {onEncuadrarRuta && (
          <Button type="button" size="sm" variant="secondary" onClick={onEncuadrarRuta}>
            Encuadrar ruta
          </Button>
        )}
        {/* La explicación larga (qué punto de la red se usó, por qué "sin
            puente registrado" no confirma que falte, y el descargo de que es
            contexto) vive cerrada: con las tres capas prendidas la ruta es el
            bloque con más texto y lo visible tiene que seguir siendo corto. */}
        <details className="ayuda-leyenda" data-testid="leyenda-ruta-ayuda">
          <summary>Qué significa</summary>
          <div className={styles.hint}>
            La ruta une el punto de la red vial más cercano a la escuela con la
            cabecera departamental. Es la geometría que el cálculo usó: no se
            dibujan rectas ni atajos que no estén en el dato.
          </div>
          {totalCruces > 0 && (
            <div className={styles.hint}>
              Sin puente registrado no confirma que falte el puente: puede no estar cargado en
              OpenStreetMap.
            </div>
          )}
          <div className={styles.hint}>
            Contexto territorial derivado de OpenStreetMap: no es pronóstico ni estado confirmado
            del edificio.
          </div>
        </details>
        <div className={styles.hint}>
          © OpenStreetMap contributors (ODbL) · extracto {geometria.fechaExtractoOsm}
        </div>
      </div>
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
