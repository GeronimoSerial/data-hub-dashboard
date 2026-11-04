'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MatriculaNatalidadPanel } from './matricula-natalidad-panel'
import { RenaperNatalidadPanel, type DatosRenaperNatalidad } from './renaper-natalidad-panel'
import type { DatosMatriculaNatalidad } from '@/lib/mapas/matricula-natalidad'
import MapGL, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import type {
  CircleLayerSpecification,
  DataDrivenPropertyValueSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import { NatalidadEscuelaSearchBox } from '@/components/mapas/natalidad-escuela-search-box'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { SegmentedGroup, SegmentedItem } from '@/components/ui/toggle-group'
import { BASEMAPS } from '@/lib/map-types'
import { ensureMapWorker } from '@/lib/map-worker'
import { fmt, fmtPct } from '@/lib/mapas/estadisticas-natalidad'
import {
  DEPARTAMENTOS_URL,
  LIMITES_CORRIENTES,
  MASCARA_URL,
  fillPaintMascara,
  linePaintDepartamentoHover,
  linePaintDepartamentos,
  normalizarNombreDepartamento,
} from '@/lib/mapas/departamentos'
import {
  calcularVariacion,
  COLOR_SIN_DATO,
  colorSecuencial,
  colorVariacion,
  construirEscalaSecuencial,
  construirPuntosSparkline,
  ESCALA_VARIACION_BREAKS,
  ESCALA_VARIACION_COLORS,
  opcionesAnioDesde,
  opcionesAnioHasta,
  type DatosNatalidad,
  type DepartamentoNatalidad,
  type EscuelaProperties,
  type Nivel,
  type SerieAnual,
  type Variacion,
} from '@/lib/mapas/natalidad'

// Feedback 2026-09-25: el popup de departamento sólo compara la natalidad
// contra los niveles que efectivamente recibe esa cohorte (Inicial primero,
// Primario después) — Secundario/Superior/Servicios Educativos no son
// relevantes acá y se sacaron del popup (el filtro de nivel de las escuelas
// en el mapa sigue mostrando los 5 niveles, esto sólo recorta el resumen).
const NIVELES_POPUP_DEPARTAMENTO: Nivel[] = ['Inicial', 'Primario']

ensureMapWorker()

// ── IDs de capas ─────────────────────────────────────────────────────────
const CAPA_MASCARA_ID = 'natalidad-mascara'
const CAPA_DEPARTAMENTOS_RELLENO_ID = 'natalidad-departamentos-relleno'
const CAPA_DEPARTAMENTOS_BORDE_ID = 'natalidad-departamentos-borde'
const CAPA_DEPARTAMENTO_HOVER_ID = 'natalidad-departamento-hover'
const CAPA_ESCUELAS_ID = 'natalidad-escuelas'
const CAPA_ESCUELAS_CLUSTER_ID = 'natalidad-escuelas-cluster'
const CAPA_ESCUELAS_CLUSTER_COUNT_ID = 'natalidad-escuelas-cluster-count'
const CAPA_ESCUELA_RESALTADA_ID = 'natalidad-escuela-resaltada'

// Zoom al que supercluster deja de agrupar puntos individuales — mismo
// umbral que usa el mapa de infraestructura (map-infraestructura-page.tsx)
// para el mismo volumen de puntos (~2000).
const CAPA_ESCUELAS_CLUSTER_MAX_ZOOM = 12

type ModoMetrica = 'anio' | 'variacion'

// Color teal (#0f766e) reservado para inicial — es la comparación central
// del mapa (nacimientos vs. oferta de inicial), así que se mantiene
// distinguible de cualquier otro nivel incluso agrupada en un cluster.
const COLOR_INICIAL = '#0f766e'
const COLOR_ESCUELA_DEFAULT = '#64748b'

// Puntos individuales: las escuelas con oferta de inicial se dibujan más
// grandes y en teal, el resto en gris neutro — ver COLOR_INICIAL arriba.
function circlePaintEscuelas(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': ['case', ['==', ['get', 'esInicial'], true], 5, 3.5],
    'circle-color': ['case', ['==', ['get', 'esInicial'], true], COLOR_INICIAL, COLOR_ESCUELA_DEFAULT],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1,
    'circle-opacity': 0.85,
  }
}

// El radio del cluster sube por tramos con la cantidad de escuelas agrupadas
// (mismo patrón que expresionRadioCluster en map-infraestructura-page.tsx).
function expresionRadioClusterEscuelas(): DataDrivenPropertyValueSpecification<number> {
  return ['step', ['get', 'point_count'], 14, 10, 20, 50, 26] as unknown as DataDrivenPropertyValueSpecification<number>
}

// Un cluster se pinta en teal si agrupa AL MENOS UNA escuela con oferta de
// inicial (semántica OR vía clusterProperties `esInicialEnCluster` con
// max()), igual gris neutro si no.
function circlePaintClusterEscuelas(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': expresionRadioClusterEscuelas(),
    'circle-color': ['case', ['==', ['get', 'esInicialEnCluster'], 1], COLOR_INICIAL, COLOR_ESCUELA_DEFAULT],
    'circle-opacity': 0.85,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1,
  }
}

function symbolLayoutClusterCount(): SymbolLayerSpecification['layout'] {
  return {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-size': 12,
    'text-font': ['Noto Sans Regular'],
    'text-allow-overlap': false,
  }
}

/** Mini sparkline SVG 2014–2023: puros trazos, sin librería de gráficos (una serie de 10 puntos no lo justifica). */
function Sparkline({ serie, anios }: { serie: DepartamentoNatalidad['serie']; anios: number[] }) {
  const width = 160
  const height = 36
  const puntos = construirPuntosSparkline(serie, anios, width, height)
  const path = puntos.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Serie de nacidos vivos 2014-2023">
      <path d={path} fill="none" stroke="#1d4ed8" strokeWidth={1.5} />
    </svg>
  )
}

/** Selector de año (Select con primitivas del proyecto) reutilizado por el modo "año" y por el par "Desde/Hasta" del modo "variación". */
function AnioSelect({
  label,
  anios,
  value,
  onChange,
}: {
  label: string
  anios: number[]
  value: number | null
  onChange: (anio: number) => void
}) {
  const items = useMemo(() => Object.fromEntries(anios.map((anio) => [String(anio), String(anio)])), [anios])
  return (
    <div className="map-filtro-campo">
      <span className="map-filtro-label">{label}</span>
      <Select
        value={value != null ? String(value) : undefined}
        items={items}
        onValueChange={(next) => next != null && onChange(Number(next))}
      >
        <SelectTrigger className="map-filtro-input" aria-label={label} />
        <SelectContent>
          {anios.map((anio) => (
            <SelectItem key={anio} value={String(anio)}>
              {anio}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** "vs. {anio}: {pct}" — nunca "vs. 0%" fabricado cuando el año base no tiene dato (calcularVariacion ya devuelve pct: null en ese caso). */
function fmtVariacionContra(anioBase: number, variacion: Variacion): string {
  return `vs. ${anioBase}: ${fmtPct(variacion.pct)}`
}

interface MapNatalidadPageProps {
  /** Pestaña "Mapa" activa (ver app/(hub)/mapas/natalidad/map-client.tsx). El
      mapa nunca se desmonta al cambiar de pestaña, así que esto es lo único
      que distingue "visible" de "oculto detrás de Estadísticas". */
  visible?: boolean
}

export default function MapNatalidadPage({ visible = true }: MapNatalidadPageProps) {
  const styles = useOverlayStyles()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)

  const [datos, setDatos] = useState<DatosNatalidad | null>(null)
  const [escuelas, setEscuelas] = useState<FeatureCollection<Point, EscuelaProperties> | null>(null)
  const [departamentosGeojson, setDepartamentosGeojson] = useState<FeatureCollection<
    Polygon | MultiPolygon,
    { nombre: string }
  > | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [matricula, setMatricula] = useState<DatosMatriculaNatalidad | null>(null)
  const [errorMatricula, setErrorMatricula] = useState(false)
  const [renaper, setRenaper] = useState<DatosRenaperNatalidad | null>(null)
  const [errorRenaper, setErrorRenaper] = useState(false)

  const [modo, setModo] = useState<ModoMetrica>('anio')
  const [anioSeleccionado, setAnioSeleccionado] = useState<number | null>(null)
  const [anioVariacionA, setAnioVariacionA] = useState<number | null>(null)
  const [anioVariacionB, setAnioVariacionB] = useState<number | null>(null)
  const [departamentoSeleccionado, setDepartamentoSeleccionado] = useState<{
    clave: string
    lng: number
    lat: number
  } | null>(null)
  const [escuelaSeleccionada, setEscuelaSeleccionada] = useState<{
    props: EscuelaProperties
    lng: number
    lat: number
  } | null>(null)
  // Escuela resaltada por el buscador (T10): un círculo aparte, no un estado
  // de la capa de clusters — el marcador buscado puede estar agrupado en un
  // cluster hasta que el flyTo termine de acercar el zoom.
  const [escuelaResaltada, setEscuelaResaltada] = useState<{ lng: number; lat: number } | null>(null)
  // Ver handleLoad/efecto de `visible` más abajo: sólo un fit hecho con el
  // contenedor en tamaño real (no display:none) cuenta como válido.
  const fitValidoRef = useRef(false)

  useEffect(() => {
    let cancelado = false
    Promise.all([
      fetch('/data/natalidad/departamentos.json').then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar departamentos.json')
        return r.json() as Promise<DatosNatalidad>
      }),
      fetch('/data/natalidad/escuelas.geojson').then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar escuelas.geojson')
        return r.json() as Promise<FeatureCollection<Point, EscuelaProperties>>
      }),
      fetch(DEPARTAMENTOS_URL).then((r) => r.json()) as Promise<
        FeatureCollection<Polygon | MultiPolygon, { nombre: string }>
      >,
    ])
      .then(([datosNatalidad, escuelasTodas, departamentos]) => {
        if (cancelado) return
        setDatos(datosNatalidad)
        setEscuelas(escuelasTodas)
        setDepartamentosGeojson(departamentos)
        setAnioSeleccionado(datosNatalidad.meta.anioFin)
        setAnioVariacionA(datosNatalidad.meta.anioInicio)
        setAnioVariacionB(datosNatalidad.meta.anioFin)
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof Error ? err.message : 'Error al cargar los datos')
      })
    return () => {
      cancelado = true
    }
  }, [])

  useEffect(() => {
    let cancelado = false
    fetch('/data/natalidad/matricula.json')
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo cargar la matrícula')
        return response.json() as Promise<DatosMatriculaNatalidad>
      })
      .then((data) => { if (!cancelado) setMatricula(data) })
      .catch(() => { if (!cancelado) setErrorMatricula(true) })
    fetch('/data/natalidad/renaper.json')
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo cargar RENAPER')
        return response.json() as Promise<DatosRenaperNatalidad>
      })
      .then((data) => { if (!cancelado) setRenaper(data) })
      .catch(() => { if (!cancelado) setErrorRenaper(true) })
    return () => { cancelado = true }
  }, [])

  const departamentosPorClave = useMemo(() => {
    if (!datos) return new Map<string, DepartamentoNatalidad>()
    return new Map(datos.departamentos.map((d) => [d.clave, d]))
  }, [datos])

  // Escala secuencial (nacimientos en el año elegido): cuantiles sobre los
  // 25 departamentos, recalculada cada vez que cambia el año.
  const escalaAnio = useMemo(() => {
    if (!datos || anioSeleccionado == null) return null
    const valores = datos.departamentos.map((d) => d.serie[String(anioSeleccionado)] ?? 0)
    return construirEscalaSecuencial(valores)
  }, [datos, anioSeleccionado])

  // Bug corregido (2026-09-25): la leyenda de "Variación %" mostraba sólo la
  // fila "Sin dato" (siempre, incluso cuando ningún departamento la tenía) y
  // nunca los tramos de color divergentes — se agregan abajo en el render
  // (ESCALA_VARIACION_BREAKS/COLORS) y esta fila pasa a ser condicional.
  const hayVariacionSinDato = useMemo(() => {
    if (!datos || anioVariacionA == null) return false
    return datos.departamentos.some((d) => (d.serie[String(anioVariacionA)] ?? 0) <= 0)
  }, [datos, anioVariacionA])

  const departamentosConDato = useMemo(() => {
    if (!departamentosGeojson) return null

    const features = departamentosGeojson.features.map((feature) => {
      const clave = normalizarNombreDepartamento(feature.properties.nombre)
      const dpto = departamentosPorClave.get(clave)

      let valor: number | null = null
      let color = COLOR_SIN_DATO

      if (dpto) {
        if (modo === 'anio' && anioSeleccionado != null && escalaAnio) {
          valor = dpto.serie[String(anioSeleccionado)] ?? 0
          color = colorSecuencial(valor, escalaAnio)
        } else if (modo === 'variacion' && anioVariacionA != null && anioVariacionB != null) {
          const a = dpto.serie[String(anioVariacionA)] ?? 0
          const b = dpto.serie[String(anioVariacionB)] ?? 0
          const pct = a > 0 ? ((b - a) / a) * 100 : null
          valor = pct
          color = colorVariacion(pct)
        }
      }

      return {
        ...feature,
        properties: { ...feature.properties, clave, valor, color },
      }
    })

    return { type: 'FeatureCollection' as const, features }
  }, [departamentosGeojson, departamentosPorClave, modo, anioSeleccionado, anioVariacionA, anioVariacionB, escalaAnio])

  // Rango efectivo del resumen (T10, corrección 2026-09-25): el panel de
  // título y el popup de departamento mostraban siempre la variación fija
  // meta.anioInicio→meta.anioFin, ignorando los controles. Ahora siguen el
  // modo activo: en "año" es meta.anioInicio→año elegido (elegimos el primer
  // año de la serie como base, no el año anterior, para que sea válido
  // incluso cuando el año elegido es el primero — 0% explícito en vez de
  // "sin dato anterior"); en "variación" es el propio par Desde/Hasta.
  const rangoResumen =
    datos && modo === 'anio' && anioSeleccionado != null
      ? { desde: datos.meta.anioInicio, hasta: anioSeleccionado }
      : datos && modo === 'variacion' && anioVariacionA != null && anioVariacionB != null
        ? { desde: anioVariacionA, hasta: anioVariacionB }
        : null

  const variacionProvincialResumen: Variacion | null =
    datos && rangoResumen ? calcularVariacion(datos.provincia.serie, rangoResumen.desde, rangoResumen.hasta) : null

  function valorSerie(serie: SerieAnual, anio: number): number {
    return serie[String(anio)] ?? 0
  }

  // Guarda "Hasta > Desde" (T10): cambiar un extremo del par nunca deja el
  // otro en un estado inválido — si el nuevo valor lo invalida, el otro
  // extremo se ajusta al año válido más cercano.
  function handleCambiarDesde(nuevoDesde: number) {
    setAnioVariacionA(nuevoDesde)
    if (anioVariacionB != null && anioVariacionB <= nuevoDesde) {
      const opciones = datos ? opcionesAnioHasta(datos.meta.anios, nuevoDesde) : []
      setAnioVariacionB(opciones[0] ?? null)
    }
  }

  function handleCambiarHasta(nuevoHasta: number) {
    setAnioVariacionB(nuevoHasta)
    if (anioVariacionA != null && anioVariacionA >= nuevoHasta) {
      const opciones = datos ? opcionesAnioDesde(datos.meta.anios, nuevoHasta) : []
      setAnioVariacionA(opciones[opciones.length - 1] ?? null)
    }
  }

  // T11 (perf/bug): `initialViewState.bounds` sólo se evalúa una vez, al
  // construir el mapa — si en ese momento el contenedor todavía no tiene su
  // tamaño final (layout del shell sin asentar, montaje detrás de la pestaña
  // "Estadísticas", etc.) MapLibre calcula el fit contra un canvas equivocado
  // y el resultado observado es la vista abierta con toda Sudamérica en vez
  // de Corrientes. `onLoad` corre después de que el mapa ya resolvió su
  // tamaño real, así que repetir el fit ahí (sin animación, `duration: 0`)
  // corrige el encuadre inicial de forma confiable sin depender de que
  // `initialViewState` haya visto el tamaño correcto.
  function handleLoad() {
    const mapa = mapRef.current?.getMap()
    if (!mapa) return
    mapa.resize()
    mapa.fitBounds(LIMITES_CORRIENTES, { padding: 24, duration: 0 })
    // Si `onLoad` corrió con el contenedor oculto (deep link #estadisticas:
    // el mapa se monta detrás de la pestaña "Mapa" desde el arranque), el
    // `resize()`/`fitBounds()` de arriba corrieron contra un canvas 0×0 y no
    // cuentan — el efecto de `visible` de abajo repite el fit la primera vez
    // que el contenedor realmente se muestra.
    fitValidoRef.current = visible
  }

  // T11 (perf): al ocultar la pestaña "Mapa" (mapa sigue montado con
  // [hidden], nunca se desmonta) cortamos cualquier transición de cámara en
  // curso con `map.stop()` — si el usuario buscó una escuela justo antes de
  // cambiar de pestaña, el flyTo en curso quedaría animando sobre un
  // contenedor sin layout visible, gastando ciclos de rAF sin ningún efecto
  // visible hasta terminar. No se llama `.resize()` ni se reintenta el fit
  // acá: eso se hace al volver a mostrarse (ver mapaVisible en
  // app/(hub)/mapas/natalidad/map-client.tsx) para no resetear el
  // pan/zoom del usuario en cada cambio de pestaña.
  useEffect(() => {
    const mapa = mapRef.current?.getMap()
    if (!mapa) return
    if (visible) {
      // Si el mapa arrancó montado detrás de "Estadísticas" (deep link
      // #estadisticas), su primer `onLoad` corrió con el contenedor todavía
      // en display:none — `resize()` le hace notar el tamaño real recién
      // ahora que el navegador ya le dio layout. El fit sólo se repite si
      // `fitValidoRef` sigue en false (nunca se hizo con tamaño real):
      // evita resetear el pan/zoom del usuario en cambios de pestaña
      // normales, donde el fit inicial ya fue válido.
      mapa.resize()
      if (!fitValidoRef.current) {
        mapa.fitBounds(LIMITES_CORRIENTES, { padding: 24, duration: 0 })
        fitValidoRef.current = true
      }
    } else {
      mapa.stop()
    }
  }, [visible])

  function handleSeleccionarEscuelaBuscada(feature: FeatureCollection<Point, EscuelaProperties>['features'][number]) {
    if (feature.geometry.type !== 'Point') return
    const [lng, lat] = feature.geometry.coordinates
    setDepartamentoSeleccionado(null)
    setEscuelaSeleccionada({ props: feature.properties, lng, lat })
    setEscuelaResaltada({ lng, lat })
    // Zoom > CAPA_ESCUELAS_CLUSTER_MAX_ZOOM (12): el resultado buscado se
    // desagrupa de su cluster antes de que termine el flyTo.
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 14, duration: 900 })
  }

  // Sin filtro de nivel (feedback 2026-09-25): el mapa siempre muestra todas
  // las escuelas geolocalizadas, con Inicial resaltado en teal — el filtro de
  // nivel del panel de la derecha se sacó por no aportar valor, ver
  // odd/tasks/mapa-natalidad.md T9.
  const mapStyle = BASEMAPS.voyager.styleUrl

  // Feedback 2026-09-25: el popup de departamento se muestra al pasar el
  // mouse (sigue al cursor, se cierra al salir del polígono o del mapa) en
  // vez de requerir un click — es información de referencia rápida, no una
  // selección persistente. `handleClick` se mantiene como fallback para
  // touch (sin mouse no hay "hover": un tap todavía tiene que poder abrirlo).
  //
  // Las escuelas SIGUEN siendo por click, a propósito: son ~2000 puntos que
  // MapLibre agrupa en clusters según el zoom, así que qué feature hay bajo
  // el cursor cambia todo el tiempo (un cluster se separa en puntos
  // individuales al acercarse el zoom). Recalcular y mostrar un popup en
  // cada mousemove sobre esa capa parpadearía constantemente y sería
  // ilegible; el click es una selección explícita y estable.
  function handleMouseMove(event: MapLayerMouseEvent) {
    const features = event.features ?? []
    const departamento = features.find((f) => f.layer?.id === CAPA_DEPARTAMENTOS_RELLENO_ID)
    const clave = departamento?.properties?.clave
    if (typeof clave === 'string') {
      setDepartamentoSeleccionado({ clave, lng: event.lngLat.lng, lat: event.lngLat.lat })
    } else if (departamentoSeleccionado) {
      setDepartamentoSeleccionado(null)
    }
  }

  function handleClick(event: MapLayerMouseEvent) {
    const features = event.features ?? []
    const escuela = features.find((f) => f.layer?.id === CAPA_ESCUELAS_ID)
    if (escuela?.geometry.type === 'Point') {
      setDepartamentoSeleccionado(null)
      setEscuelaResaltada(null)
      setEscuelaSeleccionada({
        props: escuela.properties as unknown as EscuelaProperties,
        lng: escuela.geometry.coordinates[0],
        lat: escuela.geometry.coordinates[1],
      })
      return
    }
    const departamento = features.find((f) => f.layer?.id === CAPA_DEPARTAMENTOS_RELLENO_ID)
    const clave = departamento?.properties?.clave
    if (typeof clave === 'string') {
      setEscuelaSeleccionada(null)
      setEscuelaResaltada(null)
      setDepartamentoSeleccionado({ clave, lng: event.lngLat.lng, lat: event.lngLat.lat })
      return
    }
    setDepartamentoSeleccionado(null)
    setEscuelaSeleccionada(null)
    setEscuelaResaltada(null)
  }

  const capasInteractivas = [CAPA_DEPARTAMENTOS_RELLENO_ID, CAPA_ESCUELAS_ID]

  const dptoSeleccionadoDatos = departamentoSeleccionado
    ? departamentosPorClave.get(departamentoSeleccionado.clave)
    : null

  if (error) {
    return <div className={`${styles.status} ${styles.statusError}`}>{error}</div>
  }

  if (!datos || !departamentosConDato || !escuelas) {
    return <div className={styles.status}>Cargando mapa…</div>
  }

  return (
    <div className={styles.shell} ref={shellRef}>
      <div className={styles.mapRoot} onMouseLeave={() => setDepartamentoSeleccionado(null)}>
        <MapGL
          ref={mapRef}
          mapStyle={mapStyle}
          initialViewState={{ bounds: LIMITES_CORRIENTES, fitBoundsOptions: { padding: 24 } }}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={capasInteractivas}
          onLoad={handleLoad}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          cursor="pointer"
        >
          <NavigationControl position="top-left" />

          <Source id="natalidad-mascara-src" type="geojson" data={MASCARA_URL}>
            <Layer id={CAPA_MASCARA_ID} type="fill" paint={fillPaintMascara()} />
          </Source>

          <Source id="natalidad-departamentos-src" type="geojson" data={departamentosConDato}>
            <Layer
              id={CAPA_DEPARTAMENTOS_RELLENO_ID}
              type="fill"
              paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.65 }}
            />
            <Layer id={CAPA_DEPARTAMENTOS_BORDE_ID} type="line" paint={linePaintDepartamentos()} />
            <Layer
              id={CAPA_DEPARTAMENTO_HOVER_ID}
              type="line"
              paint={linePaintDepartamentoHover()}
              filter={['==', ['get', 'clave'], departamentoSeleccionado?.clave ?? '']}
            />
          </Source>

          {/* Feedback 2026-09-25: las escuelas ya no tienen un toggle "Mostrar
              escuelas" — siempre visibles, Inicial resaltado en teal. */}
          <Source
            id="natalidad-escuelas-src"
            type="geojson"
            data={escuelas}
            cluster={true}
            clusterMaxZoom={CAPA_ESCUELAS_CLUSTER_MAX_ZOOM}
            clusterRadius={40}
            clusterProperties={{
              esInicialEnCluster: ['max', ['case', ['get', 'esInicial'], 1, 0]],
            }}
          >
            <Layer
              id={CAPA_ESCUELAS_ID}
              type="circle"
              filter={['!', ['has', 'point_count']]}
              paint={circlePaintEscuelas()}
            />
            <Layer
              id={CAPA_ESCUELAS_CLUSTER_ID}
              type="circle"
              filter={['has', 'point_count']}
              paint={circlePaintClusterEscuelas()}
            />
            <Layer
              id={CAPA_ESCUELAS_CLUSTER_COUNT_ID}
              type="symbol"
              filter={['has', 'point_count']}
              layout={symbolLayoutClusterCount()}
              paint={{ 'text-color': '#ffffff' }}
            />
          </Source>

          {/* Resalta la escuela elegida en el buscador (T10) con un anillo aparte
              — no toca circlePaintEscuelas/circlePaintClusterEscuelas, así que se
              ve encima tanto de un punto individual como de un cluster todavía sin
              desagrupar mientras el flyTo llega al zoom que lo desagrupa. */}
          {escuelaResaltada && (
            <Source
              id="natalidad-escuela-resaltada-src"
              type="geojson"
              data={{
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [escuelaResaltada.lng, escuelaResaltada.lat] },
                    properties: {},
                  },
                ],
              }}
            >
              <Layer
                id={CAPA_ESCUELA_RESALTADA_ID}
                type="circle"
                paint={{
                  'circle-radius': 11,
                  'circle-color': 'transparent',
                  'circle-stroke-color': '#f59e0b',
                  'circle-stroke-width': 3,
                }}
              />
            </Source>
          )}

          {departamentoSeleccionado && dptoSeleccionadoDatos && (
            <Popup
              longitude={departamentoSeleccionado.lng}
              latitude={departamentoSeleccionado.lat}
              anchor="bottom"
              onClose={() => setDepartamentoSeleccionado(null)}
              closeOnClick={false}
              maxWidth="320px"
            >
              <div className={styles.popup}>
                <h3 className={styles.popupTitle}>{dptoSeleccionadoDatos.nombre}</h3>
                <div className={styles.popupRow}>
                  <b>Nacidos vivos {anioSeleccionado}:</b>{' '}
                  {fmt(dptoSeleccionadoDatos.serie[String(anioSeleccionado)] ?? 0)}
                </div>
                {rangoResumen && (
                  <div className={styles.popupRow}>
                    <b>
                      Variación {rangoResumen.desde}→{rangoResumen.hasta}:
                    </b>{' '}
                    {(() => {
                      const variacionRango = calcularVariacion(
                        dptoSeleccionadoDatos.serie,
                        rangoResumen.desde,
                        rangoResumen.hasta,
                      )
                      return (
                        <>
                          {fmtPct(variacionRango.pct)} ({variacionRango.abs >= 0 ? '+' : ''}
                          {fmt(variacionRango.abs)})
                        </>
                      )
                    })()}
                  </div>
                )}
                <Sparkline serie={dptoSeleccionadoDatos.serie} anios={datos.meta.anios} />
                <MatriculaNatalidadPanel datos={matricula} error={errorMatricula} departamento={dptoSeleccionadoDatos.nombre} />
                <hr className={styles.popupRule} />
                {/* Feedback 2026-09-25: sólo Inicial y Primario, que son los
                    niveles que reciben directamente la cohorte de nacidos —
                    Secundario/Superior/Servicios Educativos no aportan a esa
                    comparación y se sacaron de este resumen (el filtro de
                    nivel de las escuelas en el mapa sigue teniendo los 5). */}
                <div className={styles.sectionTitle}>Escuelas por nivel</div>
                {NIVELES_POPUP_DEPARTAMENTO.map((nivel) => (
                  <div key={nivel} className={styles.popupRow}>
                    <b>{nivel}:</b> {dptoSeleccionadoDatos.porNivel[nivel].escuelas} escuela(s) ·{' '}
                    {dptoSeleccionadoDatos.porNivel[nivel].secciones} sección(es)
                  </div>
                ))}
                <hr className={styles.popupRule} />
                <div className={styles.sectionTitle}>Oferta de inicial por sala</div>
                {Object.entries(dptoSeleccionadoDatos.inicial.seccionesPorCurso).map(([curso, secciones]) => (
                  <div key={curso} className={styles.popupMuted}>
                    {curso}: {secciones}
                  </div>
                ))}
              </div>
            </Popup>
          )}

          {escuelaSeleccionada && (
            <Popup
              longitude={escuelaSeleccionada.lng}
              latitude={escuelaSeleccionada.lat}
              anchor="bottom"
              onClose={() => {
                setEscuelaSeleccionada(null)
                setEscuelaResaltada(null)
              }}
              closeOnClick={false}
              maxWidth="320px"
            >
              <div className={styles.popup}>
                <h3 className={styles.popupTitle}>{escuelaSeleccionada.props.nombre}</h3>
                {escuelaSeleccionada.props.sector && (
                  <div className={styles.popupRow}>
                    <b>Sector:</b> {escuelaSeleccionada.props.sector}
                  </div>
                )}
                {escuelaSeleccionada.props.ofertaTipo.length > 0 && (
                  <div className={styles.popupRow}>
                    <b>Oferta:</b> {escuelaSeleccionada.props.ofertaTipo.join(', ')}
                  </div>
                )}
                {escuelaSeleccionada.props.domicilio && (
                  <div className={styles.popupRow}>
                    <b>Domicilio:</b> {escuelaSeleccionada.props.domicilio}
                  </div>
                )}
                <div className={styles.popupRow}>
                  <b>Localidad:</b> {escuelaSeleccionada.props.localidad}
                </div>
                <div className={styles.popupRow}>
                  <b>Departamento:</b> {escuelaSeleccionada.props.departamento}
                </div>
                <hr className={styles.popupRule} />
                <MatriculaNatalidadPanel key={escuelaSeleccionada.props.cueAnexo} datos={matricula} error={errorMatricula} cueAnexo={escuelaSeleccionada.props.cueAnexo} />
                <div className={styles.sectionTitle}>Niveles (padrón, ciclo 2026)</div>
                {escuelaSeleccionada.props.tienePadron ? (
                  escuelaSeleccionada.props.niveles.map((nivelOferta) => (
                    <div key={nivelOferta.nivel} className={styles.popupMuted}>
                      <b>{nivelOferta.nivel}</b> ({nivelOferta.secciones} sección(es)):{' '}
                      {nivelOferta.cursos.map((c) => `${c.curso}: ${c.secciones}`).join(' · ')}
                    </div>
                  ))
                ) : (
                  <div className={styles.popupMuted}>
                    {escuelaSeleccionada.props.niveles.length > 0
                      ? `Sin datos de padrón (nivel inferido de la oferta: ${escuelaSeleccionada.props.niveles
                          .map((n) => n.nivel)
                          .join(', ')})`
                      : 'Sin datos de padrón'}
                  </div>
                )}
              </div>
            </Popup>
          )}
        </MapGL>
      </div>

      {/* T10a: ancho fijo (natalidad-title-panel, ~330px) para que este panel,
          los controles de métrica/año y el buscador formen una única columna
          alineada con la leyenda de abajo — antes crecía tanto como la línea
          de fuentes más larga (provenía de un <span> suelto) y quedaba
          descentrado/asimétrico frente a la leyenda. Las fuentes pasan a un
          <details> colapsable chico ("Fuentes"), el título y el resumen
          quedan como única línea de contexto. */}
      <div className={`${styles.panel} ${styles.titlePanel} natalidad-title-panel`}>
        <b>Nacidos vivos por departamento</b>
        <br />
        {/* Bug corregido (2026-09-25): este resumen quedaba fijo en
            meta.anioInicio→meta.anioFin sin importar los controles — ahora
            sigue el modo activo (rangoResumen, calculado más arriba). */}
        {modo === 'anio' && anioSeleccionado != null && variacionProvincialResumen && (
          <>
            Total provincial {anioSeleccionado}:{' '}
            <b>{fmt(valorSerie(datos.provincia.serie, anioSeleccionado))}</b> ·{' '}
            {fmtVariacionContra(datos.meta.anioInicio, variacionProvincialResumen)}
          </>
        )}
        {modo === 'variacion' && anioVariacionA != null && anioVariacionB != null && variacionProvincialResumen && (
          <>
            {anioVariacionA}: <b>{fmt(valorSerie(datos.provincia.serie, anioVariacionA))}</b> → {anioVariacionB}:{' '}
            <b>{fmt(valorSerie(datos.provincia.serie, anioVariacionB))}</b> ·{' '}
            <b>{fmtPct(variacionProvincialResumen.pct)}</b>
          </>
        )}

        {/* Feedback 2026-09-25: el panel de la derecha (Métrica / Escuelas /
            Mapa base) se sacó — "no lo siento útil" — y quedó un único
            control compacto acá abajo: el switch de métrica más los años que
            aplican a la métrica elegida. Escuelas y mapa base ya no son
            configurables (ver comentarios en `mapStyle` y en la fuente de
            escuelas más abajo). */}
        <div className="natalidad-metrica-control">
          <SegmentedGroup value={modo} onValueChange={(v) => setModo(v as ModoMetrica)}>
            <SegmentedItem value="anio">Nacidos en el año</SegmentedItem>
            <SegmentedItem value="variacion">Variación %</SegmentedItem>
          </SegmentedGroup>

          {modo === 'anio' && (
            <AnioSelect
              label="Año"
              anios={datos.meta.anios}
              value={anioSeleccionado}
              onChange={setAnioSeleccionado}
            />
          )}

          {modo === 'variacion' && (
            <div className="natalidad-anio-par">
              <AnioSelect
                label="Desde"
                anios={anioVariacionB != null ? opcionesAnioDesde(datos.meta.anios, anioVariacionB) : datos.meta.anios}
                value={anioVariacionA}
                onChange={handleCambiarDesde}
              />
              <AnioSelect
                label="Hasta"
                anios={anioVariacionA != null ? opcionesAnioHasta(datos.meta.anios, anioVariacionA) : datos.meta.anios}
                value={anioVariacionB}
                onChange={handleCambiarHasta}
              />
            </div>
          )}
        </div>

        <NatalidadEscuelaSearchBox escuelas={escuelas} onSeleccionar={handleSeleccionarEscuelaBuscada} />

        {/* T10a: provenance de datos movida a un <details> chico y colapsado
            por defecto — antes era un <span> siempre visible que estiraba el
            panel de título hasta ~2-3 líneas y rompía el ancho fijo de la
            columna. */}
        <MatriculaNatalidadPanel datos={matricula} error={errorMatricula} />
        <RenaperNatalidadPanel datos={renaper} error={errorRenaper} departamento={dptoSeleccionadoDatos?.nombre} />
        <details className="natalidad-fuentes">
          <summary>Fuentes</summary>
          <span className={styles.hint}>
            Nacidos vivos: {datos.meta.fuenteNatalidad.nombre}. {datos.meta.fuenteLocalizaciones}.{' '}
            {datos.meta.fuenteSecciones}. Período {datos.meta.anioInicio}–{datos.meta.anioFin}.
          </span>
        </details>
      </div>

      {/* Feedback 2026-09-25: la leyenda ahora arranca ABIERTA — el mapa tiene
          que leerse sin clickear nada. `<details open>` se mantiene (no un
          div suelto) para conservar la afordancia de colapsarla si molesta,
          consistente con el resto de los mapas del proyecto.
          T10a: natalidad-legend-panel iguala el ancho fijo del panel de
          título (~330px) para que ambos paneles queden alineados. */}
      <details className={`${styles.panel} ${styles.legendPanel} natalidad-legend-panel`} open>
        <summary className={styles.legendSummary}>Referencias</summary>
        {modo === 'anio' && escalaAnio && (
          <>
            <div className={styles.hint}>Nacidos vivos en {anioSeleccionado} (cuantiles, claro = menos, oscuro = más)</div>
            {escalaAnio.colors.map((color, i) => (
              <div key={color + i} className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: color }} />
                {i === 0
                  ? `< ${fmt(escalaAnio.breaks[0] ?? 0)}`
                  : i === escalaAnio.colors.length - 1
                    ? `≥ ${fmt(escalaAnio.breaks[i - 1])}`
                    : `${fmt(escalaAnio.breaks[i - 1])} – ${fmt(escalaAnio.breaks[i])}`}
              </div>
            ))}
          </>
        )}
        {/* Bug corregido (2026-09-25): esta sección sólo mostraba la fila "Sin
            dato" — los tramos divergentes (ESCALA_VARIACION_BREAKS/COLORS,
            los mismos que pinta el mapa via colorVariacion) faltaban por
            completo. "Sin dato" ahora sólo aparece si algún departamento
            realmente no tiene base comparable en el año Desde. */}
        {modo === 'variacion' && (
          <>
            <div className={styles.hint}>
              % variación {anioVariacionA}→{anioVariacionB} (rojo = caída, azul = crecimiento)
            </div>
            {ESCALA_VARIACION_COLORS.map((color, i) => (
              <div key={color + i} className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: color }} />
                {i === 0
                  ? `< ${ESCALA_VARIACION_BREAKS[0]}%`
                  : i === ESCALA_VARIACION_COLORS.length - 1
                    ? `≥ ${ESCALA_VARIACION_BREAKS[i - 1]}%`
                    : `${ESCALA_VARIACION_BREAKS[i - 1]}% – ${ESCALA_VARIACION_BREAKS[i]}%`}
              </div>
            ))}
            {hayVariacionSinDato && (
              <div className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: COLOR_SIN_DATO }} />
                Sin dato en {anioVariacionA}
              </div>
            )}
          </>
        )}
        <div className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: COLOR_INICIAL }} />
          Escuela con oferta de nivel inicial
        </div>
        <div className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: COLOR_ESCUELA_DEFAULT }} />
          Otras escuelas (Primario, Secundario, Superior, Servicios Educativos)
        </div>
        <div className={styles.hint}>Puntos: todas las escuelas activas (relevamiento GEO 2025-10-02) con oferta vigente (padrón, ciclo 2026).</div>
      </details>

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
