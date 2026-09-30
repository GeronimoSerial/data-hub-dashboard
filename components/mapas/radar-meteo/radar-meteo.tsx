'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { ImageSource, Map as MapLibreMap, RasterLayerSpecification } from 'maplibre-gl'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { union } from '@turf/union'
import { useRadarMeteo, type RespuestaRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-radar-meteo'
import {
  colorGranizo,
  colorLluvia,
  colorProbabilidad,
  colorViento,
  indiceCercano,
  interpolarBilineal,
  pixelAGrilla,
  rellenarAnilloExterior,
  rgbaComoCss,
  rotacionFlecha,
  valoresEnGrilla,
} from './escalas'
import { LeyendaRadar } from './leyenda'
import { LineaTiempoRadar } from './linea-tiempo'
import { PopupRadar } from './popup'
import { SelectorRadar, type VariableRadarUI } from './selector'

const variablesSolicitadas = [
  'precipitation',
  'precipitation_probability',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'granizo',
] as never[]

const clavePorVariable: Record<VariableRadarUI, keyof RespuestaRadarMeteo['valores']> = {
  lluvia: 'precipitation',
  probabilidad: 'precipitation_probability',
  viento: 'wind_speed_10m',
  granizo: 'granizo',
}

const mapaVariable: Record<VariableRadarUI, (value: number | null) => readonly [number, number, number, number]> = {
  lluvia: colorLluvia,
  probabilidad: colorProbabilidad,
  viento: colorViento,
  granizo: colorLluvia,
}

const paintRaster: RasterLayerSpecification['paint'] = {
  'raster-opacity': 0.82,
  'raster-resampling': 'linear',
}

const tiemposVacios: string[] = []
const bboxMundial: number[][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]
const URL_DEPARTAMENTOS = '/data/departamentos-corrientes-georef-2026-09-27.geojson'

interface RasterFrame {
  image: string
  index: number
  time: string
}

function colorParaDebug(variable: VariableRadarUI, value: number | null): string {
  if (variable === 'granizo') {
    return colorGranizo(value)
  }

  return rgbaComoCss(mapaVariable[variable](value))
}

function crearRaster(
  data: RespuestaRadarMeteo,
  frame: number,
  variable: VariableRadarUI,
  paso: 1 | 3,
): string | null {
  const grid = data.grid
  if (!grid) {
    return null
  }

  const values = data.valores[clavePorVariable[variable]]?.[frame]
  if (!values) {
    return null
  }

  const ordered = valoresEnGrilla(grid, values)
  const padded = rellenarAnilloExterior(grid, ordered)
  const hourlyValues = variable === 'lluvia' && paso === 3
    ? padded.map((value) => value === null ? null : value / 3)
    : padded
  const width = 600
  const height = Math.max(300, Math.round(width * grid.filas / grid.columnas))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  const imageData = context.createImageData(width, height)
  const colorRamp = mapaVariable[variable]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const { fila, columna } = pixelAGrilla(x, y, width, height, grid.filas, grid.columnas)
      const value = interpolarBilineal(grid, hourlyValues, fila, columna)
      const pixel = (y * width + x) * 4
      if (variable === 'granizo') {
        const color = colorGranizo(value)
        if (color === 'transparent') {
          imageData.data[pixel + 3] = 0
          continue
        }

        const hex = color.slice(1)
        imageData.data[pixel] = Number.parseInt(hex.slice(0, 2), 16)
        imageData.data[pixel + 1] = Number.parseInt(hex.slice(2, 4), 16)
        imageData.data[pixel + 2] = Number.parseInt(hex.slice(4, 6), 16)
        imageData.data[pixel + 3] = 220
        continue
      }

      const color = colorRamp(value)
      if (color[3] === 0) {
        imageData.data[pixel + 3] = 0
        continue
      }

      imageData.data[pixel] = color[0]
      imageData.data[pixel + 1] = color[1]
      imageData.data[pixel + 2] = color[2]
      imageData.data[pixel + 3] = color[3]
    }
  }

  context.putImageData(imageData, 0, 0)
  const softened = document.createElement('canvas')
  softened.width = width
  softened.height = height
  const softContext = softened.getContext('2d')
  if (softContext) {
    softContext.filter = 'blur(1.5px)'
    softContext.drawImage(canvas, 0, 0)
    context.clearRect(0, 0, width, height)
    context.drawImage(softened, 0, 0)
  }

  return canvas.toDataURL('image/png')
}

function crearMascaraInversa(
  boundary: FeatureCollection<Polygon | MultiPolygon> | null,
): FeatureCollection<Polygon> | null {
  if (!boundary?.features.length) {
    return null
  }

  const province = union(boundary)
  if (!province) {
    return null
  }

  const geometry = province.geometry
  const exteriorRings = geometry.type === 'Polygon'
    ? [geometry.coordinates[0] as number[][]]
    : geometry.coordinates.map((polygon) => polygon[0] as number[][])
  const interior = exteriorRings.map((ring) => {
    let signedArea = 0
    for (let index = 0; index < ring.length - 1; index += 1) {
      signedArea += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]
    }

    return signedArea > 0 ? ring.slice().reverse() : ring
  })

  const mask: Feature<Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [bboxMundial as [number, number][], ...interior],
    },
  }

  return { type: 'FeatureCollection', features: [mask] }
}

function crearDebugPoints(data: RespuestaRadarMeteo, frame: number, variable: VariableRadarUI, paso: 1 | 3) {
  const grid = data.grid
  const values = data.valores[clavePorVariable[variable]]?.[frame]
  if (!grid || !values) {
    return null
  }

  const features = grid.celdas.flatMap((cell, index) => {
    const rawValue = values[index]
    const value = variable === 'lluvia' && paso === 3 && rawValue !== null && rawValue !== undefined
      ? rawValue / 3
      : rawValue ?? null
    const isVisible = variable === 'granizo'
      ? colorGranizo(value) !== 'transparent'
      : mapaVariable[variable](value)[3] > 0
    if (!isVisible) {
      return []
    }
    const color = colorParaDebug(variable, value)

    return [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [cell.lon, cell.lat] },
      properties: { color, id: cell.id, value },
    }]
  })

  return { type: 'FeatureCollection' as const, features }
}

function crearFlechasViento(data: RespuestaRadarMeteo, frame: number) {
  const grid = data.grid
  if (!grid) {
    return null
  }

  const features = grid.celdas.flatMap((cell, index) => {
    if (cell.fila % 3 !== 0 || cell.columna % 3 !== 0) {
      return []
    }

    const speed = data.valores.wind_speed_10m?.[frame]?.[index]
    const direction = data.valores.wind_direction_10m?.[frame]?.[index]
    if (speed === null || speed === undefined || direction === null || direction === undefined) {
      return []
    }

    return [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [cell.lon, cell.lat] },
      properties: { rotation: rotacionFlecha(direction), speed },
    }]
  })

  return { type: 'FeatureCollection' as const, features }
}

export function RadarMeteo({ activo }: { activo: boolean }) {
  const [variable, setVariable] = useState<VariableRadarUI>('lluvia')
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<1 | 2 | 4>(1)
  const [paso, setPaso] = useState<1 | 3>(3)
  const [point, setPoint] = useState<number | null>(null)
  const [retry, setRetry] = useState(0)
  const [rasterFrame, setRasterFrame] = useState<RasterFrame | null>(null)
  const [boundary, setBoundary] = useState<FeatureCollection<Polygon | MultiPolygon> | null>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const animationFrame = useRef<number | null>(null)
  const { data, loading, error } = useRadarMeteo({
    activo,
    variables: variablesSolicitadas,
    paso,
    refreshKey: retry,
  })

  const times = data?.tiempos ?? tiemposVacios
  const raster = useMemo(() => {
    if (!data || data.sinDatos || typeof document === 'undefined') {
      return null
    }

    return crearRaster(data, frame, variable, paso)
  }, [data, frame, variable, paso])
  const rainUnderlay = useMemo(() => {
    if (!data || variable !== 'granizo' || typeof document === 'undefined') {
      return null
    }

    return crearRaster(data, frame, 'lluvia', paso)
  }, [data, frame, variable, paso])
  const imageCoordinates = useMemo(() => {
    const grid = data?.grid
    if (!grid) {
      return null
    }

    const latitudes = grid.celdas.map((cell) => cell.lat)
    const longitudes = grid.celdas.map((cell) => cell.lon)
    const north = Math.max(...latitudes)
    const south = Math.min(...latitudes)
    const west = Math.min(...longitudes)
    const east = Math.max(...longitudes)
    return [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ] as [[number, number], [number, number], [number, number], [number, number]]
  }, [data?.grid])
  const inverseMask = useMemo(() => crearMascaraInversa(boundary), [boundary])
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('radarDebug') === '1'
  const debugPoints = useMemo(() => {
    if (!debug || !data) {
      return null
    }

    return crearDebugPoints(data, frame, variable, paso)
  }, [data, debug, frame, variable, paso])
  const windFeatures = useMemo(() => {
    if (!data || variable !== 'viento') {
      return null
    }

    return crearFlechasViento(data, frame)
  }, [data, frame, variable])

  useEffect(() => {
    if (times.length) {
      queueMicrotask(() => setFrame(indiceCercano(times)))
    }
  }, [data?.runId, times])

  useEffect(() => {
    if (!playing || times.length < 2) {
      return
    }

    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % times.length)
    }, 1000 / speed)
    return () => window.clearInterval(timer)
  }, [playing, speed, times.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        setPlaying((current) => !current)
      }
      if (event.key === 'ArrowRight') {
        setFrame((current) => Math.min(times.length - 1, current + 1))
      }
      if (event.key === 'ArrowLeft') {
        setFrame((current) => Math.max(0, current - 1))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [times.length])

  useEffect(() => {
    if (!activo) {
      return
    }

    let cancelled = false
    fetch(URL_DEPARTAMENTOS)
      .then((response) => response.json())
      .then((geojson: FeatureCollection<Polygon | MultiPolygon>) => {
        if (!cancelled) {
          setBoundary(geojson)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [activo])

  useEffect(() => {
    const onMapReady = (event: Event) => {
      const readyMap = (event as CustomEvent<MapLibreMap | null>).detail
      setMap(readyMap)
      if (debug && typeof window !== 'undefined') {
        const debugWindow = window as Window & { __radarDebugMap?: MapLibreMap }
        debugWindow.__radarDebugMap = readyMap ?? undefined
      }
    }

    window.addEventListener('radar-meteo-map-ready', onMapReady)
    return () => window.removeEventListener('radar-meteo-map-ready', onMapReady)
  }, [debug])

  useEffect(() => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current)
    }

    animationFrame.current = requestAnimationFrame(() => {
      if (!raster || !times[frame]) {
        setRasterFrame(null)
        return
      }

      setRasterFrame({ image: raster, index: frame, time: times[frame] })
    })

    return () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current)
      }
    }
  }, [raster, frame, times])

  useEffect(() => {
    if (!map || !rasterFrame || !imageCoordinates) {
      return
    }

    const source = map.getSource('radar-meteo-image') as ImageSource | undefined
    if (source) {
      source.updateImage({ url: rasterFrame.image, coordinates: imageCoordinates })
      map.triggerRepaint()
    }
  }, [map, rasterFrame, imageCoordinates])

  useEffect(() => {
    if (!map || !rainUnderlay || !imageCoordinates) {
      return
    }

    const source = map.getSource('radar-meteo-rain-underlay') as ImageSource | undefined
    if (source) {
      source.updateImage({ url: rainUnderlay, coordinates: imageCoordinates })
      map.triggerRepaint()
    }
  }, [map, rainUnderlay, imageCoordinates])

  const onMapClick = useCallback((event: Event) => {
    const { lat, lng } = (event as CustomEvent<{ lat: number; lng: number }>).detail
    if (!data?.grid) {
      return
    }

    let closestIndex = -1
    let closestDistance = Infinity
    data.grid.celdas.forEach((cell, index) => {
      const distance = (cell.lat - lat) ** 2 + (cell.lon - lng) ** 2
      if (distance < closestDistance) {
        closestIndex = index
        closestDistance = distance
      }
    })
    setPoint(closestIndex >= 0 ? closestIndex : null)
  }, [data])

  useEffect(() => {
    if (!activo) {
      return
    }

    window.addEventListener('radar-meteo-map-click', onMapClick)
    return () => window.removeEventListener('radar-meteo-map-click', onMapClick)
  }, [activo, onMapClick])

  if (!activo) {
    return null
  }

  const frameTime = times[frame] ?? ''
  const debugFrameMatches = rasterFrame?.index === frame && rasterFrame.time === frameTime

  return (
    <>
      {variable === 'granizo' && rainUnderlay && imageCoordinates && (
        <Source id="radar-meteo-rain-underlay" type="image" url={rainUnderlay} coordinates={imageCoordinates}>
          <Layer
            id="radar-meteo-rain-base"
            type="raster"
            paint={{ ...paintRaster, 'raster-opacity': 0.25 }}
            beforeId={inverseMask ? 'radar-meteo-inverse-mask' : 'infra-departamentos-borde'}
          />
        </Source>
      )}
      {rasterFrame && imageCoordinates && (
        <Source id="radar-meteo-image" type="image" url={rasterFrame.image} coordinates={imageCoordinates}>
          <Layer
            id="radar-meteo-raster"
            type="raster"
            paint={paintRaster}
            beforeId={inverseMask ? 'radar-meteo-inverse-mask' : 'infra-departamentos-borde'}
          />
        </Source>
      )}
      {inverseMask && (
        <Source id="radar-meteo-inverse-mask-source" type="geojson" data={inverseMask}>
          <Layer
            id="radar-meteo-inverse-mask"
            type="fill"
            paint={{ 'fill-color': '#020811', 'fill-opacity': 1 }}
            beforeId="infra-departamentos-borde"
          />
        </Source>
      )}
      {debugPoints && (
        <Source id="radar-meteo-debug-points" type="geojson" data={debugPoints}>
          <Layer
            id="radar-meteo-debug-cells"
            type="circle"
            paint={{
              'circle-color': ['get', 'color'],
              'circle-radius': 4,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1,
            }}
            beforeId="infra-departamentos-etiqueta"
          />
        </Source>
      )}
      {windFeatures && (
        <Source id="radar-meteo-wind" type="geojson" data={windFeatures}>
          <Layer
            id="radar-meteo-wind-arrows"
            type="symbol"
            layout={{
              'text-field': '↑',
              'text-size': ['interpolate', ['linear'], ['get', 'speed'], 0, 18, 60, 26],
              'text-rotate': ['get', 'rotation'],
              'text-rotation-alignment': 'map',
              'text-allow-overlap': true,
            }}
            paint={{
              'text-color': ['interpolate', ['linear'], ['get', 'speed'], 0, '#e9fbff', 30, '#f9cb6d', 60, '#ff8a78'],
              'text-halo-color': '#0b1724',
              'text-halo-width': 0.75,
            }}
            beforeId="infra-departamentos-etiqueta"
          />
        </Source>
      )}

      <SelectorRadar value={variable} onChange={setVariable}>
        {variable === 'granizo' && (
          <small title="Estimación no calibrada basada en variables de pronóstico y códigos meteorológicos.">
            ⓘ Estimación no calibrada
          </small>
        )}
        {loading && <div className="radar-meteo-loading" role="status">Cargando pronóstico…</div>}
        {loading && <div className="radar-meteo-skeleton" aria-hidden="true" />}
        {error && (
          <div className="radar-meteo-empty" role="alert">
            {error}
            <button type="button" onClick={() => setRetry((value) => value + 1)}>Reintentar</button>
          </div>
        )}
        {data?.sinDatos && (
          <div className="radar-meteo-empty" role="status">
            {data.razon ?? 'No hay pronóstico disponible.'}
          </div>
        )}
      </SelectorRadar>

      {debug && (
        <output className="radar-meteo-debug-readout" data-frame-matches={debugFrameMatches}>
          API {frame}/{frameTime} · raster {rasterFrame?.index ?? '—'}/{rasterFrame?.time ?? '—'}
        </output>
      )}

      {point !== null && data && (
        <PopupRadar data={data} frame={frame} index={point} paso={paso} onClose={() => setPoint(null)} />
      )}

      <LeyendaRadar
        variable={variable}
        minutos={data?.frescura?.edadMinutos}
        desactualizado={data?.frescura?.desactualizado}
      />
      <LineaTiempoRadar
        times={times}
        frame={frame}
        playing={playing}
        speed={speed}
        paso={paso}
        onFrameChange={setFrame}
        onPlayingChange={setPlaying}
        onSpeedChange={setSpeed}
        onPasoChange={setPaso}
      />
    </>
  )
}
