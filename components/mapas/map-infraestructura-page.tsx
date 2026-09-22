'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import MapGL, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import { BasemapControl } from '@/components/mapas/basemap-control'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Indicadores } from '@/components/infraestructura/indicadores'
import { ListaAlertas } from '@/components/infraestructura/lista-alertas'
import { FichaAlerta } from '@/components/infraestructura/ficha-alerta'
import {
  InfraLayerControl,
  type CapaInfraestructura,
} from '@/components/mapas/layer-control'
import { InfraLegendPanel } from '@/components/mapas/legend-panel'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import {
  agregarEscuelasCaidasPorDepartamento,
  COLORES_DEPARTAMENTO,
  DEPARTAMENTOS_URL,
  LIMITES_CORRIENTES,
  MASCARA_COLOR,
  MASCARA_OPACIDAD,
  MASCARA_URL,
  normalizarNombreDepartamento,
} from '@/lib/mapas/departamentos'
import { ensureMapWorker } from '@/lib/map-worker'
import { useAlertas } from '@/lib/infraestructura/use-alertas'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { UMBRAL_SIN_REPORTAR_HORAS } from '@/lib/infraestructura/umbrales'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { esCategoria, type CategoriaProblematica } from '@/lib/infraestructura/categorias'
import type { EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'

ensureMapWorker()

// Fase 2 (parte-mapa): una escuela = un punto, no una capa por categoría. La
// capa vieja distinguía establecimiento/alumnos con símbolo (relleno/anillo);
// ahora esos dos canales están ocupados por severidad (color) y servicio
// (anillo, ver circlePaintPartes), y la categoría pasó a filtro + ficha.
const CAPA_PARTES_ID = 'infra-partes'

// F2.3: capa "sin reportar". Va DEBAJO de CAPA_PARTES_ID en el árbol (por eso
// se declara antes en el JSX) para que se lea como un halo alrededor del
// punto, no como algo que lo tapa. Es ausencia de información, no severidad:
// no toca color (esa escala es de severidad.ts), se resuelve con un anillo
// extra en un gris neutro que no aparece en ningún otro canal del mapa.
const CAPA_SIN_REPORTAR_ID = 'infra-sin-reportar'
const SIN_REPORTAR_COLOR = '#6b7280'
const SIN_REPORTAR_RADIO_EXTRA = 6

// F2.3: capa "evacuación". Se resuelve con Marker (DOM), no con una capa
// MapLibre, porque necesita dos FORMAS geométricas distintas (cuadrado vs.
// triángulo) para distinguir evacuado (daño) de centro_evacuados (recurso) —
// son semánticamente opuestos y en una emergencia el recurso es lo que más
// rápido se busca, así que no pueden compartir símbolo. Nada de iconos
// ilustrativos: son formas puras hechas con bordes CSS, en el mismo color
// neutro que ya usa el anillo de servicio (ANILLO_COLOR), para no introducir
// una segunda escala de color.
const CAPA_EVACUACION_ID = 'infra-evacuacion'
const SIMBOLO_EVACUACION_TAMANO = 12

// Límites departamentales. Se declaran antes que la capa de partes en el
// árbol de MapGL para que queden por debajo: son contexto geográfico, no el
// dato. El relleno es casi transparente a propósito — su función es que se
// distinga un departamento del otro, no competir con los puntos.
const CAPA_DEPARTAMENTOS_RELLENO_ID = 'infra-departamentos-relleno'
const CAPA_DEPARTAMENTOS_BORDE_ID = 'infra-departamentos-borde'

// Máscara: tapa todo lo que no es Corrientes. Va primera en el árbol, apenas
// encima del basemap, para que los departamentos y las alertas queden por
// arriba. Es lo que permite dejar el zoom libre: el usuario puede alejarse,
// pero afuera de la provincia no hay nada compitiendo por su atención.
const CAPA_MASCARA_ID = 'infra-mascara-provincia'

function fillPaintMascara(): FillLayerSpecification['paint'] {
  return {
    'fill-color': MASCARA_COLOR,
    'fill-opacity': MASCARA_OPACIDAD,
  }
}

// F2.4: el relleno departamental deja de tener opacidad fija (era pura
// decoración de contexto geográfico) y pasa a modular la CANTIDAD de
// escuelas con servicio caído (suspendido o parcial) en ese departamento —
// el color sigue siendo el único fijo (COLORES_DEPARTAMENTO.rellenoNormal),
// nunca se introduce una segunda escala de color. `escuelasCaidas` es una
// propiedad calculada en el cliente (ver useMemo de construirGeojsonDepartamentos
// más abajo) y unida al feature del GeoJSON; ['coalesce', ..., 0] cubre el
// instante entre el primer render (todavía no llegó el fetch del GeoJSON
// propio) y el momento en que el Source usa la URL directa sin esa
// propiedad — sin el coalesce, 'interpolate' rompe con null.
//
// Techo elegido a partir del dato sembrado (15 escuelas caídas repartidas en
// 26 departamentos): a partir de ESCUELAS_CAIDAS_TECHO en un mismo
// departamento ya es una concentración que amerita la intensidad máxima, no
// hace falta seguir escalando linealmente para valores más raros.
const ESCUELAS_CAIDAS_TECHO = 5
const OPACIDAD_DEPARTAMENTO_CAIDO_TECHO = 0.4

function fillPaintDepartamentos(): FillLayerSpecification['paint'] {
  return {
    'fill-color': COLORES_DEPARTAMENTO.rellenoNormal,
    'fill-opacity': [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'escuelasCaidas'], 0],
      0,
      COLORES_DEPARTAMENTO.opacidadRellenoNormal,
      ESCUELAS_CAIDAS_TECHO,
      OPACIDAD_DEPARTAMENTO_CAIDO_TECHO,
    ],
  }
}

// Etiqueta tipo "GOYA 3": nombre del departamento en mayúsculas, y el
// conteo sólo cuando hay escuelas caídas (mostrar "SAUCE 0" en los 20+
// departamentos sin ninguna es ruido, no contexto). `text-field` data-driven
// vía 'case' sobre la misma propiedad que ya alimenta la opacidad, así las
// dos lecturas del coroplético (intensidad de relleno y etiqueta) nunca
// pueden desincronizarse entre sí.
function symbolLayoutDepartamentos(): SymbolLayerSpecification['layout'] {
  return {
    'text-field': [
      'case',
      ['>', ['coalesce', ['get', 'escuelasCaidas'], 0], 0],
      ['concat', ['get', 'nombreMayus'], ' ', ['to-string', ['get', 'escuelasCaidas']]],
      ['get', 'nombreMayus'],
    ],
    'text-size': 11,
    'text-allow-overlap': false,
  }
}

function symbolPaintDepartamentos(): SymbolLayerSpecification['paint'] {
  return {
    'text-color': COLORES_DEPARTAMENTO.bordeNormal,
    'text-opacity': 0.85,
  }
}

// Resaltado del departamento bajo el cursor. Reusa los colores "seleccionado"
// del prototipo para no inventar un lenguaje visual nuevo. Es una capa aparte
// con un filtro por nombre en vez de feature-state: el GeoJSON no trae ids
// estables, y filtrar 25 polígonos es trivial.
const CAPA_DEPARTAMENTO_HOVER_ID = 'infra-departamento-hover'
const CAPA_DEPARTAMENTO_HOVER_BORDE_ID = 'infra-departamento-hover-borde'

function fillPaintDepartamentoHover(): FillLayerSpecification['paint'] {
  return {
    'fill-color': COLORES_DEPARTAMENTO.rellenoSeleccionado,
    'fill-opacity': COLORES_DEPARTAMENTO.opacidadRellenoSeleccionado,
  }
}

function linePaintDepartamentoHover(): LineLayerSpecification['paint'] {
  return {
    'line-color': COLORES_DEPARTAMENTO.bordeSeleccionado,
    'line-width': COLORES_DEPARTAMENTO.pesoLineaSeleccionado,
  }
}

function linePaintDepartamentos(): LineLayerSpecification['paint'] {
  return {
    'line-color': COLORES_DEPARTAMENTO.bordeNormal,
    'line-width': COLORES_DEPARTAMENTO.pesoLineaNormal,
    'line-opacity': 0.95,
  }
}

type FiltrosForm = {
  territorio: string
  nivel: string
  establecimiento: string
  motivo: string
  severidad: string
  categoria: string
  servicio: string
}

const FILTROS_VACIOS: FiltrosForm = {
  territorio: '',
  nivel: '',
  establecimiento: '',
  motivo: '',
  severidad: '',
  categoria: '',
  servicio: '',
}

// ── Radio: alumnos alcanzados, no cantidad de afectaciones ──────────────────
//
// Antes: 'circle-radius': ['get', 'radius'] con radius = 7 + min(len-1,5)*2,
// escalado por CANTIDAD de problemáticas del cue_anexo. Eso era una mentira
// visual: una escuela con una sola afectación gravísima y 900 alumnos se
// veía IGUAL que una con una afectación menor y 5 alumnos.
//
// Ahora escala por `alumnosAlcanzados`, en área, no en radio: el ojo compara
// el ÁREA de un círculo, no su radio (es la razón por la que los mapas de
// símbolos proporcionales —ver Flannery— interpolan sobre la raíz cuadrada
// del valor en vez del valor directo: área = π·r², así que r ∝ √valor
// mantiene el área proporcional al dato, mientras que r ∝ valor la
// exagera cuadráticamente).
//
// Piso y techo: RADIO_PISO=6 asegura que una escuela con alumnosAlcanzados
// === 0 (categoría "establecimiento" sin selección nominal) siga siendo un
// punto visible y clickeable, no un pixel. ALUMNOS_TECHO=800 y RADIO_TECHO=26
// son una escuela grande de la provincia (por encima de la matrícula típica
// de un establecimiento) — evita que una escuela excepcionalmente numerosa
// dibuje un círculo que tape a sus vecinas; por encima del techo el radio se
// achata (MapLibre extrapola el último tramo del interpolate).
const RADIO_PISO = 6
const RADIO_TECHO = 26
const ALUMNOS_TECHO = 800

// Anillo: color NEUTRO (el color ya está tomado por severidad, no se puede
// reusar acá sin generar una segunda escala). "suspendido" y "parcial" se
// distinguen por grosor + opacidad de trazo, no por color: MapLibre no
// soporta circle-stroke-dasharray, así que un trazo punteado real no es una
// opción. A zoom provincial un anillo grueso y sólido se distingue de uno
// fino y traslúcido incluso con varios puntos superpuestos; "normal" queda
// con el mismo trazo mínimo que ya traía el punto (línea de separación con
// el fondo), que a esa distancia se lee como "sin anillo".
const ANILLO_COLOR = '#1c1c1c'

function circlePaintPartes(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['sqrt', ['get', 'alumnosAlcanzados']],
      0,
      RADIO_PISO,
      Math.sqrt(ALUMNOS_TECHO),
      RADIO_TECHO,
    ],
    'circle-color': ['get', 'color'],
    'circle-opacity': 0.9,
    'circle-stroke-color': ANILLO_COLOR,
    'circle-stroke-width': ['match', ['get', 'servicio'], 'suspendido', 4, 'parcial', 2, 1],
    'circle-stroke-opacity': ['match', ['get', 'servicio'], 'suspendido', 1, 'parcial', 0.55, 0.9],
  }
}

type PropiedadesParte = {
  cueAnexo: string
  color: string
  servicio: EstadoServicioGeneral
  alumnosAlcanzados: number
}

// Función de módulo (no closure del componente) a propósito: así useMemo
// puede depender sólo de `partes` sin arrastrar warnings de exhaustive-deps
// por una función recreada en cada render.
function construirFeatureCollection(
  partes: ParteMapa[],
): FeatureCollection<Point, PropiedadesParte> {
  const features = partes
    .filter((parte) => parte.lat !== null && parte.lon !== null)
    .map((parte) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [parte.lon as number, parte.lat as number],
      },
      properties: {
        cueAnexo: parte.cueAnexo,
        color: colorSeveridad(parte.peorSeveridad),
        servicio: parte.servicio,
        alumnosAlcanzados: parte.alumnosAlcanzados,
      },
    }))
  return { type: 'FeatureCollection', features }
}

// Halo "sin reportar": mismo radio base que el punto (piso/techo por
// alumnosAlcanzados) más un margen fijo, para que se lea como un anillo
// alrededor de la escuela y no como un círculo aparte flotando cerca. Sin
// relleno (circle-color transparent): es sólo un borde, nunca compite con el
// color de severidad del punto que rodea.
function circlePaintSinReportar(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['sqrt', ['get', 'alumnosAlcanzados']],
      0,
      RADIO_PISO + SIN_REPORTAR_RADIO_EXTRA,
      Math.sqrt(ALUMNOS_TECHO),
      RADIO_TECHO + SIN_REPORTAR_RADIO_EXTRA,
    ],
    'circle-color': 'transparent',
    'circle-stroke-color': SIN_REPORTAR_COLOR,
    'circle-stroke-width': 2,
    'circle-stroke-opacity': 0.65,
  }
}

// "Sin reportar" se calcula acá, no en el servidor: el indicador agregado
// (indicadores.sinReportar) ya viaja en la respuesta, pero para dibujar el
// halo hace falta saber CUÁL parte individual cruzó el umbral, y esa
// información no se serializa aparte. UMBRAL_SIN_REPORTAR_HORAS es la misma
// constante que usa el servidor (parte-mapa.ts) para el indicador agregado:
// un solo lugar define "viejo", nunca dos criterios que puedan divergir.
function esSinReportar(parte: ParteMapa, ahoraMs: number): boolean {
  const umbralMs = UMBRAL_SIN_REPORTAR_HORAS * 60 * 60 * 1000
  return ahoraMs - new Date(parte.actualizadaEn).getTime() > umbralMs
}

function construirFeatureCollectionSinReportar(
  partes: ParteMapa[],
  ahoraMs: number,
): FeatureCollection<Point, Pick<PropiedadesParte, 'alumnosAlcanzados'>> {
  const features = partes
    .filter((parte) => parte.lat !== null && parte.lon !== null && esSinReportar(parte, ahoraMs))
    .map((parte) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [parte.lon as number, parte.lat as number],
      },
      properties: { alumnosAlcanzados: parte.alumnosAlcanzados },
    }))
  return { type: 'FeatureCollection', features }
}

// Estilo inline (no clase CSS): son dos formas puntuales, más simples que
// justificar una clase reusable por dos usos. Sólo bordes, sin relleno ni
// sombra (manual de marca: flat), en ANILLO_COLOR — el mismo neutro que ya
// usa el anillo de servicio, para no sumar un color más al mapa.
function estiloSimboloEvacuado(): CSSProperties {
  return {
    width: SIMBOLO_EVACUACION_TAMANO,
    height: SIMBOLO_EVACUACION_TAMANO,
    border: `2px solid ${ANILLO_COLOR}`,
    background: 'transparent',
    pointerEvents: 'none',
  }
}

// Triángulo vía bordes CSS (sin imagen, sin ícono, sin fuente): dos lados
// transparentes y un fondo sólido de color forman el triángulo. Es una forma
// geométrica pura, no un pictograma — cumple la restricción de "nada de
// emojis ni íconos ilustrativos" porque no representa nada figurativo, sólo
// codifica una categoría distinta a la del cuadrado.
function estiloSimboloCentroEvacuados(): CSSProperties {
  const mitad = SIMBOLO_EVACUACION_TAMANO / 2
  return {
    width: 0,
    height: 0,
    borderLeft: `${mitad}px solid transparent`,
    borderRight: `${mitad}px solid transparent`,
    borderBottom: `${SIMBOLO_EVACUACION_TAMANO}px solid ${ANILLO_COLOR}`,
    pointerEvents: 'none',
  }
}

const CAPAS_VISIBLES_DEFECTO: Record<CapaInfraestructura, boolean> = {
  escuelas: true,
  // Capas informativas nuevas: apagadas por defecto para no sumar ruido
  // visual al encuadre inicial. El director las prende cuando las necesita.
  evacuacion: false,
  sinReportar: false,
}

export default function MapInfraestructuraPage(props: { mostrarEnlaceNominal: boolean }) {
  const styles = useOverlayStyles()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [filtrosForm, setFiltrosForm] = useState<FiltrosForm>(FILTROS_VACIOS)
  const [seleccionCue, setSeleccionCue] = useState<string | null>(null)
  const [capasVisibles, setCapasVisibles] = useState(CAPAS_VISIBLES_DEFECTO)
  const [departamentoHover, setDepartamentoHover] = useState<{
    nombre: string
    lng: number
    lat: number
  } | null>(null)

  const filtros = useMemo(
    () => ({
      territorio: filtrosForm.territorio || undefined,
      nivel: filtrosForm.nivel || undefined,
      cueAnexo: filtrosForm.establecimiento || undefined,
      motivo: filtrosForm.motivo || undefined,
      severidad: filtrosForm.severidad || undefined,
      categoria:
        filtrosForm.categoria && esCategoria(filtrosForm.categoria)
          ? (filtrosForm.categoria as CategoriaProblematica)
          : undefined,
      servicio: (filtrosForm.servicio || undefined) as EstadoServicioGeneral | undefined,
    }),
    [filtrosForm],
  )

  const { data, loading, error } = useAlertas(filtros)

  // Un punto por escuela: la ficha y la lista seleccionan por cueAnexo, no
  // hace falta una agrupación intermedia como la que existía cuando un mismo
  // cue podía tener features en dos capas distintas.
  const partesPorCue = useMemo(() => {
    const map = new Map<string, ParteMapa>()
    for (const parte of data?.partes ?? []) map.set(parte.cueAnexo, parte)
    return map
  }, [data])

  const featureCollection = useMemo(
    () => construirFeatureCollection(data?.partes ?? []),
    [data],
  )

  // F2.3: `Date.now()` es impuro, así que no puede llamarse durante el
  // render (regla react-hooks/purity) — se toma en un efecto, disparado por
  // cada respuesta nueva de useAlertas, no en cada render (p. ej. mover el
  // mouse no debe recalcular ni parpadear el halo). Antes de que corra el
  // primer efecto, `ahoraMs` es null y el halo simplemente no dibuja nada
  // (mejor eso que fechar con un valor inventado).
  const [ahoraMs, setAhoraMs] = useState<number | null>(null)
  useEffect(() => {
    const id = setTimeout(() => setAhoraMs(Date.now()), 0)
    return () => clearTimeout(id)
  }, [data])

  const featureCollectionSinReportar = useMemo(
    () =>
      ahoraMs === null
        ? construirFeatureCollectionSinReportar([], 0)
        : construirFeatureCollectionSinReportar(data?.partes ?? [], ahoraMs),
    [data, ahoraMs],
  )

  const partesEvacuacion = useMemo(
    () =>
      (data?.partes ?? []).filter(
        (parte) =>
          parte.lat !== null &&
          parte.lon !== null &&
          (parte.estadoEstablecimiento === 'evacuado' ||
            parte.estadoEstablecimiento === 'centro_evacuados'),
      ),
    [data],
  )

  // F2.4: el GeoJSON de departamentos se pide una vez más, aparte del que ya
  // pide <Source> por URL, porque <Source> no expone sus features parseadas
  // de vuelta a React — sólo así se puede cruzar contra `data.partes` en el
  // cliente. Es la misma decisión que documenta la tarea: son 25 polígonos y
  // ~44 KB, pedirlos dos veces (uno cacheado por el browser) es barato al
  // lado de duplicar esa lógica de join en el servidor.
  const [departamentosRaw, setDepartamentosRaw] = useState<FeatureCollection<
    Polygon | MultiPolygon,
    { nombre: string }
  > | null>(null)

  useEffect(() => {
    let cancelado = false
    fetch(DEPARTAMENTOS_URL)
      .then((respuesta) => respuesta.json())
      .then((geojson: FeatureCollection<Polygon | MultiPolygon, { nombre: string }>) => {
        if (!cancelado) setDepartamentosRaw(geojson)
      })
      .catch(() => {
        // Si falla, <Source> igual pinta el GeoJSON por URL con el relleno
        // en su piso de opacidad (ver coalesce en fillPaintDepartamentos):
        // se pierde el coroplético, no el contexto geográfico de base.
      })
    return () => {
      cancelado = true
    }
  }, [])

  const { departamentosGeojson, departamentosSinMatch } = useMemo(() => {
    if (!departamentosRaw) return { departamentosGeojson: null, departamentosSinMatch: [] as string[] }

    const nombresConocidos = departamentosRaw.features.map((f) => f.properties.nombre)
    const escuelas = (data?.partes ?? []).map((parte) => ({
      departamento: parte.departamento,
      servicio: parte.servicio,
    }))
    const { escuelasCaidasPorDepartamento, departamentosSinMatch: sinMatch } =
      agregarEscuelasCaidasPorDepartamento(escuelas, nombresConocidos)

    // "Un departamento que no matchee no se silencia": además del warning en
    // consola (visible para quien opera/depura), sinMatch viaja como prop a
    // InfraLegendPanel para que también sea visible en la interfaz.
    if (sinMatch.length > 0) {
      console.error(
        '[mapa-infraestructura] departamento(s) sin match contra el GeoJSON:',
        sinMatch,
      )
    }

    const features = departamentosRaw.features.map((feature) => {
      const clave = normalizarNombreDepartamento(feature.properties.nombre)
      const escuelasCaidas = escuelasCaidasPorDepartamento.get(clave) ?? 0
      return {
        ...feature,
        properties: {
          ...feature.properties,
          escuelasCaidas,
          nombreMayus: feature.properties.nombre.toUpperCase(),
        },
      }
    })

    return {
      departamentosGeojson: { type: 'FeatureCollection' as const, features },
      departamentosSinMatch: sinMatch,
    }
  }, [departamentosRaw, data])

  const mapStyle = BASEMAPS[basemap].styleUrl
  const parteSeleccionado = seleccionCue ? (partesPorCue.get(seleccionCue) ?? null) : null
  const seleccionCoords =
    parteSeleccionado && parteSeleccionado.lat !== null && parteSeleccionado.lon !== null
      ? ([parteSeleccionado.lon, parteSeleccionado.lat] as [number, number])
      : null

  const capasInteractivas = capasVisibles.escuelas ? [CAPA_PARTES_ID] : []

  function handleClick(event: MapLayerMouseEvent) {
    const feature = (event.features ?? [])[0]
    if (!feature || !feature.properties) {
      setSeleccionCue(null)
      return
    }
    setSeleccionCue(String(feature.properties.cueAnexo))
  }

  // queryRenderedFeatures en vez de sumar la capa a interactiveLayerIds: si
  // el relleno departamental fuera interactivo, un click sobre el mapa vacío
  // devolvería un feature sin cueAnexo y handleClick seleccionaría "undefined".
  function handleMouseMove(event: MapLayerMouseEvent) {
    const mapa = mapRef.current
    if (!mapa) return
    const [encontrado] = mapa.queryRenderedFeatures(event.point, {
      layers: [CAPA_DEPARTAMENTOS_RELLENO_ID],
    })
    const nombre = encontrado?.properties?.nombre
    if (typeof nombre !== 'string') {
      setDepartamentoHover((prev) => (prev === null ? prev : null))
      return
    }
    setDepartamentoHover({ nombre, lng: event.lngLat.lng, lat: event.lngLat.lat })
  }

  function alternarCapa(capa: CapaInfraestructura, value: boolean) {
    setCapasVisibles((prev) => ({ ...prev, [capa]: value }))
  }

  function setFiltro<K extends keyof FiltrosForm>(campo: K, valor: FiltrosForm[K]) {
    setFiltrosForm((prev) => ({ ...prev, [campo]: valor }))
  }

  if (error && !data) {
    return (
      <div className={`${styles.status} ${styles.statusError}`}>{error}</div>
    )
  }

  return (
    <div className={styles.shell} ref={shellRef}>
      <div className={styles.mapRoot}>
        <MapGL
          ref={mapRef}
          mapStyle={mapStyle}
          // Encuadre inicial ajustado a la provincia. MAP_CENTER/MAP_ZOOM son
          // los del mapa de matrícula y dejaban a Corrientes descentrada y
          // demasiado cerca; acá el encuadre sale del bbox real del GeoJSON.
          initialViewState={{
            bounds: LIMITES_CORRIENTES,
            fitBoundsOptions: { padding: 24 },
          }}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={capasInteractivas}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setDepartamentoHover(null)}
          cursor="pointer"
        >
          <NavigationControl position="top-left" />

          <Source id="infra-mascara-src" type="geojson" data={MASCARA_URL}>
            <Layer id={CAPA_MASCARA_ID} type="fill" paint={fillPaintMascara()} />
          </Source>

          {/*
            F2.4: `data` pasa a ser el GeoJSON ya cruzado con `escuelasCaidas`
            (departamentosGeojson) apenas termina de resolverse el fetch +
            useMemo; hasta entonces cae a la URL, igual que antes — el
            coalesce de fillPaintDepartamentos cubre ese instante sin
            propiedad.
          */}
          <Source
            id="infra-departamentos-src"
            type="geojson"
            data={departamentosGeojson ?? DEPARTAMENTOS_URL}
          >
            <Layer
              id={CAPA_DEPARTAMENTOS_RELLENO_ID}
              type="fill"
              paint={fillPaintDepartamentos()}
            />
            <Layer
              id={CAPA_DEPARTAMENTOS_BORDE_ID}
              type="line"
              paint={linePaintDepartamentos()}
            />
            <Layer
              id={CAPA_DEPARTAMENTO_HOVER_ID}
              type="fill"
              paint={fillPaintDepartamentoHover()}
              filter={['==', ['get', 'nombre'], departamentoHover?.nombre ?? '']}
            />
            <Layer
              id={CAPA_DEPARTAMENTO_HOVER_BORDE_ID}
              type="line"
              paint={linePaintDepartamentoHover()}
              filter={['==', ['get', 'nombre'], departamentoHover?.nombre ?? '']}
            />
            <Layer
              id="infra-departamentos-etiqueta"
              type="symbol"
              layout={symbolLayoutDepartamentos()}
              paint={symbolPaintDepartamentos()}
            />
          </Source>

          {capasVisibles.sinReportar && (
            <Source id="infra-sin-reportar-src" type="geojson" data={featureCollectionSinReportar}>
              <Layer id={CAPA_SIN_REPORTAR_ID} type="circle" paint={circlePaintSinReportar()} />
            </Source>
          )}

          {capasVisibles.escuelas && (
            <Source id="infra-partes-src" type="geojson" data={featureCollection}>
              <Layer id={CAPA_PARTES_ID} type="circle" paint={circlePaintPartes()} />
            </Source>
          )}

          {capasVisibles.evacuacion &&
            partesEvacuacion.map((parte) => (
              <Marker
                key={parte.cueAnexo}
                longitude={parte.lon as number}
                latitude={parte.lat as number}
                anchor="bottom-left"
                offset={[SIMBOLO_EVACUACION_TAMANO / 2, -RADIO_TECHO]}
              >
                <div
                  data-capa={CAPA_EVACUACION_ID}
                  style={
                    parte.estadoEstablecimiento === 'evacuado'
                      ? estiloSimboloEvacuado()
                      : estiloSimboloCentroEvacuados()
                  }
                />
              </Marker>
            ))}

          {departamentoHover && (
            <Popup
              longitude={departamentoHover.lng}
              latitude={departamentoHover.lat}
              anchor="bottom"
              offset={14}
              closeButton={false}
              closeOnClick={false}
              className="mapa-tooltip-departamento"
            >
              {departamentoHover.nombre}
            </Popup>
          )}

          {seleccionCoords && (
            <Popup
              longitude={seleccionCoords[0]}
              latitude={seleccionCoords[1]}
              anchor="bottom"
              onClose={() => setSeleccionCue(null)}
              closeOnClick={false}
              maxWidth="390px"
            >
              <FichaAlerta
                parte={parteSeleccionado}
                mostrarEnlaceNominal={props.mostrarEnlaceNominal}
              />
            </Popup>
          )}
        </MapGL>
      </div>

      {data && <Indicadores indicadores={data.indicadores} loading={loading} />}

      {data && (
        <ListaAlertas
          partes={data.partes}
          filtros={filtrosForm}
          onFiltroChange={setFiltro}
          seleccionadaCue={seleccionCue}
          onSeleccionar={setSeleccionCue}
        />
      )}

      {/*
        La leyenda va fuera del stack de controles, como hermana: usa las
        clases map-panel/map-legend-panel, que son `position: absolute` con
        offsets propios (abajo a la izquierda). Adentro del stack — que también
        es absolute — se posicionaba respecto de él y se montaba encima de los
        otros dos controles. Mismo armado que el mapa de matrícula.
      */}
      {data && (
        <InfraLegendPanel
          indicadores={data.indicadores}
          departamentosSinMatch={departamentosSinMatch}
        />
      )}

      <div className={styles.controlsStack}>
        <BasemapControl value={basemap} onChange={setBasemap} />
        <InfraLayerControl capas={capasVisibles} onChange={alternarCapa} />
      </div>

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
