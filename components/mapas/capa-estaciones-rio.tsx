'use client'

import { useEffect, useMemo, useState } from 'react'
import { Layer, Popup, Source, useMap } from 'react-map-gl/maplibre'
import { ESTILO_PASTILLA_ESTACION, idPastillaEstacion, idPuntoEstacion, registrarSimbolosEstacion } from '@/lib/mapas/insignias-mapa'
import { PALETA_ESTADO_ALTURA } from '@/lib/mapas/paleta-tonal'
import { DatoFechado, NotaInfo } from '@/components/ui/dato-fechado'
import { textoActualizado, textoAlturaRio } from '@/lib/infraestructura/presentacion/textos-dato'

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
}

type PuntoEstacion = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { estacionId: string; nombre: string; estado: EstadoAltura; insignia: string; punto: string; altura: string; flecha: string }
}

export const CAPA_ESTACIONES_RIO_ID = 'estaciones-rio-simbolos'
const ID_CAPA = CAPA_ESTACIONES_RIO_ID
const ID_FUENTE = 'estaciones-rio-src'
// Zoom from which a station shows its level chip instead of a dot.
export const ZOOM_PASTILLA_ESTACION = 8
const FLECHA_TENDENCIA: Record<Tendencia, string> = { crece: '↑ ', baja: '↓ ', estable: '', sin_dato: '' }

export const COLOR_ESTADO_ALTURA: Record<EstadoAltura, string> = PALETA_ESTADO_ALTURA

const ETIQUETA_ESTADO: Record<EstadoAltura, string> = {
  evacuacion: 'Evacuación',
  alerta: 'Alerta',
  normal: 'Normal',
  sin_dato: 'Sin dato',
}

const ETIQUETA_TENDENCIA: Record<Tendencia, string> = {
  crece: 'Crece',
  baja: 'Baja',
  estable: 'Estable',
  sin_dato: 'Sin dato',
}

const ETIQUETA_RIO: Record<EstacionRio['rio'], string> = {
  parana: 'Río Paraná',
  uruguay: 'Río Uruguay',
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


function puntosDe(estaciones: EstacionRio[]): { type: 'FeatureCollection'; features: PuntoEstacion[] } {
  return {
    type: 'FeatureCollection',
    features: estaciones.map((estacion) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [estacion.lon, estacion.lat] },
      properties: {
        estacionId: estacion.estacionId,
        nombre: estacion.nombre,
        estado: estacion.estado,
        insignia: idPastillaEstacion(estacion.estado),
        punto: idPuntoEstacion(estacion.estado),
        altura: estacion.lectura ? formatoMetros(estacion.lectura.lecturaM) : '',
        flecha: FLECHA_TENDENCIA[estacion.tendencia],
      },
    })),
  }
}

export function CapaEstacionesRio({ visible, beforeId }: { visible: boolean; beforeId?: string }) {
  if (!visible) return null
  return <CapaEstacionesRioActiva beforeId={beforeId} />
}

function CapaEstacionesRioActiva({ beforeId }: { beforeId?: string }) {
  const [estaciones, setEstaciones] = useState<EstacionRio[]>([])
  const [listo, setListo] = useState(false)
  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [enfocada, setEnfocada] = useState<string | null>(null)
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
      if (capas[capas.length - 1].id !== ID_CAPA) mapaGl.moveLayer(ID_CAPA)
    }
    alTope()
    mapaGl.on('styledata', alTope)
    return () => {
      mapaGl.off('styledata', alTope)
    }
  }, [mapa, listo, beforeId])

  useEffect(() => {
    if (!mapa || !listo) return
    const idDe = (evento: { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const id = evento.features?.[0]?.properties.estacionId
      return typeof id === 'string' ? id : undefined
    }
    const alEntrar = (evento: { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const id = idDe(evento)
      if (!id) return
      mapa.getCanvas().style.cursor = 'pointer'
      setEnfocada(id)
    }
    const alSalir = () => {
      mapa.getCanvas().style.cursor = ''
      setEnfocada(null)
    }
    const alHacerClic = (evento: { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const id = idDe(evento)
      if (id) setSeleccionada(id)
    }
    mapa.on('mouseenter', ID_CAPA, alEntrar)
    mapa.on('mouseleave', ID_CAPA, alSalir)
    mapa.on('click', ID_CAPA, alHacerClic)
    return () => {
      mapa.off('mouseenter', ID_CAPA, alEntrar)
      mapa.off('mouseleave', ID_CAPA, alSalir)
      mapa.off('click', ID_CAPA, alHacerClic)
    }
  }, [mapa, listo])

  const datos = useMemo(() => puntosDe(estaciones), [estaciones])
  const activa = estaciones.find((estacion) => estacion.estacionId === seleccionada) ?? null
  const alturaActiva = textoAlturaRio({
    alturaM: activa?.lectura?.lecturaM ?? null,
    estado: activa?.estado ?? 'sin_dato',
    alertaM: activa?.lectura?.alertaM ?? null,
    evacuacionM: activa?.lectura?.evacuacionM ?? null,
  })
  const enfoque = estaciones.find((estacion) => estacion.estacionId === enfocada) ?? null

  return (
    <>
      {listo && (
        <Source id={ID_FUENTE} type="geojson" data={datos}>
          <Layer
            id={ID_CAPA}
            type="symbol"
            beforeId={beforeId}
            layout={{
              // Dot at province zoom; level chip (state colour + level) closer in.
              // Stations without data stay a faint dot at every zoom.
              'icon-image': [
                'step', ['zoom'], ['get', 'punto'],
                ZOOM_PASTILLA_ESTACION, ['case', ['==', ['get', 'estado'], 'sin_dato'], ['get', 'punto'], ['get', 'insignia']],
              ],
              'icon-text-fit': 'both',
              'icon-text-fit-padding': [3, 7, 3, 7],
              'icon-size': 1,
              'icon-allow-overlap': true,
              'icon-ignore-placement': false,
              'symbol-sort-key': ['match', ['get', 'estado'], 'evacuacion', 0, 'alerta', 1, 'normal', 2, 3],
              'text-field': [
                'step', ['zoom'], '',
                ZOOM_PASTILLA_ESTACION, ['case', ['==', ['get', 'estado'], 'sin_dato'], '', ['concat', ['get', 'flecha'], ['get', 'altura']]],
              ],
              'text-size': 11,
              // MapLibre defaults to Open Sans, which the OpenFreeMap glyph server does not serve.
              'text-font': ['Noto Sans Regular'],
              'text-anchor': 'center',
              'text-allow-overlap': true,
            }}
            paint={{
              'text-color': ['match', ['get', 'estado'],
                'evacuacion', ESTILO_PASTILLA_ESTACION.evacuacion.texto,
                'alerta', ESTILO_PASTILLA_ESTACION.alerta.texto,
                'normal', ESTILO_PASTILLA_ESTACION.normal.texto,
                ESTILO_PASTILLA_ESTACION.sin_dato.texto],
              'icon-opacity': ['case', ['==', ['get', 'estado'], 'sin_dato'], 0.75, 1],
            }}
          />
        </Source>
      )}
      {enfoque && !activa && (
        <Popup
          longitude={enfoque.lon}
          latitude={enfoque.lat}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          className="mapa-tooltip"
          offset={18}
        >
          {`Estación Prefectura ${enfoque.nombre} · Altura del río: ${enfoque.lectura ? formatoMetros(enfoque.lectura.lecturaM) : 'sin dato'} · ${etiquetaEstadoAltura(enfoque.estado)} — clic para ver detalle`}
        </Popup>
      )}
      {activa && (
        <Popup
          longitude={activa.lon}
          latitude={activa.lat}
          anchor="bottom"
          maxWidth="360px"
          onClose={() => setSeleccionada(null)}
          closeOnClick={false}
        >
          <div className="map-popup">
            <p className="map-popup-title">{activa.nombre}</p>
            <p className="map-popup-muted">{ETIQUETA_RIO[activa.rio]}</p>
            <hr className="map-popup-rule" />
            <p className="map-popup-row">
              <DatoFechado
                actualizado={textoActualizado(activa.lectura?.medidaEn)}
                vencido={activa.lecturaVencida}
              >
                <strong>{alturaActiva.altura}</strong>
              </DatoFechado>
              {' · '}{alturaActiva.estado}
              {activa.lectura?.inconsistente && <NotaInfo texto="Lectura marcada como inconsistente por la fuente." />}
            </p>
            {alturaActiva.umbrales && <p className="map-popup-muted">{alturaActiva.umbrales}</p>}
            <p className="map-popup-row">Tendencia: {ETIQUETA_TENDENCIA[activa.tendencia]}</p>
            <p className="map-popup-muted">
              <small>Fuente: Prefectura Naval Argentina</small>
              <NotaInfo texto="Ubicación declarada por el publicador (no verificada)." />
            </p>
          </div>
        </Popup>
      )}
    </>
  )
}
