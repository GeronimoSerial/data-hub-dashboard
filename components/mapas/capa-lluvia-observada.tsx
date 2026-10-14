'use client'

import { useEffect, useMemo, useState } from 'react'
import { Layer, Popup, Source, useMap } from 'react-map-gl/maplibre'
import { formatearFechaLocal } from '@/components/mapas/capa-estaciones-rio'

export type HorasLluvia = 24 | 72

export type MetaLluviaObservada = { hasta: string | null; horas: HorasLluvia; parciales: number }

type PropiedadesCelda = { geometryRef: string; acumuladoMm: number; granulos: number; esperados: number; cobertura: number; parcial: boolean }

type CeldaLluvia = {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: number[][][] }
  properties: PropiedadesCelda
}

type RespuestaLluvia = { desde: string | null; hasta: string | null; features: CeldaLluvia[] }

type Esquinas = [[number, number], [number, number], [number, number], [number, number]]

export type GrillaLluvia = {
  ancho: number
  alto: number
  datos: Uint8ClampedArray
  coordenadas: Esquinas | null
}

export const CLASES_LLUVIA: ReadonlyArray<{ desde: number; color: string; etiqueta: string }> = [
  { desde: 1, color: '#dbeafe', etiqueta: '1–10 mm' },
  { desde: 10, color: '#93c5fd', etiqueta: '10–25 mm' },
  { desde: 25, color: '#60a5fa', etiqueta: '25–50 mm' },
  { desde: 50, color: '#3b82f6', etiqueta: '50–100 mm' },
  { desde: 100, color: '#1d4ed8', etiqueta: '100–150 mm' },
  { desde: 150, color: '#1e3a8a', etiqueta: '150 mm o más' },
]

const PASO_CELDA = 0.1
const MEDIO_PASO = PASO_CELDA / 2
const ALFA_BASE = 0.75 * 255
const REGIONES_INTERES: ReadonlyArray<{ lon: [number, number]; lat: [number, number] }> = [
  { lon: [-59.8, -55.6], lat: [-30.8, -27.2] },
  { lon: [-56.1, -53.6], lat: [-28.2, -25.4] },
]
const ANCHO_TRANSICION = 0.4

const ID_HIT = 'lluvia-observada-hit'

/** 1 dentro de las regiones de interés; cae linealmente a 0 a 0,4° fuera de ellas. */
function factorRegion(lon: number, lat: number): number {
  let mejor = 0
  for (const region of REGIONES_INTERES) {
    const dx = Math.max(region.lon[0] - lon, 0, lon - region.lon[1])
    const dy = Math.max(region.lat[0] - lat, 0, lat - region.lat[1])
    const distancia = Math.hypot(dx, dy)
    mejor = Math.max(mejor, Math.min(1, Math.max(0, 1 - distancia / ANCHO_TRANSICION)))
  }
  return mejor
}

function claseDe(mm: number): (typeof CLASES_LLUVIA)[number] | null {
  let clase: (typeof CLASES_LLUVIA)[number] | null = null
  for (const candidata of CLASES_LLUVIA) if (mm >= candidata.desde) clase = candidata
  return clase
}

function colorRgb(color: string): [number, number, number] {
  const numero = parseInt(color.slice(1), 16)
  return [(numero >> 16) & 255, (numero >> 8) & 255, numero & 255]
}

function centroDe(geometryRef: string): [number, number] | null {
  const [latTexto, lonTexto] = geometryRef.split('_')
  const lat = Number(latTexto)
  const lon = Number(lonTexto)
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null
}

/**
 * Convierte celdas de 0,1° en un buffer RGBA de un píxel por celda (fila 0 = norte).
 * Las esquinas son los bordes exteriores de las celdas extremas.
 */
export function pintarGrillaLluvia(celdas: ReadonlyArray<{ geometryRef: string; acumuladoMm: number }>): GrillaLluvia {
  const centros = celdas.flatMap((celda) => {
    const centro = centroDe(celda.geometryRef)
    return centro ? [{ lon: centro[0], lat: centro[1], mm: celda.acumuladoMm }] : []
  })
  if (centros.length === 0) return { ancho: 0, alto: 0, datos: new Uint8ClampedArray(0), coordenadas: null }

  const lonMin = Math.min(...centros.map((c) => c.lon))
  const lonMax = Math.max(...centros.map((c) => c.lon))
  const latMin = Math.min(...centros.map((c) => c.lat))
  const latMax = Math.max(...centros.map((c) => c.lat))
  const ancho = Math.round((lonMax - lonMin) / PASO_CELDA) + 1
  const alto = Math.round((latMax - latMin) / PASO_CELDA) + 1
  const datos = new Uint8ClampedArray(ancho * alto * 4)

  for (const celda of centros) {
    const clase = celda.mm >= 1 ? claseDe(celda.mm) : null
    if (!clase) continue
    const columna = Math.round((celda.lon - lonMin) / PASO_CELDA)
    const fila = Math.round((latMax - celda.lat) / PASO_CELDA)
    const alfa = Math.round(ALFA_BASE * factorRegion(celda.lon, celda.lat))
    const indice = (fila * ancho + columna) * 4
    const [r, g, b] = colorRgb(clase.color)
    datos[indice] = r
    datos[indice + 1] = g
    datos[indice + 2] = b
    datos[indice + 3] = alfa
  }

  const coordenadas: Esquinas = [
      [lonMin - MEDIO_PASO, latMax + MEDIO_PASO],
      [lonMax + MEDIO_PASO, latMax + MEDIO_PASO],
      [lonMax + MEDIO_PASO, latMin - MEDIO_PASO],
      [lonMin - MEDIO_PASO, latMin - MEDIO_PASO],
  ]
  return { ancho, alto, datos, coordenadas }
}

function urlDeGrilla(grilla: GrillaLluvia): string | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = grilla.ancho
    canvas.height = grilla.alto
    const contexto = canvas.getContext('2d')
    if (!contexto) return null
    const imagen = contexto.createImageData(grilla.ancho, grilla.alto)
    imagen.data.set(grilla.datos)
    contexto.putImageData(imagen, 0, 0)
    return canvas.toDataURL()
  } catch {
    return null
  }
}

function formatoMm(valor: number): string {
  return `${valor.toFixed(1).replace('.', ',')} mm`
}

type ClicLluvia = { lon: number; lat: number; propiedades: PropiedadesCelda }

export function CapaLluviaObservada({
  visible,
  horas,
  onMeta,
}: {
  visible: boolean
  horas: HorasLluvia
  onMeta?: (meta: MetaLluviaObservada) => void
}) {
  if (!visible) return null
  return <CapaLluviaObservadaActiva horas={horas} onMeta={onMeta} />
}

function CapaLluviaObservadaActiva({
  horas,
  onMeta,
}: {
  horas: HorasLluvia
  onMeta?: (meta: MetaLluviaObservada) => void
}) {
  const [respuesta, setRespuesta] = useState<RespuestaLluvia | null>(null)
  const [clic, setClic] = useState<ClicLluvia | null>(null)
  const { current: mapa } = useMap()

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/infraestructura/peligro/observado-grilla?horas=${horas}`, { signal: controller.signal })
      .then((respuestaHttp) => (respuestaHttp.ok ? respuestaHttp.json() : Promise.reject(new Error('observado-grilla'))))
      .then((cuerpo: { desde?: unknown; hasta?: unknown; geojson?: { features?: unknown } }) => {
        if (!Array.isArray(cuerpo?.geojson?.features)) return
        const features = cuerpo.geojson.features as CeldaLluvia[]
        const hasta = typeof cuerpo.hasta === 'string' ? cuerpo.hasta : null
        setRespuesta({ desde: typeof cuerpo.desde === 'string' ? cuerpo.desde : null, hasta, features })
        onMeta?.({ hasta, horas, parciales: features.filter((feature) => feature.properties?.parcial === true).length })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [horas, onMeta])

  const grilla = useMemo(
    () => (respuesta ? pintarGrillaLluvia(respuesta.features.map((feature) => feature.properties)) : null),
    [respuesta],
  )

  const dataUrl = useMemo(() => (grilla && grilla.ancho > 0 ? urlDeGrilla(grilla) : null), [grilla])

  useEffect(() => {
    if (!mapa) return
    const alEntrar = () => {
      mapa.getCanvas().style.cursor = 'pointer'
    }
    const alSalir = () => {
      mapa.getCanvas().style.cursor = ''
    }
    const alHacerClic = (evento: { lngLat: { lng: number; lat: number }; features?: Array<{ properties: unknown }> }) => {
      const propiedades = evento.features?.[0]?.properties as PropiedadesCelda | undefined
      if (!propiedades) return
      setClic({ lon: evento.lngLat.lng, lat: evento.lngLat.lat, propiedades })
    }
    mapa.on('mouseenter', ID_HIT, alEntrar)
    mapa.on('mouseleave', ID_HIT, alSalir)
    mapa.on('click', ID_HIT, alHacerClic)
    return () => {
      mapa.off('mouseenter', ID_HIT, alEntrar)
      mapa.off('mouseleave', ID_HIT, alSalir)
      mapa.off('click', ID_HIT, alHacerClic)
    }
  }, [mapa])

  if (respuesta === null) return null

  const datosHit = { type: 'FeatureCollection' as const, features: respuesta.features }

  return (
    <>
      {dataUrl && grilla?.coordenadas && (
        <Source id="lluvia-observada-src" type="image" url={dataUrl} coordinates={grilla.coordenadas}>
          <Layer
            id="lluvia-observada-raster"
            type="raster"
            paint={{ 'raster-opacity': 0.65, 'raster-resampling': 'linear', 'raster-fade-duration': 0 }}
          />
        </Source>
      )}
      <Source id="lluvia-observada-hit-src" type="geojson" data={datosHit as never}>
        <Layer id={ID_HIT} type="fill" paint={{ 'fill-opacity': 0 }} />
      </Source>
      {clic && (
        <Popup longitude={clic.lon} latitude={clic.lat} anchor="bottom" onClose={() => setClic(null)} closeOnClick={false}>
          <div className="map-popup">
            <p className="map-popup-title">Lluvia observada {horas} h: {formatoMm(clic.propiedades.acumuladoMm)}</p>
            {respuesta.desde && respuesta.hasta && (
              <p className="map-popup-row">
                Ventana: {formatearFechaLocal(respuesta.desde)}–{formatearFechaLocal(respuesta.hasta)}
              </p>
            )}
            {clic.propiedades.parcial && (
              <p className="map-popup-row">
                Ventana incompleta: {clic.propiedades.granulos}/{clic.propiedades.esperados} gránulos (cobertura{' '}
                {Math.round(clic.propiedades.cobertura)} %) — el valor puede subestimar la lluvia.
              </p>
            )}
          </div>
        </Popup>
      )}
    </>
  )
}
