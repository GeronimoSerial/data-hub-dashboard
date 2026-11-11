'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Popup, type MapLayerMouseEvent } from 'react-map-gl/maplibre'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { useThemeMode } from '@/app/providers'
import MapReorganizacionPage from '@/components/mapas/map-reorganizacion-page'
import { idsInteractivos, resolverClic, type CaracteristicaClic } from '@/lib/reorganizacion/clics'
import {
  FILTROS_INICIALES,
  calcularIndicadores,
  filtrarEscuelas,
  opcionesFiltro,
  resaltarPorClasificacion,
  type FiltrosReorganizacion,
} from '@/lib/reorganizacion/filtros'
import { estiloDeFondo, FONDO_POR_DEFECTO, type FondoId } from '@/lib/reorganizacion/fondos'
import type { EscuelaV29, ReferenciaV29 } from '@/lib/reorganizacion/tipos'
import { etiquetaDeZona, miembrosPorZona, tendenciaPorZona } from '@/lib/reorganizacion/zonas'
import { CapasReorganizacion, type VisibilidadCapas } from './capas-reorganizacion'
import { FichaEscuela } from './ficha-escuela'
import { FichaReferencia } from './ficha-referencia'
import { FichaZona } from './ficha-zona'
import { MetodologiaReorganizacion } from './metodologia-reorganizacion'
import { PanelCapasReorganizacion } from './panel-capas-reorganizacion'
import { PanelRecorrido } from './panel-recorrido'
import { PanelReorganizacion } from './panel-reorganizacion'
import { SidebarReorganizacion } from './sidebar-reorganizacion'
import { useDatasetReorganizacion } from './use-dataset-reorganizacion'
import { useRecorrido, type PuntoRecorrido } from './use-recorrido'

/** AAAA-MM-DD a DD/MM/AAAA sin pasar por la zona horaria del navegador. */
function formatearCorte(corte: string): string {
  const [anio, mes, dia] = corte.split('-')
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : corte
}

/** Zoom al ubicar un establecimiento desde la ficha o el listado. */
const ZOOM_ACERCAR = 12

const SIN_ESCUELAS: EscuelaV29[] = []
const SIN_REFERENCIAS: ReferenciaV29[] = []
const VISIBLES_INICIALES: VisibilidadCapas = { zonas: true, otrasPrimarias: true, secundarias: true }

/** Selección activa: un establecimiento (escuela o referencia) o una zona por su etiqueta. */
export type Seleccion =
  | { tipo: 'escuela' | 'referencia'; id: string }
  | { tipo: 'zona'; id: string }
  | null

export interface ContenedorReorganizacionProps {
  visible?: boolean
}

/**
 * Contenedor del mapa de reorganización: dueño del estado y cableado de las
 * piezas de datos, capas, fichas y recorridos. Las reglas viven en `lib/`.
 */
export function ContenedorReorganizacion({ visible = true }: ContenedorReorganizacionProps) {
  const { dataset } = useDatasetReorganizacion()
  const recorrido = useRecorrido()
  const { mode } = useThemeMode()
  const tema = mode === 'dark' ? 'oscuro' : 'claro'

  const [filtros, setFiltros] = useState<FiltrosReorganizacion>(FILTROS_INICIALES)
  const [clasificacion, setClasificacion] = useState('')
  const [seleccion, setSeleccion] = useState<Seleccion>(null)
  const [visibles, setVisibles] = useState<VisibilidadCapas>(VISIBLES_INICIALES)
  const [fondo, setFondo] = useState<FondoId>(FONDO_POR_DEFECTO)
  const mapaRef = useRef<MaplibreMap | null>(null)

  const escuelas = dataset?.escuelas ?? SIN_ESCUELAS
  const referencias = dataset?.referencias ?? SIN_REFERENCIAS

  // Las zonas se calculan sobre el universo completo: el filtro nunca altera sus totales.
  const tendencias = useMemo(() => tendenciaPorZona(escuelas), [escuelas])
  const miembrosZona = useMemo(() => miembrosPorZona(escuelas), [escuelas])
  const resultado = useMemo(
    () => filtrarEscuelas(escuelas, filtros, { tendenciaPorZona: tendencias }),
    [escuelas, filtros, tendencias],
  )
  const indicadores = useMemo(() => calcularIndicadores(resultado.escuelas), [resultado])
  const resaltados = useMemo(
    () => resaltarPorClasificacion(resultado.escuelas, clasificacion),
    [resultado, clasificacion],
  )
  const opciones = useMemo(() => opcionesFiltro(escuelas), [escuelas])
  const porCue = useMemo(() => new Map(escuelas.map((e) => [e.cue, e])), [escuelas])
  const referenciaPorCue = useMemo(() => new Map(referencias.map((r) => [r.cue, r])), [referencias])
  const interactivas = useMemo(() => idsInteractivos(visibles), [visibles])

  const medindo = recorrido.estado !== 'inactivo'
  const eligiendo = recorrido.estado === 'eligiendo_origen' || recorrido.estado === 'eligiendo_destino'

  function puntoDe(tipo: 'escuela' | 'referencia', cue: string): PuntoRecorrido | null {
    const establecimiento = tipo === 'escuela' ? porCue.get(cue) : referenciaPorCue.get(cue)
    if (!establecimiento || !Number.isFinite(establecimiento.lat) || !Number.isFinite(establecimiento.lon)) {
      return null
    }
    return { cue, nombre: establecimiento.nombre, lat: establecimiento.lat, lon: establecimiento.lon }
  }

  // Durante la medición de origen o destino, el establecimiento elegido es el punto del recorrido.
  function abrirEstablecimiento(tipo: 'escuela' | 'referencia', cue: string) {
    if (eligiendo) {
      const punto = puntoDe(tipo, cue)
      if (punto) recorrido.elegirPunto(punto)
      return
    }
    setSeleccion({ tipo, id: cue })
  }

  function alHacerClic(e: MapLayerMouseEvent) {
    const caracteristicas: CaracteristicaClic[] = (e.features ?? []).map((f) => ({
      layer: f.layer.id,
      properties: f.properties ?? {},
    }))
    const resuelto = resolverClic(caracteristicas)
    if (!resuelto) {
      setSeleccion(null)
      return
    }
    if (resuelto.tipo === 'zona') {
      setSeleccion({ tipo: 'zona', id: etiquetaDeZona(resuelto.id) })
      return
    }
    abrirEstablecimiento(resuelto.tipo, resuelto.cue)
  }

  const acercar = useCallback(
    (cue: string) => {
      const establecimiento = porCue.get(cue) ?? referenciaPorCue.get(cue)
      if (!establecimiento || !mapaRef.current) return
      mapaRef.current.flyTo({ center: [establecimiento.lon, establecimiento.lat], zoom: ZOOM_ACERCAR })
    },
    [porCue, referenciaPorCue],
  )

  const escuelaSeleccionada = seleccion?.tipo === 'escuela' ? porCue.get(seleccion.id) : undefined
  const referenciaSeleccionada = seleccion?.tipo === 'referencia' ? referenciaPorCue.get(seleccion.id) : undefined
  const zonaSeleccionada = seleccion?.tipo === 'zona' ? seleccion.id : null

  // El mapa resalta solo escuelas y referencias; una zona no tiene anillo de selección.
  const seleccionEnMapa = seleccion && seleccion.tipo !== 'zona' ? seleccion.id : null

  const recorridoMapa =
    recorrido.resultado && recorrido.origen && recorrido.destino
      ? { origen: recorrido.origen, destino: recorrido.destino, geometria: recorrido.resultado.geometria }
      : null

  const fichaEstablecimiento = escuelaSeleccionada ? (
    <FichaEscuela
      escuela={escuelaSeleccionada}
      oferta={dataset?.ofertaPorCue[escuelaSeleccionada.cue]}
      onCerrar={() => setSeleccion(null)}
      onOrigen={(cue) => {
        const punto = puntoDe('escuela', cue)
        if (punto) recorrido.fijarOrigen(punto)
      }}
      onDestino={(cue) => {
        const punto = puntoDe('escuela', cue)
        if (punto) recorrido.fijarDestino(punto)
      }}
      onAcercar={acercar}
      recorridoActivo={medindo}
    />
  ) : referenciaSeleccionada ? (
    <FichaReferencia
      referencia={referenciaSeleccionada}
      oferta={dataset?.ofertaPorCue[referenciaSeleccionada.cue]}
      onCerrar={() => setSeleccion(null)}
      onOrigen={(cue) => {
        const punto = puntoDe('referencia', cue)
        if (punto) recorrido.fijarOrigen(punto)
      }}
      onDestino={(cue) => {
        const punto = puntoDe('referencia', cue)
        if (punto) recorrido.fijarDestino(punto)
      }}
      onAcercar={acercar}
      recorridoActivo={medindo}
    />
  ) : null
  const puntoSeleccionado = escuelaSeleccionada ?? referenciaSeleccionada

  const detalle = zonaSeleccionada ? (
    <FichaZona
      etiqueta={zonaSeleccionada}
      miembros={miembrosZona.get(zonaSeleccionada) ?? SIN_ESCUELAS}
      onCerrar={() => setSeleccion(null)}
      onSeleccionarEscuela={(cue) => abrirEstablecimiento('escuela', cue)}
    />
  ) : undefined


  const panel = dataset ? (
    <SidebarReorganizacion
      subtitulo={`Primaria común, 1 a 10 alumnos. Corte ${formatearCorte(dataset.corte)}`}
      accionEncabezado={<MetodologiaReorganizacion dataset={dataset} />}
      detalle={detalle}
      onCerrarDetalle={() => setSeleccion(null)}
      escuelas={
        <PanelReorganizacion
          escuelasFiltradas={resultado.escuelas}
          totalEscuelas={escuelas.length}
          filtros={filtros}
          onFiltros={setFiltros}
          opciones={opciones}
          indicadores={indicadores}
          clasificacion={clasificacion}
          onClasificacion={setClasificacion}
          cantidadResaltadas={resaltados.cantidad}
          seleccionada={seleccionEnMapa}
          resaltadas={resaltados.cues}
          onSeleccionarEscuela={(cue) => {
            abrirEstablecimiento('escuela', cue)
            acercar(cue)
          }}
        />
      }
      capas={<PanelCapasReorganizacion visibles={visibles} onVisibles={setVisibles} fondo={fondo} onFondo={setFondo} />}
      recorrido={
        <PanelRecorrido
          estado={recorrido.estado}
          origen={recorrido.origen}
          destino={recorrido.destino}
          resultado={recorrido.resultado}
          error={recorrido.error}
          onActivar={recorrido.activar}
          onDesactivar={recorrido.desactivar}
          onLimpiar={recorrido.limpiar}
          onReintentar={() => {
            if (recorrido.destino) recorrido.fijarDestino(recorrido.destino)
          }}
        />
      }
    />
  ) : undefined

  return (
    <MapReorganizacionPage
      visible={visible}
      mapStyle={estiloDeFondo(fondo)}
      onMapLoad={(mapa) => {
        mapaRef.current = mapa
      }}
      interactiveLayerIds={interactivas}
      onMapClick={alHacerClic}
      panel={panel}
    >
      {fichaEstablecimiento && puntoSeleccionado && (
        <Popup
          longitude={puntoSeleccionado.lon}
          latitude={puntoSeleccionado.lat}
          anchor="bottom"
          offset={14}
          maxWidth="none"
          closeButton={false}
          closeOnClick={false}
          onClose={() => setSeleccion(null)}
        >
          <div className="map-popup rz-popup">{fichaEstablecimiento}</div>
        </Popup>
      )}
      {dataset && (
        <CapasReorganizacion
          dataset={dataset}
          idsCoincidentes={resultado.idsCoincidentes}
          hayFiltroActivo={resultado.seleccionActiva}
          resaltados={resaltados.cues}
          seleccionada={seleccionEnMapa}
          visibles={visibles}
          recorrido={recorridoMapa}
          tema={tema}
        />
      )}
    </MapReorganizacionPage>
  )
}
