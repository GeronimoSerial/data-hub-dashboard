'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Layer, Popup, Source, useMap } from 'react-map-gl/maplibre'
import { ESTILO_PASTILLA_ESTACION, idMarcadorEstacion, idPastillaEstacion, registrarSimbolosEstacion } from '@/lib/mapas/insignias-mapa'
import { PALETA_ESTADO_ALTURA } from '@/lib/mapas/paleta-tonal'
import { ANCHO_RIO_TENIDO, FILTRO_RIO_TENIDO, ZOOM_MINIMO_RIO_TENIDO, celdasRio, colorRioTenido } from '@/lib/mapas/rio-tenido'
import { TarjetaEstacionRio } from './tarjeta-estacion-rio'

type EstadoAltura = 'evacuacion' | 'alerta' | 'normal' | 'sin_dato'
type Tendencia = 'crece' | 'baja' | 'estable' | 'sin_dato'

type LecturaEstacion = {
  lecturaM: number
  variacionM: number | null
  periodoHoras: number | null
  medidaEn: string
  estadoPublicado: string | null
  alertaM: number | null
  evacuacionM: number | null
  inconsistente: boolean
}

type EstacionRio = {
  estacionId: string
  nombre: string
  rio: 'parana' | 'uruguay'
  rol: string
  lat: number
  lon: number
  coordenadasVerificadas: boolean
  lectura: LecturaEstacion | null
  lecturaVencida: boolean
  estado: EstadoAltura
  tendencia: Tendencia
  /** Level state of the last reading even when stale (absent on older payloads). */
  estadoUltimaLectura?: EstadoAltura
  horasDesdeLectura?: number | null
}

type PuntoEstacion = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { estacionId: string; nombre: string; estado: EstadoAltura; vencida: boolean; insignia: string; marcador: string; texto: string; nivel: string; lado: LadoPastilla }
}

export const CAPA_ESTACIONES_RIO_ID = 'estaciones-rio-simbolos'
const ID_CAPA = CAPA_ESTACIONES_RIO_ID
const ID_CAPA_PASTILLA = 'estaciones-rio-pastillas'
const ID_FUENTE = 'estaciones-rio-src'
const ID_CAPA_RIO_TENIDO = 'estaciones-rio-tenido'
const FLECHA_TENDENCIA: Record<Tendencia, string> = { crece: '↑ ', baja: '↓ ', estable: '', sin_dato: '' }

export const COLOR_ESTADO_ALTURA: Record<EstadoAltura, string> = PALETA_ESTADO_ALTURA

const ETIQUETA_ESTADO: Record<EstadoAltura, string> = {
  evacuacion: 'Evacuación',
  alerta: 'Alerta',
  normal: 'Normal',
  sin_dato: 'Sin dato',
}



export function etiquetaEstadoAltura(estado: EstadoAltura): string {
  return ETIQUETA_ESTADO[estado]
}

const FORMATO_FECHA_LOCAL = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Argentina/Buenos_Aires',
})

/**
 * Formats ISO-8601 timestamps as local Buenos Aires time ("13/10 14:00").
 * Non-ISO free text (e.g. "2026-10-06 (aprox.)") is returned unchanged.
 */
export function formatearFechaLocal(valor: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valor)) return valor
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  const partes = Object.fromEntries(FORMATO_FECHA_LOCAL.formatToParts(fecha).map((p) => [p.type, p.value]))
  return `${partes.day}/${partes.month} ${partes.hour}:${partes.minute}`
}

function formatoMetros(valor: number | null | undefined): string {
  return valor == null ? 'Sin dato' : `${valor.toFixed(2).replace('.', ',')} m`
}


type LadoPastilla = 'derecha' | 'izquierda'

// Roughly one chip at the overview zoom (~7): two stations closer than this would
// stack their chips if both sat on the same side.
const VECINDAD_LON = 0.45
const VECINDAD_LAT = 0.2

/**
 * Chips default to the right of the pin. When two stations are neighbours, the
 * western one (or the southern one if they share a meridian) flips its chip to
 * the left so both levels stay visible without any collision hiding.
 */
export function ladosPastilla(estaciones: Array<{ estacionId: string; lat: number; lon: number }>): Map<string, LadoPastilla> {
  const lados = new Map<string, LadoPastilla>(estaciones.map((e) => [e.estacionId, 'derecha']))
  for (const a of estaciones) {
    for (const b of estaciones) {
      if (a === b) continue
      if (Math.abs(a.lon - b.lon) > VECINDAD_LON || Math.abs(a.lat - b.lat) > VECINDAD_LAT) continue
      const aCede = a.lon < b.lon - 0.02 || (Math.abs(a.lon - b.lon) <= 0.02 && a.lat < b.lat)
      if (aCede) lados.set(a.estacionId, 'izquierda')
    }
  }
  return lados
}

/**
 * What the map paints: a stale reading keeps its last level state (muted, with its
 * age) instead of turning gray; only a station without any reading is sin dato.
 */
export function estadoEnMapa(estacion: EstacionRio): { estado: EstadoAltura; vencida: boolean } {
  if (!estacion.lectura) return { estado: 'sin_dato', vencida: false }
  const vencida = estacion.lecturaVencida
  return { estado: vencida ? (estacion.estadoUltimaLectura ?? estacion.estado) : estacion.estado, vencida }
}

// Chips show only the level; a stale reading keeps its last level and the click
// card carries its age.
function textoPastilla(estacion: EstacionRio): string {
  if (!estacion.lectura) return 's/d'
  return `${FLECHA_TENDENCIA[estacion.tendencia]}${formatoMetros(estacion.lectura.lecturaM)}`
}

function puntosDe(estaciones: EstacionRio[]): { type: 'FeatureCollection'; features: PuntoEstacion[] } {
  const lados = ladosPastilla(estaciones)
  return {
    type: 'FeatureCollection',
    features: estaciones.map((estacion) => {
      const { estado, vencida } = estadoEnMapa(estacion)
      const nivel = textoPastilla(estacion)
      return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [estacion.lon, estacion.lat] },
      properties: {
        estacionId: estacion.estacionId,
        nombre: estacion.nombre,
        estado,
        vencida,
        insignia: idPastillaEstacion(estado),
        marcador: idMarcadorEstacion(estado),
        lado: lados.get(estacion.estacionId) ?? 'derecha',
        nivel,
        texto: nivel,
      },
    }}),
  }
}

type PropsCapa = {
  visible: boolean
  beforeId?: string
  /** Layers kept above the stations (e.g. school clusters, so their counts stay readable). */
  capasEncima?: readonly string[]
}

export function CapaEstacionesRio({ visible, beforeId, capasEncima }: PropsCapa) {
  if (!visible) return null
  return <CapaEstacionesRioActiva beforeId={beforeId} capasEncima={capasEncima} />
}

const SIN_CAPAS: readonly string[] = []

function CapaEstacionesRioActiva({ beforeId, capasEncima = SIN_CAPAS }: Omit<PropsCapa, 'visible'>) {
  const [estaciones, setEstaciones] = useState<EstacionRio[]>([])
  const [listo, setListo] = useState(false)
  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const { current: mapa } = useMap()

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/infraestructura/hidrometria/estaciones', { signal: controller.signal })
      .then((respuesta) => (respuesta.ok ? respuesta.json() : Promise.reject(new Error('estaciones'))))
      .then((cuerpo: { estaciones?: unknown }) =>
        setEstaciones(Array.isArray(cuerpo?.estaciones) ? (cuerpo.estaciones as EstacionRio[]) : []),
      )
      .catch(() => {
        if (!controller.signal.aborted) setEstaciones([])
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    let vigente = true
    if (!mapa) return
    const mapaGl = mapa.getMap()
    // A basemap swap (e.g. Radar's dark style) drops every registered image, which
    // leaves the symbols invisible: register again whenever the style changes.
    const registrar = () => {
      registrarSimbolosEstacion(mapaGl).then(() => {
        if (vigente) setListo(true)
      })
    }
    registrar()
    mapaGl.on('styledata', registrar)
    return () => {
      vigente = false
      mapaGl.off('styledata', registrar)
    }
  }, [mapa])

  // Without a beforeId the stations sit on top of every overlay: layers that mount
  // later (school clusters load asynchronously) would otherwise cover the station
  // icons, so the layer is moved back to the top whenever the style changes.
  useEffect(() => {
    if (!mapa || !listo || beforeId) return
    const mapaGl = mapa.getMap()
    const alTope = () => {
      const capas = mapaGl.getStyle?.()?.layers
      if (!capas?.length || !mapaGl.getLayer?.(ID_CAPA)) return
      const encima = capasEncima.filter((id) => mapaGl.getLayer?.(id))
      // Pins < clusters < level chips: cluster counts stay readable over a pin and
      // no layer can ever cover a station's level.
      const pastilla = mapaGl.getLayer?.(ID_CAPA_PASTILLA) ? [ID_CAPA_PASTILLA] : []
      const orden = [ID_CAPA, ...encima, ...pastilla]
      const cola = capas.slice(-orden.length).map((capa) => capa.id)
      if (cola.join('|') === orden.join('|')) return
      for (const id of orden) mapaGl.moveLayer(id)
    }
    alTope()
    mapaGl.on('styledata', alTope)
    return () => {
      mapaGl.off('styledata', alTope)
    }
  }, [mapa, listo, beforeId, capasEncima])

  useEffect(() => {
    if (!mapa || !listo) return
    const idDe = (evento: { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const id = evento.features?.[0]?.properties.estacionId
      return typeof id === 'string' ? id : undefined
    }
    const alEntrar = (evento: { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const id = idDe(evento)
      if (!id) return
      // No hover tooltip: the pointer cursor alone invites the click.
      mapa.getCanvas().style.cursor = 'pointer'
    }
    const alSalir = () => {
      mapa.getCanvas().style.cursor = ''
    }
    const alHacerClic = (evento: { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const id = idDe(evento)
      if (id) setSeleccionada(id)
    }
    for (const id of [ID_CAPA, ID_CAPA_PASTILLA]) {
      mapa.on('mouseenter', id, alEntrar)
      mapa.on('mouseleave', id, alSalir)
      mapa.on('click', id, alHacerClic)
    }
    return () => {
      for (const id of [ID_CAPA, ID_CAPA_PASTILLA]) {
        mapa.off('mouseenter', id, alEntrar)
        mapa.off('mouseleave', id, alSalir)
        mapa.off('click', id, alHacerClic)
      }
    }
  }, [mapa, listo])

  // The river band sits under the basemap labels, so every overlay (school and
  // station pins included) draws above it. Re-read after a basemap swap.
  const [basemap, setBasemap] = useState<{ antesDeEtiquetas?: string; conFuente: boolean }>({ conFuente: false })
  useEffect(() => {
    if (!mapa) return
    const mapaGl = mapa.getMap()
    const leer = () => {
      const antesDeEtiquetas = mapaGl.getStyle?.()?.layers?.find((capa) => capa.type === 'symbol')?.id
      const conFuente = Boolean(mapaGl.getSource?.('openmaptiles'))
      setBasemap((previo) =>
        previo.antesDeEtiquetas === antesDeEtiquetas && previo.conFuente === conFuente ? previo : { antesDeEtiquetas, conFuente },
      )
    }
    leer()
    mapaGl.on('styledata', leer)
    return () => {
      mapaGl.off('styledata', leer)
    }
  }, [mapa])
  const colorRio = useMemo(() => colorRioTenido(celdasRio(estaciones)), [estaciones])

  const datos = useMemo(() => puntosDe(estaciones), [estaciones])
  const activa = estaciones.find((estacion) => estacion.estacionId === seleccionada) ?? null
  const cerrar = useCallback(() => {
    setSeleccionada(null)
    // Keyboard users land back on the map after closing the card.
    mapa?.getCanvas().focus?.()
  }, [mapa])
  return (
    <>
      {estaciones.length > 0 && basemap.conFuente && (
        <Layer
          id={ID_CAPA_RIO_TENIDO}
          type="line"
          source="openmaptiles"
          source-layer="waterway"
          minzoom={ZOOM_MINIMO_RIO_TENIDO}
          beforeId={basemap.antesDeEtiquetas}
          filter={FILTRO_RIO_TENIDO as never}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colorRio as never, 'line-opacity': 0.4, 'line-width': ANCHO_RIO_TENIDO as never }}
        />
      )}
      {listo && (
        <Source id={ID_FUENTE} type="geojson" data={datos}>
          <Layer
            id={ID_CAPA_PASTILLA}
            type="symbol"
            beforeId={beforeId}
            layout={{
              // Level chip beside the pin at every zoom (user: level must read zoomed out too).
              'icon-image': ['get', 'insignia'],
              'icon-text-fit': 'both',
              'icon-text-fit-padding': [3, 7, 3, 7],
              // Every level is always shown: overlaps between neighbours are solved by
              // placement (see ladosPastilla), never by collision hiding.
              'icon-allow-overlap': true,
              'text-field': ['get', 'nivel'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 9, 11],
              // MapLibre defaults to Open Sans, which the OpenFreeMap glyph server does not serve.
              'text-font': ['Noto Sans Bold'],
              'text-anchor': ['match', ['get', 'lado'], 'izquierda', 'right', 'left'],
              'text-offset': ['match', ['get', 'lado'], 'izquierda', ['literal', [-1.4, -1.45]], ['literal', [1.4, -1.45]]],
              'text-allow-overlap': true,
              'symbol-sort-key': ['match', ['get', 'estado'], 'evacuacion', 0, 'alerta', 1, 'normal', 2, 3],
            }}
            paint={{
              'text-color': ['match', ['get', 'estado'],
                'evacuacion', ESTILO_PASTILLA_ESTACION.evacuacion.texto,
                'alerta', ESTILO_PASTILLA_ESTACION.alerta.texto,
                'normal', ESTILO_PASTILLA_ESTACION.normal.texto,
                ESTILO_PASTILLA_ESTACION.sin_dato.texto],
            }}
          />
          <Layer
            id={ID_CAPA}
            type="symbol"
            beforeId={beforeId}
            layout={{
              // State-coloured pin with a river glyph, at every zoom and for sin dato too.
              'icon-image': ['get', 'marcador'],
              'icon-anchor': 'bottom',
              'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.85, 9, 1],
              'icon-allow-overlap': true,
              // Pins always draw and never claim space, so they cannot hide their own chip.
              'icon-ignore-placement': true,
              'symbol-sort-key': ['match', ['get', 'estado'], 'evacuacion', 0, 'alerta', 1, 'normal', 2, 3],
            }}
          />
        </Source>
      )}
      {activa && (
        <Popup
          longitude={activa.lon}
          latitude={activa.lat}
          anchor="bottom"
          maxWidth="340px"
          offset={30}
          onClose={cerrar}
          closeOnClick={false}
        >
          <TarjetaEstacionRio estacion={{ ...activa, ...estadoEnMapa(activa) }} onCerrar={cerrar} />
        </Popup>
      )}
    </>
  )
}
