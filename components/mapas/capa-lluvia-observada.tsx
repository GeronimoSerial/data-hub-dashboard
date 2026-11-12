'use client'

import { useEffect, useMemo, useState } from 'react'
import { Layer, Popup, Source, useMap } from 'react-map-gl/maplibre'
import { formatearFechaLocal } from '@/components/mapas/capa-estaciones-rio'
import { LogoNasa } from '@/components/mapas/logo-nasa'
import { haceCuanto } from '@/components/mapas/tarjeta-estacion-rio'
import { regionPublicaActual } from '@/lib/infraestructura/region/publica'

export type HorasLluvia = 24 | 72

export type MetaLluviaObservada = {
  hasta: string | null
  horas: HorasLluvia
  parciales: number
  /** The API flags grids older than its freshness limit; the legend labels them as outdated. */
  vencida: boolean
}

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

// Multi-hue sequential ramp (cyan → blue → violet → magenta) with monotone OKLCH
// lightness 0.90 → 0.35, so neighbouring classes differ in both hue and lightness.
export const CLASES_LLUVIA: ReadonlyArray<{ desde: number; color: string; etiqueta: string }> = [
  { desde: 1, color: '#aaeafe', etiqueta: '1–10 mm' },
  { desde: 10, color: '#61c3f9', etiqueta: '10–25 mm' },
  { desde: 25, color: '#388cf0', etiqueta: '25–50 mm' },
  { desde: 50, color: '#634cd4', etiqueta: '50–100 mm' },
  { desde: 100, color: '#8a0193', etiqueta: '100–150 mm' },
  { desde: 150, color: '#700046', etiqueta: '150 mm o más' },
]

const PASO_CELDA = 0.1
const MEDIO_PASO = PASO_CELDA / 2
const ALFA_BASE = 0.75 * 255
const REGIONES_INTERES = regionPublicaActual().regionesInteresLluvia
const ANCHO_TRANSICION = 0.4

// Exported so other map handlers can read the cell under a click (e.g. the water crossing card).
export const ID_CAPA_LLUVIA_HIT = 'lluvia-observada-hit'
const ID_HIT = ID_CAPA_LLUVIA_HIT

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

type ClicLluvia = { lon: number; lat: number; propiedades: PropiedadesCelda }

export function CapaLluviaObservada({
  visible,
  horas,
  onMeta,
  beforeId,
  sinPopup = false,
}: {
  visible: boolean
  horas: HorasLluvia
  onMeta?: (meta: MetaLluviaObservada) => void
  beforeId?: string
  // In radar mode a map click belongs to the point forecast: the observed-rain layer
  // stays visible (with its legend) but does not open its own popup.
  sinPopup?: boolean
}) {
  if (!visible) return null
  return <CapaLluviaObservadaActiva horas={horas} onMeta={onMeta} beforeId={beforeId} sinPopup={sinPopup} />
}

function CapaLluviaObservadaActiva({
  horas,
  onMeta,
  beforeId,
  sinPopup,
}: {
  horas: HorasLluvia
  onMeta?: (meta: MetaLluviaObservada) => void
  beforeId?: string
  sinPopup: boolean
}) {
  const [respuesta, setRespuesta] = useState<RespuestaLluvia | null>(null)
  const [clic, setClic] = useState<ClicLluvia | null>(null)
  const { current: mapa } = useMap()

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/infraestructura/peligro/observado-grilla?horas=${horas}`, { signal: controller.signal })
      .then((respuestaHttp) => (respuestaHttp.ok ? respuestaHttp.json() : Promise.reject(new Error('observado-grilla'))))
      .then((cuerpo: { desde?: unknown; hasta?: unknown; vencida?: unknown; geojson?: { features?: unknown } }) => {
        if (!Array.isArray(cuerpo?.geojson?.features)) return
        const features = cuerpo.geojson.features as CeldaLluvia[]
        const hasta = typeof cuerpo.hasta === 'string' ? cuerpo.hasta : null
        setRespuesta({ desde: typeof cuerpo.desde === 'string' ? cuerpo.desde : null, hasta, features })
        onMeta?.({
          hasta,
          horas,
          parciales: features.filter((feature) => feature.properties?.parcial === true).length,
          // Missing flag (older API) counts as outdated: never present unknown freshness as current.
          vencida: cuerpo.vencida !== false,
        })
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
    // The rain covers the whole province: no pointer cursor (it would make every
    // spot look clickable), and a click over a point marker (school, station,
    // event) belongs to that marker, not to the rain cell under it.
    const alHacerClic = (evento: {
      point: { x: number; y: number }
      lngLat: { lng: number; lat: number }
      features?: Array<{ properties: unknown }>
    }) => {
      const propiedades = evento.features?.[0]?.properties as PropiedadesCelda | undefined
      if (!propiedades) return
      const marcadores = mapa
        .queryRenderedFeatures([evento.point.x, evento.point.y])
        .filter((feature) => feature.layer.type === 'symbol' || feature.layer.type === 'circle')
      if (marcadores.length > 0) return
      setClic({ lon: evento.lngLat.lng, lat: evento.lngLat.lat, propiedades })
    }
    mapa.on('click', ID_HIT, alHacerClic)
    return () => {
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
            beforeId={beforeId}
            paint={{ 'raster-opacity': 0.35, 'raster-resampling': 'linear', 'raster-fade-duration': 0 }}
          />
        </Source>
      )}
      <Source id="lluvia-observada-hit-src" type="geojson" data={datosHit as never}>
        <Layer id={ID_HIT} type="fill" beforeId={beforeId} paint={{ 'fill-opacity': 0 }} />
      </Source>
      {clic && !sinPopup && (
        <Popup longitude={clic.lon} latitude={clic.lat} anchor="bottom" maxWidth="320px" onClose={() => setClic(null)} closeOnClick={false}>
          <TarjetaLluvia horas={horas} desde={respuesta.desde} hasta={respuesta.hasta} celda={clic.propiedades} />
        </Popup>
      )}
    </>
  )
}

function TarjetaLluvia({
  horas,
  desde,
  hasta,
  celda,
}: {
  horas: HorasLluvia
  desde: string | null
  hasta: string | null
  celda: PropiedadesCelda
}) {
  const clase = celda.acumuladoMm >= 1 ? claseDe(celda.acumuladoMm) : null
  const indice = clase ? CLASES_LLUVIA.indexOf(clase) : -1
  const [entero, decimal] = celda.acumuladoMm.toFixed(1).split('.')

  return (
    <div className="map-popup tarjeta-lluvia" data-testid="capa-lluvia-observada">
      <div className="tarjeta-estacion__cabecera">
        <div>
          <h3 className="tarjeta-estacion__titulo">Lluvia observada</h3>
          <p className="tarjeta-estacion__sub">Acumulado de las últimas {horas} h</p>
        </div>
        <span className="tarjeta-lluvia__clase" style={clase ? { background: clase.color, color: indice >= 3 ? '#fff' : '#0b2540' } : undefined}>
          {clase ? clase.etiqueta : 'Menos de 1 mm'}
        </span>
      </div>

      <p className="tarjeta-lluvia__cifra">
        {entero}
        <span className="tarjeta-lluvia__decimal">,{decimal}</span>
        <span className="tarjeta-estacion__unidad"> mm</span>
      </p>

      <div className="tarjeta-lluvia__escala" aria-hidden="true">
        {CLASES_LLUVIA.map((c, i) => (
          <span key={c.desde} style={{ background: c.color }} data-activa={i === indice || undefined} />
        ))}
      </div>
      <div className="tarjeta-lluvia__escala-ejes" aria-hidden="true">
        <span>1</span><span>150+ mm</span>
      </div>

      {desde && hasta && (
        <p className="tarjeta-estacion__hora">
          <time dateTime={hasta}>Actualizado {haceCuanto(hasta, new Date())}</time>
          {' · '}
          {formatearFechaLocal(desde)} – {formatearFechaLocal(hasta)}
        </p>
      )}

      {celda.parcial && (
        <p className="tarjeta-lluvia__aviso">
          Faltan pasadas del satélite en esta ventana ({Math.round(celda.cobertura * 100)} % cubierto): la lluvia real puede ser mayor.
        </p>
      )}

      <div className="tarjeta-lluvia__fuente">
        <LogoNasa size={26} />
        <div>
          <p className="tarjeta-lluvia__fuente-nombre">NASA IMERG</p>
          <p className="tarjeta-estacion__sub">Constelación de satélites NASA · JAXA</p>
        </div>
      </div>
    </div>
  )
}
