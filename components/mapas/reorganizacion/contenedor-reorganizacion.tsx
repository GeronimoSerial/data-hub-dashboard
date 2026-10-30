'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { useThemeMode } from '@/app/providers'
import MapReorganizacionPage from '@/components/mapas/map-reorganizacion-page'
import { Checkbox } from '@/components/ui/checkbox'
import type { BasemapId } from '@/lib/map-types'
import { ETIQUETAS_CAPAS } from '@/lib/reorganizacion/capas'
import { idsInteractivos, resolverClic, type CaracteristicaClic } from '@/lib/reorganizacion/clics'
import {
  FILTROS_INICIALES,
  calcularIndicadores,
  filtrarEscuelas,
  opcionesFiltro,
  resaltarPorClasificacion,
  type FiltrosReorganizacion,
} from '@/lib/reorganizacion/filtros'
import { estiloDeFondo, FONDO_POR_DEFECTO } from '@/lib/reorganizacion/fondos'
import type { EscuelaV29, ReferenciaV29 } from '@/lib/reorganizacion/tipos'
import { etiquetaDeZona, miembrosPorZona, tendenciaPorZona } from '@/lib/reorganizacion/zonas'
import { CapasReorganizacion, type VisibilidadCapas } from './capas-reorganizacion'
import { FichaEscuela } from './ficha-escuela'
import { FichaReferencia } from './ficha-referencia'
import { FichaZona } from './ficha-zona'
import { LeyendaReorganizacion } from './leyenda-reorganizacion'
import { MetodologiaReorganizacion } from './metodologia-reorganizacion'
import { PanelRecorrido } from './panel-recorrido'
import { PanelReorganizacion } from './panel-reorganizacion'
import { SelectorFondo } from './selector-fondo'
import { useDatasetReorganizacion } from './use-dataset-reorganizacion'
import { useRecorrido, type PuntoRecorrido } from './use-recorrido'

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
  const [fondo, setFondo] = useState<BasemapId>(FONDO_POR_DEFECTO)
  const [plegado, setPlegado] = useState(false)
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

  const panel = dataset ? (
    <>
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
        onSeleccionarEscuela={(cue) => abrirEstablecimiento('escuela', cue)}
        plegado={plegado}
        onPlegado={setPlegado}
      />
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
      <fieldset>
        <legend>Capas</legend>
        <Checkbox
          label={ETIQUETAS_CAPAS.zonas}
          checked={visibles.zonas}
          onCheckedChange={(marcado) => setVisibles((v) => ({ ...v, zonas: marcado }))}
        />
        <Checkbox
          label={ETIQUETAS_CAPAS.otrasPrimarias}
          checked={visibles.otrasPrimarias}
          onCheckedChange={(marcado) => setVisibles((v) => ({ ...v, otrasPrimarias: marcado }))}
        />
        <Checkbox
          label={ETIQUETAS_CAPAS.secundarias}
          checked={visibles.secundarias}
          onCheckedChange={(marcado) => setVisibles((v) => ({ ...v, secundarias: marcado }))}
        />
      </fieldset>
      <SelectorFondo valor={fondo} onCambio={setFondo} />
      {escuelaSeleccionada && (
        <FichaEscuela
          escuela={escuelaSeleccionada}
          oferta={dataset.ofertaPorCue[escuelaSeleccionada.cue]}
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
      )}
      {referenciaSeleccionada && (
        <FichaReferencia
          referencia={referenciaSeleccionada}
          oferta={dataset.ofertaPorCue[referenciaSeleccionada.cue]}
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
      )}
      {zonaSeleccionada && (
        <FichaZona
          etiqueta={zonaSeleccionada}
          miembros={miembrosZona.get(zonaSeleccionada) ?? SIN_ESCUELAS}
          onCerrar={() => setSeleccion(null)}
          onSeleccionarEscuela={(cue) => abrirEstablecimiento('escuela', cue)}
        />
      )}
      <MetodologiaReorganizacion dataset={dataset} />
      <LeyendaReorganizacion
        capasVisibles={{
          zonas: visibles.zonas,
          otrasPrimarias: visibles.otrasPrimarias,
          secundarias: visibles.secundarias,
        }}
      />
    </>
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
