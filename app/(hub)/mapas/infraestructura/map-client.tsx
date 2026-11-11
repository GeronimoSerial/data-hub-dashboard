'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { pestanaDeMapa, resolverPestana } from '@/lib/infraestructura/mapa/pestanas'
import { filtrarEscuelas } from '@/lib/infraestructura/mapa/filtrar'
import { resumir } from '@/lib/infraestructura/mapa/agregar'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa, type PestanaMapa } from '@/lib/infraestructura/mapa/tipos'
import { FiltrosChips } from '@/components/mapas/filtros-chips'
import { PanelEstadisticas } from '@/components/mapas/panel-estadisticas'
import { MetodologiaMapa } from '@/components/mapas/metodologia/metodologia-mapa'
import { VistaExportar } from '@/components/mapas/exportar/vista-exportar'
import { useEscuelasMapa } from '@/lib/infraestructura/use-escuelas-mapa'
import type { EscuelaMapaPadron } from '@/lib/infraestructura/parte-mapa'
import {
  leerSnapshotRetornoMapa,
  parsearContextoMapaDeQuery,
} from '@/lib/infraestructura/mapa/estado-retorno'
import { cn } from '@/lib/utils'
import styles from './map-header.module.css'

const cargarMapa = () => import('@/components/mapas/map-infraestructura-page')

const MapInfraestructuraPage = dynamic(cargarMapa, {
  ssr: false,
  loading: () => <p>Cargando mapa…</p>,
})

// Arranca la descarga del chunk apenas se evalúa este módulo, en paralelo con
// la hidratación, en vez de esperar a que React monte el componente. En el
// servidor no se ejecuta porque no hay `window`.
if (typeof window !== 'undefined') {
  void cargarMapa()
}

export function InfraestructuraMapClient(props: {
  mostrarEnlaceNominal: boolean
  mostrarCallCenter?: boolean
  hazardContextEnabled?: boolean
  riskRadarEnabled?: boolean
  seasonalEnabled?: boolean
  rutaActiva?: boolean
  pantallaCompletaRef?: React.RefObject<HTMLDivElement | null>
}) {
  const rutaActiva = props.rutaActiva ?? true
  const [tab, setTab] = React.useState<PestanaMapa>('actual')
  const contenedorLocal = React.useRef<HTMLDivElement>(null)
  const contenedorPantallaCompleta = props.pantallaCompletaRef ?? contenedorLocal
  const tabsListRef = React.useRef<HTMLDivElement>(null)
  const [tabsOverflow, setTabsOverflow] = React.useState({
    has: false,
    left: false,
    right: false,
  })
  const seleccionarEscuelaRef = React.useRef<
    ((escuela: EscuelaMapaPadron, opciones?: { conservarCamara?: boolean }) => void) | null
  >(null)
  const [seleccionadorListo, setSeleccionadorListo] = React.useState(false)
  const registrarSeleccion = React.useCallback(
    (fn: ((escuela: EscuelaMapaPadron, opciones?: { conservarCamara?: boolean }) => void) | null) => {
      seleccionarEscuelaRef.current = fn
      setSeleccionadorListo(Boolean(fn))
    },
    [],
  )
  const [filtros, setFiltros] = React.useState<FiltrosMapa>(FILTROS_MAPA_VACIOS)
  const { data: padron } = useEscuelasMapa()
  const escuelasFiltradas = React.useMemo(
    () => filtrarEscuelas(padron?.escuelas ?? [], filtros),
    [padron, filtros],
  )
  const cantidadConReporte = resumir(escuelasFiltradas).conReporte
  const escuelasMapa = React.useMemo(
    () => padron ? { ...padron, escuelas: escuelasFiltradas } : null,
    [padron, escuelasFiltradas],
  )
  const [ultimaPestanaMapa, setUltimaPestanaMapa] = React.useState<
    Exclude<PestanaMapa, 'estadisticas' | 'metodologia' | 'exportar'>
  >('actual')

  // Mismo patrón que AdminPage (components/admin-page.tsx:1841-1857): estado
  // local con useState espejado contra window.location.hash, para que la
  // pestaña sea linkeable. La diferencia con admin es que acá además se
  // ESCRIBE el hash al cambiar de pestaña: sin eso, la sincronía sólo serviría
  // para quien llega con un #evolucion ya armado, y no habría forma de copiar
  // una URL que lleve a la evolución desde la interfaz. El `hashchange` que
  // dispara esa escritura vuelve a llamar a setTab con el mismo valor, así que
  // no re-renderiza de más. Los enlaces viejos y los hashes desconocidos
  // siempre resuelven a una pestaña activa.
  const onTab = (valor: string) => {
    const pestana = resolverPestana(`#${valor}`, '', {
      radarHabilitado: !!props.riskRadarEnabled,
    })
    if (pestana !== valor) return
    setTab(pestana)
    if (window.location.hash.slice(1) !== valor) window.location.hash = valor
  }

  const buscarEscuelaEnPadron = React.useCallback(
    (cueAnexo: string): EscuelaMapaPadron | null => {
      const enEscuelas = padron?.escuelas.find((item) => item.cueAnexo === cueAnexo)
      if (enEscuelas) return enEscuelas
      const enSinUbicacion = padron?.sinUbicacion.find((item) => item.cueAnexo === cueAnexo)
      if (!enSinUbicacion) return null
      return {
        cueAnexo: enSinUbicacion.cueAnexo,
        nombre: enSinUbicacion.nombre,
        departamento: enSinUbicacion.departamento,
        localidad: enSinUbicacion.localidad,
        lat: null,
        lon: null,
        estado: 'sin_afectacion_reportada',
        niveles: [],
        alumnos: 0,
        gravedad: 0,
        categoriaPrincipal: null,
        clases: 'normal',
        apoyo: null,
        sinActualizar: false,
        ultimaNovedad: null,
        alumnosSinClases: 0,
        situacionesHistoricas: 0,
        solucionadasRecientes: 0,
      }
    },
    [padron],
  )

  function seleccionarEscuela(cueAnexo: string) {
    const escuela = buscarEscuelaEnPadron(cueAnexo)
    if (!escuela) return
    if (tab === 'estadisticas' || tab === 'metodologia' || tab === 'exportar') {
      onTab(ultimaPestanaMapa || 'actual')
    }
    seleccionarEscuelaRef.current?.(escuela)
  }

  const ultimoSearchAplicadoRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!rutaActiva || !padron || !seleccionadorListo || typeof window === 'undefined') return
    const search = window.location.search
    if (!search || ultimoSearchAplicadoRef.current === search) return
    const params = new URLSearchParams(search)
    const contexto = parsearContextoMapaDeQuery(params)
    const cueBuscado = contexto.cue ?? params.get('cue')?.trim() ?? null
    if (!cueBuscado) return
    const escuela = buscarEscuelaEnPadron(cueBuscado)
    if (!escuela) return
    ultimoSearchAplicadoRef.current = search
    // `enfocar=1` (from "Abrir mapa" in the school sheet) always centres on the school.
    const conservarCamara =
      params.get('enfocar') !== '1' &&
      (contexto.origen === 'mapa' || Boolean(leerSnapshotRetornoMapa()))
    seleccionarEscuelaRef.current?.(escuela, { conservarCamara })
  }, [rutaActiva, padron, seleccionadorListo, buscarEscuelaEnPadron])

  React.useEffect(() => {
    const syncHash = () => {
      setTab(
        resolverPestana(window.location.hash, window.location.search, {
          radarHabilitado: !!props.riskRadarEnabled,
        }),
      )
    }
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [props.riskRadarEnabled, rutaActiva])

  const revealTab = React.useCallback((target: HTMLElement | null) => {
    const el = tabsListRef.current
    if (!el || !target || typeof el.scrollTo !== 'function') return
    const pad = 20
    const left = target.offsetLeft
    const right = left + target.offsetWidth
    const viewLeft = el.scrollLeft
    const viewRight = viewLeft + el.clientWidth
    let next: number | null = null
    if (left - pad < viewLeft) next = Math.max(0, left - pad)
    else if (right + pad > viewRight) next = right - el.clientWidth + pad
    if (next !== null) {
      const reduceMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollTo({ left: next, behavior: reduceMotion ? 'auto' : 'smooth' })
    }
  }, [])

  React.useEffect(() => {
    const el = tabsListRef.current
    if (!el) return
    const updateOverflow = () => {
      const max = el.scrollWidth - el.clientWidth
      const has = max > 2
      setTabsOverflow((prev) => {
        const left = has && el.scrollLeft > 2
        const right = has && el.scrollLeft < max - 2
        if (prev.has === has && prev.left === left && prev.right === right) {
          return prev
        }
        return { has, left, right }
      })
    }
    updateOverflow()
    el.addEventListener('scroll', updateOverflow, { passive: true })
    window.addEventListener('resize', updateOverflow)
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateOverflow)
        : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', updateOverflow)
      window.removeEventListener('resize', updateOverflow)
      ro?.disconnect()
    }
  }, [props.riskRadarEnabled, cantidadConReporte])

  React.useEffect(() => {
    const el = tabsListRef.current
    if (!el) return
    const active = el.querySelector<HTMLElement>('[aria-selected="true"], [data-active]')
    revealTab(active)
  }, [tab, revealTab])

  const mapaVisible = tab !== 'estadisticas' && tab !== 'metodologia' && tab !== 'exportar'
  if (mapaVisible && tab !== ultimaPestanaMapa) {
    setUltimaPestanaMapa(tab)
  }

  return (
    <div className="mapa-pestanas" ref={contenedorLocal}>
      <div className={cn('mapa-pestanas-barra', styles.headerBar)}>
        <Tabs className={styles.tabsRoot} value={tab} onValueChange={onTab}>
          <div
            className={styles.tabsShell}
            data-overflow={tabsOverflow.has}
            data-left={tabsOverflow.left}
            data-right={tabsOverflow.right}
          >
            <TabsList
              ref={tabsListRef}
              className={styles.tabsList}
              aria-label="Modos y vistas de ENOS 2026"
              onFocusCapture={(event) => {
                const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[role="tab"]')
                if (target) revealTab(target)
              }}
            >
              <TabsTab
                value="actual"
                className={styles.tabTrigger}
                aria-label={cantidadConReporte > 0
                  ? `Situación actual, ${cantidadConReporte} ${cantidadConReporte === 1 ? 'escuela' : 'escuelas'} con situaciones abiertas`
                  : undefined}
              >
                Situación actual
                {cantidadConReporte > 0 && (
                  <span
                    className={cn(
                      'map-sitact__pill map-sitact__pill--neutro ui-tabs-tab__contador',
                      styles.counterBadge,
                    )}
                    aria-hidden="true"
                  >
                    {cantidadConReporte}
                  </span>
                )}
              </TabsTab>
              {props.riskRadarEnabled && (
                <TabsTab value="radar" className={styles.tabTrigger}>
                  Radar
                </TabsTab>
              )}
              <TabsTab value="planificacion" className={styles.tabTrigger}>
                Planificación
              </TabsTab>
              <TabsTab
                value="capas"
                className={styles.tabTrigger}
                data-cluster-start="true"
              >
                Capas
              </TabsTab>
              <TabsTab
                value="estadisticas"
                className={styles.tabTrigger}
                data-cluster-start="true"
              >
                Estadísticas
              </TabsTab>
              <TabsTab value="exportar" className={styles.tabTrigger}>
                Exportar
              </TabsTab>
            </TabsList>
          </div>
        </Tabs>
        {props.mostrarCallCenter && (
          <Link href="/call-center" className={styles.callCenterLink}>
            Call center
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        )}
        <FiltrosChips
          escuelas={padron?.escuelas ?? []}
          filtros={filtros}
          onChange={setFiltros}
          onSeleccionar={seleccionarEscuela}
          contenedorPopovers={contenedorPantallaCompleta}
        />
      </div>

      <div className="mapa-pestanas-cuerpo">
        {/*
          REGLA F5.1: el mapa NO se desmonta al cambiar de pestaña, se oculta
          con CSS. MapLibre guarda en memoria el encuadre, el basemap ya
          descargado, los workers y las capas; si <MapGL> se desmontara, cada
          ida y vuelta volvería a bajar el basemap y perdería el encuadre, y
          la página se sentiría rota. Por eso el panel del mapa SIEMPRE está
          en el árbol y sólo alterna el atributo `hidden` (display: none).
          MapLibre observa el tamaño de su contenedor con ResizeObserver, así
          que al volver a mostrarse se redimensiona solo y la cámara no se
          toca.
        */}
        <div className="mapa-pestana-panel" hidden={!mapaVisible} data-testid="pestana-mapa">
          <MapInfraestructuraPage
            mostrarEnlaceNominal={props.mostrarEnlaceNominal}
            hazardContextEnabled={props.hazardContextEnabled ?? false}
            riskRadarEnabled={props.riskRadarEnabled ?? false}
            seasonalEnabled={props.seasonalEnabled ?? false}
            pestana={pestanaDeMapa(ultimaPestanaMapa)}
            panel={ultimaPestanaMapa}
            visible={mapaVisible && rutaActiva}
            escuelasMapa={escuelasMapa}
            onRegistrarSeleccion={registrarSeleccion}
            contenedorPantallaCompleta={contenedorPantallaCompleta}
            filtrosActivos={filtros}
          />
        </div>

        {tab === 'estadisticas' && (
          <div
            className="mapa-pestana-panel mapa-pestana-panel--scroll"
            data-testid="pestana-estadisticas"
          >
            <PanelEstadisticas escuelas={escuelasFiltradas} filtros={filtros} />
          </div>
        )}

        {tab === 'metodologia' && (
          <div
            className="mapa-pestana-panel mapa-pestana-panel--scroll"
            data-testid="pestana-metodologia"
          >
            <MetodologiaMapa />
          </div>
        )}

        {tab === 'exportar' && (
          <div
            className="mapa-pestana-panel mapa-pestana-panel--scroll"
            data-testid="pestana-exportar"
          >
            <VistaExportar />
          </div>
        )}

      </div>
    </div>
  )
}
