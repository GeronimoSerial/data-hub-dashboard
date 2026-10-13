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
          <Marker key={estacion.estacionId} longitude={estacion.lon} latitude={estacion.lat} anchor="center">
            <button
              type="button"
              aria-label={`Estación ${estacion.nombre}: ${etiqueta}`}
              onClick={() => setSeleccionada(estacion.estacionId)}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: COLOR_ESTADO_ALTURA[estacion.estado],
                border: estacion.estado === 'sin_dato' ? '2px dashed #4b5563' : '2px solid #ffffff',
                cursor: 'pointer',
                padding: 0,
              }}
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
          <div style={{ fontSize: 12, lineHeight: 1.4 }}>
            <b>{activa.nombre}</b> · {ETIQUETA_RIO[activa.rio]}
            <div>Altura: {activa.lectura ? formatoMetros(activa.lectura.lecturaM) : 'Sin dato'}</div>
            <div>Tendencia: {ETIQUETA_TENDENCIA[activa.tendencia]}</div>
            <div>
              Alerta: {formatoMetros(activa.lectura?.alertaM)} · Evacuación: {formatoMetros(activa.lectura?.evacuacionM)}
            </div>
            {activa.lectura && <div>Medida: {activa.lectura.medidaEn}</div>}
            {activa.lectura?.inconsistente && <div>Lectura marcada como inconsistente</div>}
            <small>
              Fuente: Prefectura Naval Argentina. Ubicación declarada por el publicador (no verificada).
            </small>
          </div>
        </Popup>
      )}
    </>
  )
}
