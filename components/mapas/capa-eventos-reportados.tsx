'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Marker, Popup } from 'react-map-gl/maplibre'
import {
  puntosDeLocalidades,
  EVENTOS_INUNDACIONES_URLS,
  LOCALIZACIONES_ESCUELAS_URL,
  type EscuelaLocalizada,
  type EventoUbicado,
  type FuenteEvento,
  type LugarSinPrecision,
  type ResumenProvincial,
  ubicarEventos,
  type EntradaUbicacion,
} from '@/lib/mapas/eventos-inundaciones'
import { DEPARTAMENTOS_URL } from '@/lib/mapas/departamentos'
import { CATALOGO_ESTACIONES_PREFECTURA } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'

const LOCALIDADES_URL = '/data/localities.geojson'
const DESPLAZAMIENTO_PX = 8
const MAX_HECHOS = 3
const COLOR_SIN_CONFIANZA = '#9ca3af'

const COLOR_CONFIANZA: Record<string, string> = {
  alta: '#7c2d12',
  media: '#c2410c',
  baja: '#fdba74',
}

const ETIQUETA_PRECISION: Record<string, string> = {
  localidad: 'localidad',
  estación: 'estación',
  departamento: 'departamento',
}

export type ResumenEventosReportados = {
  resumenProvincial: ResumenProvincial[]
  sinUbicacionPrecisa: LugarSinPrecision[]
  total: number
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

type ResultadoCarga = Pick<ResumenEventosReportados, 'resumenProvincial' | 'sinUbicacionPrecisa'> & { features: EventoUbicado[] }

async function cargarEventos(): Promise<ResultadoCarga> {
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
    localidades: puntosDeLocalidades(puntosDeGeojson(localidades), localizaciones as EscuelaLocalizada[]),
    departamentos: centroidesDepartamentos(departamentos),
    estaciones: CATALOGO_ESTACIONES_PREFECTURA,
  })
  return {
    features: resultado.geojson.features,
    resumenProvincial: resultado.resumenProvincial,
    sinUbicacionPrecisa: resultado.sinUbicacionPrecisa,
  }
}

function etiquetaUbicacion(precision: string): string | null {
  return ETIQUETA_PRECISION[precision] ?? null
}

function EnlaceFuente({ fuente }: { fuente: FuenteEvento }) {
  const etiqueta = `${fuente.medio}${fuente.fecha ? `, ${fuente.fecha}` : ''}`
  return (
    <a href={fuente.url} target="_blank" rel="noopener noreferrer">
      {etiqueta}
    </a>
  )
}

function PopupEvento({ propiedades }: { propiedades: EventoUbicado['properties'] }) {
  const [primera, ...resto] = propiedades.fuentes
  const ubicacion = etiquetaUbicacion(propiedades.precisionMostrada)

  return (
    <div className="map-popup">
      <div className="map-popup-cabecera">
        <p className="map-popup-title">{propiedades.titulo}</p>
        <span className={`map-popup-badge map-popup-badge--${propiedades.confianza}`}>{propiedades.confianzaEtiqueta}</span>
      </div>
      <p className="map-popup-subtitle">{propiedades.subtitulo}</p>
      {propiedades.hechos.length > 0 && (
        <ul className="map-popup-hechos">
          {propiedades.hechos.slice(0, MAX_HECHOS).map((hecho) => (
            <li key={hecho}>{hecho}</li>
          ))}
        </ul>
      )}
      <p className="map-popup-row">{propiedades.estadoEtiqueta}</p>
      {primera && (
        <p className="map-popup-row">
          Fuente: <EnlaceFuente fuente={primera} />
        </p>
      )}
      {resto.length > 0 && (
        <details className="map-popup-fuentes">
          <summary>{`ver ${resto.length} fuentes más`}</summary>
          <ul>
            {resto.map((fuente) => (
              <li key={`${fuente.url}-${fuente.medio}`}>
                <EnlaceFuente fuente={fuente} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {ubicacion && (
        <p className="map-popup-muted">
          <small>{`Ubicación aproximada: ${ubicacion}${propiedades.agregado ? ' · forma parte de una cifra provincial' : ''}`}</small>
        </p>
      )}
    </div>
  )
}

export function CapaEventosReportados({ visible, onResumen }: { visible: boolean; onResumen?: (resumen: ResumenEventosReportados) => void }) {
  const [eventos, setEventos] = useState<EventoUbicado[]>([])
  const [seleccionado, setSeleccionado] = useState<number | null>(null)

  const pedidaRef = useRef(false)
  const controladorRef = useRef<AbortController | null>(null)
  const onResumenRef = useRef(onResumen)

  useEffect(() => {
    onResumenRef.current = onResumen
  })

  useEffect(() => {
    if (!visible || pedidaRef.current) return
    pedidaRef.current = true
    const controller = new AbortController()
    controladorRef.current = controller
    cargarEventos()
      .then(({ features, resumenProvincial, sinUbicacionPrecisa }) => {
        if (controller.signal.aborted) return
        setEventos(features)
        onResumenRef.current?.({
          resumenProvincial,
          sinUbicacionPrecisa,
          total: new Set(features.map((f) => f.properties.id_evento)).size,
        })
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

  return (
    <>
      {eventos.map((evento, indice) => {
        const { properties: propiedades, geometry } = evento
        const [lon, lat] = geometry.coordinates
        const confianza = String(propiedades.confianza)
        const color = COLOR_CONFIANZA[confianza] ?? COLOR_SIN_CONFIANZA
        const soloDepartamento = propiedades.precisionMostrada === 'departamento'
        const baja = confianza === 'baja'
        const clases = ['map-marcador-evento']
        if (soloDepartamento) clases.push('map-marcador-evento--departamento')
        if (baja) clases.push('map-marcador-evento--baja')
        return (
          <Marker key={`${propiedades.id_evento}-${indice}`} className="map-marker-evento" longitude={lon} latitude={lat} anchor="center" offset={[desplazamientos[indice], 0]}>
            <button
              type="button"
              aria-label={`Evento ${texto(propiedades.tipo_afectacion)} en ${propiedades.lugar}${baja ? ', confianza baja' : ''}`}
              onClick={() => setSeleccionado(indice)}
              className={clases.join(' ')}
              style={{ background: color }}
            />
          </Marker>
        )
      })}
      {activo && (
        <Popup
          longitude={activo.geometry.coordinates[0]}
          latitude={activo.geometry.coordinates[1]}
          anchor="bottom"
          onClose={() => setSeleccionado(null)}
          closeOnClick={false}
        >
          <PopupEvento propiedades={activo.properties} />
        </Popup>
      )}
    </>
  )
}
