'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  FillLayerSpecification,
  LineLayerSpecification,
} from 'maplibre-gl'
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/components/mapas/maplibre-popup.css'
import { BasemapControl } from '@/components/mapas/basemap-control'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioItem } from '@/components/ui/radio'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import { ensureMapWorker } from '@/lib/map-worker'
import {
  COLORES_DEPARTAMENTO,
  DEPARTAMENTOS_URL,
  LIMITES_CORRIENTES,
  MASCARA_COLOR,
  MASCARA_OPACIDAD,
  MASCARA_URL,
  normalizarNombreDepartamento,
} from '@/lib/mapas/departamentos'
import {
  COLOR_SIN_DATO,
  colorSecuencial,
  colorVariacion,
  construirEscalaSecuencial,
  construirPuntosSparkline,
  type DatosNatalidad,
  type DepartamentoNatalidad,
  type EscuelaInicialProperties,
} from '@/lib/mapas/natalidad'

ensureMapWorker()

// ── IDs de capas ─────────────────────────────────────────────────────────
const CAPA_MASCARA_ID = 'natalidad-mascara'
const CAPA_DEPARTAMENTOS_RELLENO_ID = 'natalidad-departamentos-relleno'
const CAPA_DEPARTAMENTOS_BORDE_ID = 'natalidad-departamentos-borde'
const CAPA_DEPARTAMENTO_HOVER_ID = 'natalidad-departamento-hover'
const CAPA_ESCUELAS_ID = 'natalidad-escuelas'

type ModoMetrica = 'anio' | 'variacion'

function fillPaintMascara(): FillLayerSpecification['paint'] {
  return { 'fill-color': MASCARA_COLOR, 'fill-opacity': MASCARA_OPACIDAD }
}

function linePaintDepartamentos(): LineLayerSpecification['paint'] {
  return {
    'line-color': COLORES_DEPARTAMENTO.bordeNormal,
    'line-width': COLORES_DEPARTAMENTO.pesoLineaNormal,
    'line-opacity': 0.95,
  }
}

function linePaintDepartamentoHover(): LineLayerSpecification['paint'] {
  return {
    'line-color': COLORES_DEPARTAMENTO.bordeSeleccionado,
    'line-width': COLORES_DEPARTAMENTO.pesoLineaSeleccionado,
  }
}

function circlePaintEscuelas(): CircleLayerSpecification['paint'] {
  return {
    'circle-radius': 4,
    'circle-color': '#0f766e',
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1,
    'circle-opacity': 0.85,
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-AR').format(n)
}

function fmtPct(pct: number | null): string {
  if (pct == null) return '—'
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
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

export default function MapNatalidadPage() {
  const styles = useOverlayStyles()
  const shellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)

  const [basemap, setBasemap] = useState<BasemapId>('voyager')
  const [datos, setDatos] = useState<DatosNatalidad | null>(null)
  const [escuelas, setEscuelas] = useState<FeatureCollection<Point, EscuelaInicialProperties> | null>(null)
  const [departamentosGeojson, setDepartamentosGeojson] = useState<FeatureCollection<
    Polygon | MultiPolygon,
    { nombre: string }
  > | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [modo, setModo] = useState<ModoMetrica>('anio')
  const [anioSeleccionado, setAnioSeleccionado] = useState<number | null>(null)
  const [anioVariacionA, setAnioVariacionA] = useState<number | null>(null)
  const [anioVariacionB, setAnioVariacionB] = useState<number | null>(null)
  const [capaEscuelasVisible, setCapaEscuelasVisible] = useState(true)
  const [departamentoSeleccionado, setDepartamentoSeleccionado] = useState<{
    clave: string
    lng: number
    lat: number
  } | null>(null)
  const [escuelaSeleccionada, setEscuelaSeleccionada] = useState<{
    props: EscuelaInicialProperties
    lng: number
    lat: number
  } | null>(null)

  useEffect(() => {
    let cancelado = false
    Promise.all([
      fetch('/data/natalidad/departamentos.json').then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar departamentos.json')
        return r.json() as Promise<DatosNatalidad>
      }),
      fetch('/data/natalidad/inicial.geojson').then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar inicial.geojson')
        return r.json() as Promise<FeatureCollection<Point, EscuelaInicialProperties>>
      }),
      fetch(DEPARTAMENTOS_URL).then((r) => r.json()) as Promise<
        FeatureCollection<Polygon | MultiPolygon, { nombre: string }>
      >,
    ])
      .then(([datosNatalidad, escuelasInicial, departamentos]) => {
        if (cancelado) return
        setDatos(datosNatalidad)
        setEscuelas(escuelasInicial)
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

  const mapStyle = BASEMAPS[basemap].styleUrl

  function handleClick(event: MapLayerMouseEvent) {
    const features = event.features ?? []
    const escuela = features.find((f) => f.layer?.id === CAPA_ESCUELAS_ID)
    if (escuela?.geometry.type === 'Point') {
      setDepartamentoSeleccionado(null)
      setEscuelaSeleccionada({
        props: escuela.properties as unknown as EscuelaInicialProperties,
        lng: escuela.geometry.coordinates[0],
        lat: escuela.geometry.coordinates[1],
      })
      return
    }
    const departamento = features.find((f) => f.layer?.id === CAPA_DEPARTAMENTOS_RELLENO_ID)
    const clave = departamento?.properties?.clave
    if (typeof clave === 'string') {
      setEscuelaSeleccionada(null)
      setDepartamentoSeleccionado({ clave, lng: event.lngLat.lng, lat: event.lngLat.lat })
      return
    }
    setDepartamentoSeleccionado(null)
    setEscuelaSeleccionada(null)
  }

  const capasInteractivas = [
    CAPA_DEPARTAMENTOS_RELLENO_ID,
    ...(capaEscuelasVisible ? [CAPA_ESCUELAS_ID] : []),
  ]

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
      <div className={styles.mapRoot}>
        <MapGL
          ref={mapRef}
          mapStyle={mapStyle}
          initialViewState={{ bounds: LIMITES_CORRIENTES, fitBoundsOptions: { padding: 24 } }}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={capasInteractivas}
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

          {capaEscuelasVisible && (
            <Source id="natalidad-escuelas-src" type="geojson" data={escuelas}>
              <Layer id={CAPA_ESCUELAS_ID} type="circle" paint={circlePaintEscuelas()} />
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
                <div className={styles.popupRow}>
                  <b>
                    Variación {datos.meta.anioInicio}→{datos.meta.anioFin}:
                  </b>{' '}
                  {fmtPct(dptoSeleccionadoDatos.variacion.pct)} ({dptoSeleccionadoDatos.variacion.abs >= 0 ? '+' : ''}
                  {fmt(dptoSeleccionadoDatos.variacion.abs)})
                </div>
                <Sparkline serie={dptoSeleccionadoDatos.serie} anios={datos.meta.anios} />
                <hr className={styles.popupRule} />
                <div className={styles.sectionTitle}>Oferta nivel inicial</div>
                <div className={styles.popupRow}>
                  <b>CUEs:</b> {dptoSeleccionadoDatos.inicial.cues} · <b>Secciones:</b>{' '}
                  {dptoSeleccionadoDatos.inicial.seccionesTotal}
                </div>
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
              onClose={() => setEscuelaSeleccionada(null)}
              closeOnClick={false}
              maxWidth="320px"
            >
              <div className={styles.popup}>
                <h3 className={styles.popupTitle}>{escuelaSeleccionada.props.nombre}</h3>
                <div className={styles.popupRow}>
                  <b>Localidad:</b> {escuelaSeleccionada.props.localidad}
                </div>
                <div className={styles.popupRow}>
                  <b>Departamento:</b> {escuelaSeleccionada.props.departamento}
                </div>
                <hr className={styles.popupRule} />
                <div className={styles.sectionTitle}>Salas (ciclo 2026)</div>
                {escuelaSeleccionada.props.salas.map((sala, i) => (
                  <div key={`${sala.curso}-${i}`} className={styles.popupMuted}>
                    {sala.curso}: {sala.secciones} sección(es)
                  </div>
                ))}
                <div className={styles.popupRow}>
                  <b>Total secciones:</b> {escuelaSeleccionada.props.seccionesTotal}
                </div>
              </div>
            </Popup>
          )}
        </MapGL>
      </div>

      <div className={`${styles.panel} ${styles.titlePanel}`}>
        <b>Nacidos vivos por departamento — Corrientes {datos.meta.anioInicio}–{datos.meta.anioFin}</b>
        <br />
        <span className={styles.hint}>
          Fuente: {datos.meta.fuenteNatalidad.nombre}. Oferta de nivel inicial: {datos.meta.fuenteInicial}.
        </span>
        <br />
        Total provincial {datos.meta.anioFin}: <b>{fmt(datos.provincia.serie[String(datos.meta.anioFin)] ?? 0)}</b> ·
        variación {datos.meta.anioInicio}→{datos.meta.anioFin}: <b>{fmtPct(datos.provincia.variacion.pct)}</b>
      </div>

      <div className={styles.controlsStack}>
        <div className={styles.controlCard}>
          <h2 className={styles.controlHeading}>Métrica</h2>
          <RadioGroup value={modo} onValueChange={(v) => setModo(v as ModoMetrica)}>
            <RadioItem value="anio" label="Nacidos vivos en un año" />
            <RadioItem value="variacion" label="% variación entre dos años" />
          </RadioGroup>

          {modo === 'anio' && (
            <label className={styles.hint}>
              Año:{' '}
              <select
                value={anioSeleccionado ?? ''}
                onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
              >
                {datos.meta.anios.map((anio) => (
                  <option key={anio} value={anio}>
                    {anio}
                  </option>
                ))}
              </select>
            </label>
          )}

          {modo === 'variacion' && (
            <div className={styles.hint}>
              <label>
                Desde:{' '}
                <select
                  value={anioVariacionA ?? ''}
                  onChange={(e) => setAnioVariacionA(Number(e.target.value))}
                >
                  {datos.meta.anios.map((anio) => (
                    <option key={anio} value={anio}>
                      {anio}
                    </option>
                  ))}
                </select>
              </label>
              <br />
              <label>
                Hasta:{' '}
                <select
                  value={anioVariacionB ?? ''}
                  onChange={(e) => setAnioVariacionB(Number(e.target.value))}
                >
                  {datos.meta.anios.map((anio) => (
                    <option key={anio} value={anio}>
                      {anio}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className={styles.controlCard}>
          <h2 className={styles.controlHeading}>Capas</h2>
          <Checkbox
            label="Escuelas de nivel inicial"
            checked={capaEscuelasVisible}
            onCheckedChange={setCapaEscuelasVisible}
          />
        </div>

        <BasemapControl value={basemap} onChange={setBasemap} />
      </div>

      <details className={`${styles.panel} ${styles.legendPanel}`}>
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
        {modo === 'variacion' && (
          <>
            <div className={styles.hint}>
              % variación {anioVariacionA}→{anioVariacionB} (rojo = caída, azul = crecimiento)
            </div>
            <div className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: COLOR_SIN_DATO }} />
              Sin dato en {anioVariacionA}
            </div>
          </>
        )}
        <div className={styles.hint}>Puntos: escuelas de nivel inicial con oferta vigente (ciclo 2026).</div>
      </details>

      <FullscreenButton targetRef={shellRef} />
    </div>
  )
}
