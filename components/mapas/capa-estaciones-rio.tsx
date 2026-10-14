'use client'

import { useEffect, useRef, useState } from 'react'
import { Marker, Popup } from 'react-map-gl/maplibre'

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
  estado: EstadoAltura
  tendencia: Tendencia
}

export const COLOR_ESTADO_ALTURA: Record<EstadoAltura, string> = {
  evacuacion: '#b91c1c',
  alerta: '#f59e0b',
  normal: '#15803d',
  sin_dato: '#9ca3af',
}

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

export function CapaEstacionesRio({ visible }: { visible: boolean }) {
  const [estaciones, setEstaciones] = useState<EstacionRio[]>([])
  const [seleccionada, setSeleccionada] = useState<string | null>(null)

  const pedidaRef = useRef(false)
  const controladorRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!visible || pedidaRef.current) return
    pedidaRef.current = true
    const controller = new AbortController()
    controladorRef.current = controller
    fetch('/api/infraestructura/hidrometria/estaciones', { signal: controller.signal })
      .then((respuesta) => (respuesta.ok ? respuesta.json() : Promise.reject(new Error('estaciones'))))
      .then((cuerpo: { estaciones?: unknown }) =>
        setEstaciones(Array.isArray(cuerpo?.estaciones) ? (cuerpo.estaciones as EstacionRio[]) : []),
      )
      .catch(() => setEstaciones([]))
  }, [visible])

  useEffect(() => () => controladorRef.current?.abort(), [])

  if (!visible) return null
  const activa = estaciones.find((estacion) => estacion.estacionId === seleccionada) ?? null

  return (
    <>
      {estaciones.map((estacion) => {
        const etiqueta = etiquetaEstadoAltura(estacion.estado)
        return (
          <Marker key={estacion.estacionId} className="map-marker-estacion" longitude={estacion.lon} latitude={estacion.lat} anchor="center">
            <button
              type="button"
              aria-label={`Estación ${estacion.nombre}: ${etiqueta}`}
              onClick={() => setSeleccionada(estacion.estacionId)}
              className={`map-marcador-estacion${estacion.estado === 'sin_dato' ? ' map-marcador-estacion--sin-dato' : ''}`}
              style={{ background: COLOR_ESTADO_ALTURA[estacion.estado] }}
            />
          </Marker>
        )
      })}
      {activa && (
        <Popup
          longitude={activa.lon}
          latitude={activa.lat}
          anchor="bottom"
          onClose={() => setSeleccionada(null)}
          closeOnClick={false}
        >
          <div className="map-popup">
            <p className="map-popup-title">{activa.nombre}</p>
            <p className="map-popup-row">{ETIQUETA_RIO[activa.rio]}</p>
            <hr className="map-popup-rule" />
            <p className="map-popup-row">Altura: {activa.lectura ? formatoMetros(activa.lectura.lecturaM) : 'Sin dato'}</p>
            <p className="map-popup-row">Tendencia: {ETIQUETA_TENDENCIA[activa.tendencia]}</p>
            <p className="map-popup-row">
              Alerta: {formatoMetros(activa.lectura?.alertaM)} · Evacuación: {formatoMetros(activa.lectura?.evacuacionM)}
            </p>
            {activa.lectura && <p className="map-popup-row">Medida: {formatearFechaLocal(activa.lectura.medidaEn)}</p>}
            {activa.lectura?.inconsistente && <p className="map-popup-row">Lectura marcada como inconsistente</p>}
            <p className="map-popup-muted">
              <small>Fuente: Prefectura Naval Argentina. Ubicación declarada por el publicador (no verificada).</small>
            </p>
          </div>
        </Popup>
      )}
    </>
  )
}
