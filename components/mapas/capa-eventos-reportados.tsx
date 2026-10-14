'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Marker, Popup } from 'react-map-gl/maplibre'
import {
  centroidesLocalidadesEscuelas,
  EVENTOS_INUNDACIONES_URLS,
  LOCALIZACIONES_ESCUELAS_URL,
  type EscuelaLocalizada,
  type EventoUbicado,
  ubicarEventos,
  type EntradaUbicacion,
} from '@/lib/mapas/eventos-inundaciones'
import { DEPARTAMENTOS_URL } from '@/lib/mapas/departamentos'
import { CATALOGO_ESTACIONES_PREFECTURA } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { formatearFechaLocal } from '@/components/mapas/capa-estaciones-rio'

const LOCALIDADES_URL = '/data/localities.geojson'
const DESPLAZAMIENTO_PX = 8
const LIMITE_MEDICIONES = 240
const COLOR_SIN_CONFIANZA = '#9ca3af'

const COLOR_CONFIANZA: Record<string, string> = {
  alta: '#7c2d12',
  media: '#c2410c',
  baja: '#fdba74',
}

type PuntoGeo = { type: 'Feature'; geometry: { coordinates: number[] }; properties: { name?: string; nombre?: string; centroide?: { lon: number; lat: number } } }

function texto(valor: unknown): string {
  return valor == null || valor === '' ? 'Sin dato' : String(valor)
}

function puntosDeGeojson(datos: unknown): { nombre: string; lon: number; lat: number }[] {
  const features = (datos as { features?: PuntoGeo[] })?.features ?? []
  return features.map((f) => ({
    nombre: String(f.properties.name ?? f.properties.nombre ?? ''),
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }))
}

function centroidesDepartamentos(datos: unknown): { nombre: string; lon: number; lat: number }[] {
  const features = (datos as { features?: PuntoGeo[] })?.features ?? []
  return features
    .filter((f) => f.properties.centroide)
    .map((f) => ({ nombre: String(f.properties.nombre ?? ''), lon: f.properties.centroide!.lon, lat: f.properties.centroide!.lat }))
}

async function cargarJson(url: string): Promise<unknown> {
  const respuesta = await fetch(url)
  if (!respuesta.ok) throw new Error(url)
  return respuesta.json()
}

async function cargarEventos(): Promise<EventoUbicado[]> {
  const [eventos, evidenciasRespuesta, localidades, localizaciones, departamentos] = await Promise.all([
    cargarJson(EVENTOS_INUNDACIONES_URLS.eventos),
    fetch(EVENTOS_INUNDACIONES_URLS.evidencias).then((r) => (r.ok ? r.text() : Promise.reject(new Error('evidencias')))),
    cargarJson(LOCALIDADES_URL),
    cargarJson(LOCALIZACIONES_ESCUELAS_URL),
    cargarJson(DEPARTAMENTOS_URL),
  ])
  const resultado = ubicarEventos({
    eventos: eventos as EntradaUbicacion['eventos'],
    evidenciasCsv: evidenciasRespuesta,
    localidades: puntosDeGeojson(localidades).concat(centroidesLocalidadesEscuelas(localizaciones as EscuelaLocalizada[])),
    departamentos: centroidesDepartamentos(departamentos),
    estaciones: CATALOGO_ESTACIONES_PREFECTURA,
  })
  return resultado.geojson.features
}

export function CapaEventosReportados({ visible }: { visible: boolean }) {
  const [eventos, setEventos] = useState<EventoUbicado[]>([])
  const [seleccionado, setSeleccionado] = useState<number | null>(null)

  const pedidaRef = useRef(false)
  const controladorRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!visible || pedidaRef.current) return
    pedidaRef.current = true
    const controller = new AbortController()
    controladorRef.current = controller
    cargarEventos()
      .then((features) => {
        if (!controller.signal.aborted) setEventos(features)
      })
      .catch(() => setEventos([]))
  }, [visible])

  useEffect(() => () => controladorRef.current?.abort(), [])

  // Events placed on the same coordinates are spread horizontally so each marker stays clickable.
  // Offsets start at one step (never [0,0]) and alternate sides: +1, -2, +3, ... steps.
  const desplazamientos = useMemo(() => {
    const porPunto = new Map<string, number>()
    return eventos.map((evento) => {
      const clave = evento.geometry.coordinates.join(',')
      const indice = porPunto.get(clave) ?? 0
      porPunto.set(clave, indice + 1)
      const signo = indice % 2 === 0 ? 1 : -1
      return signo * (indice + 1) * DESPLAZAMIENTO_PX
    })
  }, [eventos])

  if (!visible) return null
  const activo = seleccionado === null ? null : eventos[seleccionado] ?? null
  const p = activo?.properties

  return (
    <>
      {eventos.map((evento, indice) => {
        const { properties: propiedades, geometry } = evento
        const [lon, lat] = geometry.coordinates
        const color = COLOR_CONFIANZA[String(propiedades.confianza)] ?? COLOR_SIN_CONFIANZA
        const soloDepartamento = propiedades.precisionMostrada === 'departamento'
        return (
          <Marker key={`${propiedades.id_evento}-${indice}`} className="map-marker-evento" longitude={lon} latitude={lat} anchor="center" offset={[desplazamientos[indice], 0]}>
            <button
              type="button"
              aria-label={`Evento ${texto(propiedades.tipo_afectacion)} en ${propiedades.lugar}`}
              onClick={() => setSeleccionado(indice)}
              className={`map-marcador-evento${soloDepartamento ? ' map-marcador-evento--departamento' : ''}`}
              style={{ background: color }}
            />
          </Marker>
        )
      })}
      {activo && p && (
        <Popup
          longitude={activo.geometry.coordinates[0]}
          latitude={activo.geometry.coordinates[1]}
          anchor="bottom"
          onClose={() => setSeleccionado(null)}
          closeOnClick={false}
        >
          <div className="map-popup">
            <p className="map-popup-title">{`${texto(p.tipo_fenomeno)} — ${texto(p.tipo_afectacion)}`}</p>
            <p className="map-popup-row">{`Lugar: ${p.lugar} (${texto(p.departamento)})`}</p>
            <p className="map-popup-row">{`Ubicación aproximada a nivel de ${p.precisionMostrada}${p.multiLugar ? ' · el evento menciona varios lugares' : ''}`}</p>
            <hr className="map-popup-rule" />
            <p className="map-popup-row">{`Inicio: ${formatearFechaLocal(texto(p.inicio_evento))}`}</p>
            <p className="map-popup-row">{`Última actualización: ${formatearFechaLocal(texto(p.ultima_actualizacion))}`}</p>
            <p className="map-popup-row">{`Estado: ${texto(p.estado_temporal)}`}</p>
            <p className="map-popup-row">{`Confianza: ${texto(p.confianza)}`}</p>
            {p.mediciones ? <p className="map-popup-row">{String(p.mediciones).slice(0, LIMITE_MEDICIONES)}</p> : null}
            {p.fuenteUrl ? (
              <p className="map-popup-row">
                <a href={p.fuenteUrl} target="_blank" rel="noopener noreferrer">{`Fuente: ${p.fuenteTitulo ?? 'ver fuente'}`}</a>
              </p>
            ) : (
              <p className="map-popup-row">Fuente sin enlace</p>
            )}
            <p className="map-popup-muted">
              <small>Registro de eventos reportados (prensa y organismos). No es una medición.</small>
            </p>
          </div>
        </Popup>
      )}
    </>
  )
}
