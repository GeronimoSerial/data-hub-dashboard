'use client'

import { NotaInfo } from '@/components/ui/dato-fechado'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Popup, Source, useMap } from 'react-map-gl/maplibre'
import { registrarInsignias } from '@/lib/mapas/insignias-mapa'
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
const RADIO_DESPLAZAMIENTO = 1.1
const MAX_HECHOS = 3
const ID_CAPA = 'eventos-reportados-simbolos'
const ID_FUENTE = 'eventos-reportados-src'
const INSIGNIAS_EVENTOS = ['evento-alta', 'evento-media', 'evento-baja'] as const
const CONFIANZAS = ['alta', 'media', 'baja'] as const

const ETIQUETA_PRECISION: Record<string, string> = {
  localidad: 'localidad',
  estación: 'estación',
  departamento: 'departamento',
}

export type ItemEventoReportado = {
  id: string
  titulo: string
  lugar: string
  /** YYYY-MM-DD used for sorting and display, or null when the registry has no date. */
  fecha: string | null
  confianza: 'alta' | 'media' | 'baja'
  confianzaEtiqueta: string
  medio: string | null
  lon: number | null
  lat: number | null
  /** True for events known only from a place name, with no drawn badge. */
  noDeterminada: boolean
}

export type ResumenEventosReportados = {
  resumenProvincial: ResumenProvincial[]
  sinUbicacionPrecisa: LugarSinPrecision[]
  total: number
  /** Registry date (YYYY-MM-DD) so the legend can show how old the event list is. */
  actualizadoAl: string | null
  eventos: ItemEventoReportado[]
}

type PuntoGeo = { type: 'Feature'; geometry: { coordinates: number[] }; properties: { name?: string; nombre?: string; centroide?: { lon: number; lat: number } } }

type PuntoEvento = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    indice: number
    id_evento: string
    titulo: string
    lugar: string
    confianza: string
    insignia: string
    desplazamiento: [number, number]
  }
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

type ResultadoCarga = Pick<ResumenEventosReportados, 'resumenProvincial' | 'sinUbicacionPrecisa' | 'actualizadoAl'> & { features: EventoUbicado[] }

async function cargarEventos(): Promise<ResultadoCarga> {
  const [eventos, evidenciasRespuesta, localidades, localizaciones, departamentos, gazetteer] = await Promise.all([
    cargarJson(EVENTOS_INUNDACIONES_URLS.eventos),
    fetch(EVENTOS_INUNDACIONES_URLS.evidencias).then((r) => (r.ok ? r.text() : Promise.reject(new Error('evidencias')))),
    cargarJson(LOCALIDADES_URL),
    cargarJson(LOCALIZACIONES_ESCUELAS_URL),
    cargarJson(DEPARTAMENTOS_URL),
    cargarJson(EVENTOS_INUNDACIONES_URLS.gazetteer),
  ])
  const resultado = ubicarEventos({
    eventos: eventos as EntradaUbicacion['eventos'],
    evidenciasCsv: evidenciasRespuesta,
    localidades: puntosDeLocalidades(puntosDeGeojson(localidades), localizaciones as EscuelaLocalizada[]),
    departamentos: centroidesDepartamentos(departamentos),
    estaciones: CATALOGO_ESTACIONES_PREFECTURA,
    gazetteer: gazetteer as EntradaUbicacion['gazetteer'],
  })
  return {
    features: resultado.geojson.features,
    resumenProvincial: resultado.resumenProvincial,
    sinUbicacionPrecisa: resultado.sinUbicacionPrecisa,
    actualizadoAl: resultado.actualizadoAl,
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
      <p className="map-popup-subtitle">
        {propiedades.subtitulo}
        {ubicacion && (
          <NotaInfo texto={`Ubicación aproximada: ${ubicacion}${propiedades.agregado ? ' · forma parte de una cifra provincial' : ''}`} />
        )}
      </p>
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
    </div>
  )
}

function insigniaDe(confianza: string): string {
  const normalizada = (CONFIANZAS as readonly string[]).includes(confianza) ? confianza : 'baja'
  return `evento-${normalizada}`
}

// Events placed on identical coordinates are spread on a ring so each badge stays clickable.
// Groups of one keep [0, 0]; the n-th of k>1 features sits at angle 2πn/k, radius RADIO_DESPLAZAMIENTO.
function desplazamientosDe(eventos: EventoUbicado[]): [number, number][] {
  const tamanos = new Map<string, number>()
  for (const evento of eventos) {
    const clave = evento.geometry.coordinates.join(',')
    tamanos.set(clave, (tamanos.get(clave) ?? 0) + 1)
  }
  const vistos = new Map<string, number>()
  const redondeo = (valor: number) => Math.round(valor * 1000) / 1000
  return eventos.map((evento) => {
    const clave = evento.geometry.coordinates.join(',')
    const k = tamanos.get(clave) ?? 1
    if (k <= 1) return [0, 0]
    const n = vistos.get(clave) ?? 0
    vistos.set(clave, n + 1)
    const angulo = (2 * Math.PI * n) / k
    return [redondeo(RADIO_DESPLAZAMIENTO * Math.cos(angulo)), redondeo(RADIO_DESPLAZAMIENTO * Math.sin(angulo))]
  })
}

function puntosDe(eventos: EventoUbicado[], desplazamientos: [number, number][]): { type: 'FeatureCollection'; features: PuntoEvento[] } {
  return {
    type: 'FeatureCollection',
    features: eventos.map((evento, indice) => {
      const confianza = String(evento.properties.confianza)
      return {
        type: 'Feature',
        geometry: evento.geometry,
        properties: {
          indice,
          id_evento: String(evento.properties.id_evento),
          titulo: String(evento.properties.titulo),
          lugar: String(evento.properties.lugar),
          confianza,
          insignia: insigniaDe(confianza),
          desplazamiento: desplazamientos[indice],
        },
      }
    }),
  }
}

const RANGO_CONFIANZA: Record<ItemEventoReportado['confianza'], number> = { alta: 0, media: 1, baja: 2 }

function fechaISO(valor: unknown): string | null {
  const coincidencia = /^\d{4}-\d{2}-\d{2}/.exec(String(valor ?? ''))
  return coincidencia ? coincidencia[0] : null
}

function confianzaNormalizada(valor: string): ItemEventoReportado['confianza'] {
  return (CONFIANZAS as readonly string[]).includes(valor) ? (valor as ItemEventoReportado['confianza']) : 'baja'
}

// One item per event id: drawn events first (their first feature), then events known only by place name.
function itemsDe(features: EventoUbicado[], sinUbicacionPrecisa: LugarSinPrecision[]): ItemEventoReportado[] {
  const vistos = new Set<string>()
  const items: ItemEventoReportado[] = []
  for (const feature of features) {
    const propiedades = feature.properties
    const id = String(propiedades.id_evento)
    if (vistos.has(id)) continue
    vistos.add(id)
    items.push({
      id,
      titulo: String(propiedades.titulo),
      lugar: String(propiedades.lugar),
      fecha: fechaISO(propiedades.inicio_evento) ?? fechaISO(propiedades.ultima_actualizacion),
      confianza: confianzaNormalizada(String(propiedades.confianza)),
      confianzaEtiqueta: String(propiedades.confianzaEtiqueta),
      medio: propiedades.fuentes[0]?.medio ?? null,
      lon: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
      noDeterminada: false,
    })
  }
  for (const lugar of sinUbicacionPrecisa) {
    const id = String(lugar.id)
    if (vistos.has(id)) continue
    vistos.add(id)
    items.push({
      id,
      titulo: lugar.titulo,
      lugar: lugar.lugar,
      fecha: lugar.fecha,
      confianza: lugar.confianza as ItemEventoReportado['confianza'],
      confianzaEtiqueta: lugar.confianzaEtiqueta,
      medio: lugar.medio,
      lon: null,
      lat: null,
      noDeterminada: true,
    })
  }
  return items.sort((a, b) => {
    const porFecha = (b.fecha ?? '').localeCompare(a.fecha ?? '')
    return porFecha !== 0 ? porFecha : RANGO_CONFIANZA[a.confianza] - RANGO_CONFIANZA[b.confianza]
  })
}

export function CapaEventosReportados({
  visible,
  beforeId,
  onResumen,
  seleccionadoId,
  resaltadoId,
  onSeleccion,
}: {
  visible: boolean
  beforeId?: string
  onResumen?: (resumen: ResumenEventosReportados) => void
  seleccionadoId?: string | null
  resaltadoId?: string | null
  onSeleccion?: (id: string | null) => void
}) {
  if (!visible) return null
  return (
    <CapaEventosReportadosActiva
      beforeId={beforeId}
      onResumen={onResumen}
      seleccionadoId={seleccionadoId}
      resaltadoId={resaltadoId}
      onSeleccion={onSeleccion}
    />
  )
}

function CapaEventosReportadosActiva({
  beforeId,
  onResumen,
  seleccionadoId,
  resaltadoId,
  onSeleccion,
}: {
  beforeId?: string
  onResumen?: (resumen: ResumenEventosReportados) => void
  seleccionadoId?: string | null
  resaltadoId?: string | null
  onSeleccion?: (id: string | null) => void
}) {
  const [eventos, setEventos] = useState<EventoUbicado[]>([])
  const [listo, setListo] = useState(false)
  const [seleccionado, setSeleccionado] = useState<number | null>(null)
  const [enfocado, setEnfocado] = useState<number | null>(null)
  const [seleccionPedida, setSeleccionPedida] = useState<string | null | undefined>(undefined)
  const { current: mapa } = useMap()
  const onResumenRef = useRef(onResumen)
  const onSeleccionRef = useRef(onSeleccion)
  const eventosRef = useRef(eventos)

  useEffect(() => {
    onResumenRef.current = onResumen
    onSeleccionRef.current = onSeleccion
    eventosRef.current = eventos
  })

  // Applies each new seleccionadoId once (also when it arrives before the events load).
  const indicePedido = seleccionadoId ? eventos.findIndex((evento) => String(evento.properties.id_evento) === seleccionadoId) : -1
  if (indicePedido >= 0 && seleccionadoId !== seleccionPedida) {
    setSeleccionPedida(seleccionadoId)
    setSeleccionado(indicePedido)
  }

  useEffect(() => {
    const controller = new AbortController()
    cargarEventos()
      .then(({ features, resumenProvincial, sinUbicacionPrecisa, actualizadoAl }) => {
        if (controller.signal.aborted) return
        setEventos(features)
        onResumenRef.current?.({
          resumenProvincial,
          sinUbicacionPrecisa,
          total: new Set(features.map((f) => f.properties.id_evento)).size,
          actualizadoAl,
          eventos: itemsDe(features, sinUbicacionPrecisa),
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setEventos([])
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
      registrarInsignias(mapaGl, INSIGNIAS_EVENTOS).then(() => {
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

  useEffect(() => {
    if (!mapa || !listo) return
    const indiceDe = (evento: { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const indice = evento.features?.[0]?.properties.indice
      return typeof indice === 'number' ? indice : undefined
    }
    const alEntrar = (evento: { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const indice = indiceDe(evento)
      if (indice === undefined) return
      mapa.getCanvas().style.cursor = 'pointer'
      setEnfocado(indice)
    }
    const alSalir = () => {
      mapa.getCanvas().style.cursor = ''
      setEnfocado(null)
    }
    const alHacerClic = (evento: { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const indice = indiceDe(evento)
      if (indice === undefined) return
      setSeleccionado(indice)
      const id = eventosRef.current[indice]?.properties.id_evento
      onSeleccionRef.current?.(id === undefined ? null : String(id))
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

  const desplazamientos = useMemo(() => desplazamientosDe(eventos), [eventos])
  const datos = useMemo(() => puntosDe(eventos, desplazamientos), [eventos, desplazamientos])
  const activo = seleccionado === null ? null : eventos[seleccionado] ?? null
  const enfoque = enfocado === null ? null : eventos[enfocado] ?? null

  return (
    <>
      {listo && (
        <Source id={ID_FUENTE} type="geojson" data={datos} attribution="Ubicaciones © OpenStreetMap contributors">
          <Layer
            id={ID_CAPA}
            type="symbol"
            beforeId={beforeId}
            layout={{
              'icon-image': ['get', 'insignia'],
              'icon-offset': ['get', 'desplazamiento'],
              'icon-allow-overlap': false,
              'icon-ignore-placement': false,
              'icon-size': ['case', ['==', ['get', 'id_evento'], resaltadoId ?? ''], 1.35, 1],
              'symbol-sort-key': [
                'case',
                ['==', ['get', 'id_evento'], resaltadoId ?? ''],
                -1,
                ['match', ['get', 'confianza'], 'alta', 0, 'media', 1, 2],
              ],
            }}
            paint={{ 'icon-opacity': ['case', ['==', ['get', 'confianza'], 'baja'], 0.6, 1] }}
          />
        </Source>
      )}
      {enfoque && !activo && (
        <Popup
          longitude={enfoque.geometry.coordinates[0]}
          latitude={enfoque.geometry.coordinates[1]}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          className="mapa-tooltip"
          offset={18}
        >
          {`${enfoque.properties.titulo} · ${enfoque.properties.lugar} — clic para ver detalle`}
        </Popup>
      )}
      {activo && (
        <Popup
          longitude={activo.geometry.coordinates[0]}
          latitude={activo.geometry.coordinates[1]}
          anchor="bottom"
          maxWidth="360px"
          onClose={() => {
            setSeleccionado(null)
            onSeleccionRef.current?.(null)
          }}
          closeOnClick={false}
        >
          <PopupEvento propiedades={activo.properties} />
        </Popup>
      )}
    </>
  )
}
