'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import MapGL, { Layer, NavigationControl, Source, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre'
import type { Map as MaplibreMap, PaddingOptions, SymbolLayerSpecification } from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { useDatasetReorganizacion } from '@/components/mapas/reorganizacion/use-dataset-reorganizacion'
import { Button } from '@/components/ui/button'
import { BASEMAPS } from '@/lib/map-types'
import { ensureMapWorker } from '@/lib/map-worker'
import {
  DEPARTAMENTOS_URL,
  LIMITES_CORRIENTES,
  MASCARA_URL,
  fillPaintMascara,
  linePaintDepartamentos,
} from '@/lib/mapas/departamentos'

ensureMapWorker()

const CAPA_MASCARA_ID = 'reorganizacion-mascara'
const CAPA_DEPARTAMENTOS_BORDE_ID = 'reorganizacion-departamentos-borde'
const CAPA_DEPARTAMENTOS_NOMBRES_ID = 'reorganizacion-departamentos-nombres'

// Mismo margen que natalidad (24 px) alrededor de la provincia; el panel de
// escritorio suma su ancho vía `paddingEncuadre.left`.
const MARGEN_ENCUADRE = 24
// Breakpoint del panel lateral: el mismo que usa el mapa de infraestructura.
const CONSULTA_ESCRITORIO = '(min-width: 1080px)'
const ANCHO_PANEL_ESCRITORIO = 392

const LAYOUT_NOMBRES_DEPARTAMENTOS: SymbolLayerSpecification['layout'] = {
  'text-field': ['get', 'nombre'],
  'text-size': 12,
  'text-font': ['Noto Sans Regular'],
  'text-allow-overlap': false,
}

const PAINT_NOMBRES_DEPARTAMENTOS: SymbolLayerSpecification['paint'] = {
  'text-color': '#1f2937',
  'text-halo-color': '#ffffff',
  'text-halo-width': 1.5,
}

export interface PaddingEncuadre {
  left: number
  top?: number
  right?: number
  bottom?: number
}

interface PropiedadesDepartamento {
  nombre: string
  centroide?: { lon: number; lat: number }
}

interface MapReorganizacionPageProps {
  /** Pestaña del mapa activa. El mapa no se desmonta al ocultarse; con `false` no se reencuadra ni se redibuja. */
  visible?: boolean
  /** Espacio ocupado por el panel de escritorio, para que el encuadre no quede tapado. */
  paddingEncuadre?: PaddingEncuadre
  /** Capas y fuentes adicionales, renderizadas dentro del mapa. */
  children?: ReactNode
  /** Recibe la instancia de MapLibre una vez cargado el estilo. */
  onMapLoad?: (mapa: MaplibreMap) => void
  /** Panel lateral (indicadores, filtros, listado). Móvil: se apila debajo del mapa. */
  panel?: ReactNode
  /** Capas que responden a clics y hover (puntero). Sin lista, el mapa no cambia de comportamiento. */
  interactiveLayerIds?: string[]
  onMapClick?: (e: MapLayerMouseEvent) => void
  /** URL del estilo base. Sin valor, usa el fondo vial por defecto. */
  mapStyle?: string
}

function paddingDesde(encuadre?: PaddingEncuadre): PaddingOptions {
  return {
    top: MARGEN_ENCUADRE + (encuadre?.top ?? 0),
    right: MARGEN_ENCUADRE + (encuadre?.right ?? 0),
    bottom: MARGEN_ENCUADRE + (encuadre?.bottom ?? 0),
    left: MARGEN_ENCUADRE + (encuadre?.left ?? 0),
  }
}

function etiquetasDepartamentos(
  geojson: FeatureCollection<Geometry, PropiedadesDepartamento>,
): FeatureCollection<Point, { nombre: string }> {
  const features: Feature<Point, { nombre: string }>[] = []
  for (const feature of geojson.features) {
    const centroide = feature.properties.centroide
    if (!centroide) continue
    features.push({
      type: 'Feature',
      properties: { nombre: feature.properties.nombre },
      geometry: { type: 'Point', coordinates: [centroide.lon, centroide.lat] },
    })
  }
  return { type: 'FeatureCollection', features }
}

function useEsEscritorio(): boolean {
  const [escritorio, setEscritorio] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia(CONSULTA_ESCRITORIO)
    const actualizar = () => setEscritorio(consulta.matches)
    actualizar()
    consulta.addEventListener('change', actualizar)
    return () => consulta.removeEventListener('change', actualizar)
  }, [])
  return escritorio
}

export default function MapReorganizacionPage({
  visible = true,
  paddingEncuadre,
  children,
  onMapLoad,
  panel,
  interactiveLayerIds,
  onMapClick,
  mapStyle = BASEMAPS.voyager.styleUrl,
}: MapReorganizacionPageProps) {
  const styles = useOverlayStyles()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const idPanel = useId()
  const escritorio = useEsEscritorio()
  const dataset = useDatasetReorganizacion()

  const padding = paddingDesde(paddingEncuadre)
  const paddingRef = useRef(padding)
  useEffect(() => {
    paddingRef.current = padding
  })

  const [etiquetas, setEtiquetas] = useState<FeatureCollection<Point, { nombre: string }> | null>(null)
  const [panelAbierto, setPanelAbierto] = useState(true)
  const [cursor, setCursor] = useState<'pointer' | undefined>(undefined)

  // MapLibre sólo devuelve `features` para las capas de `interactiveLayerIds`.
  function handleMouseMove(e: MapLayerMouseEvent) {
    setCursor(e.features && e.features.length > 0 ? 'pointer' : undefined)
  }
  // Ver handleLoad y el efecto de `visible`: sólo un encuadre hecho con el
  // contenedor en tamaño real (no display:none) cuenta como válido.
  const fitValidoRef = useRef(false)

  useEffect(() => {
    const controlador = new AbortController()
    fetch(DEPARTAMENTOS_URL, { signal: controlador.signal })
      .then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar la geometría departamental')
        return r.json() as Promise<FeatureCollection<Geometry, PropiedadesDepartamento>>
      })
      .then((geojson) => setEtiquetas(etiquetasDepartamentos(geojson)))
      .catch(() => undefined)
    return () => controlador.abort()
  }, [])

  // Mismo criterio que natalidad: `initialViewState` sólo mira el tamaño del
  // contenedor al construir el mapa, así que el encuadre definitivo se hace
  // al cargar el estilo.
  function handleLoad() {
    const mapa = mapRef.current?.getMap()
    if (!mapa) return
    mapa.resize()
    mapa.fitBounds(LIMITES_CORRIENTES, { padding: paddingRef.current, duration: 0 })
    fitValidoRef.current = visible
    onMapLoad?.(mapa)
  }

  // Al ocultarse se cortan transiciones de cámara en curso. Al mostrarse se
  // revisa el tamaño y sólo se reencuadra si el primer encuadre nunca fue
  // válido: volver de otra vista no reinicia el encuadre del usuario.
  useEffect(() => {
    const mapa = mapRef.current?.getMap()
    if (!mapa) return
    if (visible) {
      mapa.resize()
      if (!fitValidoRef.current) {
        mapa.fitBounds(LIMITES_CORRIENTES, { padding: paddingRef.current, duration: 0 })
        fitValidoRef.current = true
      }
    } else {
      mapa.stop()
    }
  }, [visible])

  // El contenedor cambia de tamaño al plegar el panel o cruzar el breakpoint.
  useEffect(() => {
    if (!visible) return
    mapRef.current?.getMap().resize()
  }, [panelAbierto, escritorio, visible])

  function volverAProvincia() {
    mapRef.current?.getMap().fitBounds(LIMITES_CORRIENTES, { padding: paddingRef.current, duration: 400 })
  }

  const hayPanel = panel !== undefined && panel !== null && panel !== false

  const shellStyle = escritorio
    ? { display: 'flex', width: '100%', height: '100%', minHeight: 0 }
    : { display: 'flex', flexDirection: 'column' as const, width: '100%', height: 'auto', minHeight: 0 }

  const columnaMapaStyle = escritorio
    ? { position: 'relative' as const, flex: '1 1 auto', minWidth: 0, minHeight: 0 }
    : { position: 'relative' as const, width: '100%', height: 'min(62dvh, 620px)', minHeight: 320 }

  const panelStyle = escritorio
    ? { flex: `0 0 ${ANCHO_PANEL_ESCRITORIO}px`, width: ANCHO_PANEL_ESCRITORIO, minHeight: 0, overflow: 'hidden' as const }
    : { width: '100%', minWidth: 0 }

  const mensajeEstado = dataset.estado === 'cargando'
    ? 'Cargando datos del mapa…'
    : dataset.estado === 'listo'
      ? null
      : dataset.mensaje

  return (
    <div className={styles.shell} ref={shellRef} style={shellStyle}>
      <div style={columnaMapaStyle}>
        <div className={styles.mapRoot}>
          <MapGL
            ref={mapRef}
            mapStyle={mapStyle}
            initialViewState={{ bounds: LIMITES_CORRIENTES, fitBoundsOptions: { padding: MARGEN_ENCUADRE } }}
            style={{ width: '100%', height: '100%' }}
            onLoad={handleLoad}
            interactiveLayerIds={interactiveLayerIds}
            onClick={onMapClick}
            onMouseMove={interactiveLayerIds ? handleMouseMove : undefined}
            cursor={cursor}
          >
            <NavigationControl position="top-left" />

            <Source id="reorganizacion-mascara-src" type="geojson" data={MASCARA_URL}>
              <Layer id={CAPA_MASCARA_ID} type="fill" paint={fillPaintMascara()} />
            </Source>

            <Source id="reorganizacion-departamentos-src" type="geojson" data={DEPARTAMENTOS_URL}>
              <Layer id={CAPA_DEPARTAMENTOS_BORDE_ID} type="line" paint={linePaintDepartamentos()} />
            </Source>

            {etiquetas && (
              <Source id="reorganizacion-departamentos-nombres-src" type="geojson" data={etiquetas}>
                <Layer
                  id={CAPA_DEPARTAMENTOS_NOMBRES_ID}
                  type="symbol"
                  layout={LAYOUT_NOMBRES_DEPARTAMENTOS}
                  paint={PAINT_NOMBRES_DEPARTAMENTOS}
                />
              </Source>
            )}

            {children}
          </MapGL>

          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 10,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              gap: 8,
              maxWidth: 'calc(100% - 24px)',
            }}
          >
            <Button variant="secondary" size="sm" style={{ minHeight: 44 }} onClick={volverAProvincia}>
              Volver a Corrientes
            </Button>
            {hayPanel && (
              <Button
                variant="secondary"
                size="sm"
                style={{ minHeight: 44 }}
                aria-expanded={panelAbierto}
                aria-controls={idPanel}
                onClick={() => setPanelAbierto((abierto) => !abierto)}
              >
                {panelAbierto ? 'Ocultar panel' : 'Mostrar panel'}
              </Button>
            )}
          </div>

          {mensajeEstado && (
            <div
              role={dataset.estado === 'cargando' ? 'status' : 'alert'}
              className={styles.popup}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 12,
                maxWidth: 'calc(100% - 32px)',
                textAlign: 'center',
              }}
            >
              <p className={dataset.estado === 'error' || dataset.estado === 'sin_permiso' ? styles.statusError : undefined}>
                {mensajeEstado}
              </p>
              {dataset.estado === 'error' && (
                <Button variant="secondary" size="sm" style={{ minHeight: 44 }} onClick={dataset.reintentar}>
                  Reintentar
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {hayPanel && (
        <aside id={idPanel} aria-label="Panel del mapa" hidden={!panelAbierto} style={panelStyle}>
          {panel}
        </aside>
      )}

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
