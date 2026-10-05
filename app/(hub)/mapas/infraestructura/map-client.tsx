'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { pestanaDeMapa, resolverPestana } from '@/lib/infraestructura/mapa/pestanas'
import { filtrarEscuelas } from '@/lib/infraestructura/mapa/filtrar'
import { resumir } from '@/lib/infraestructura/mapa/agregar'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa, type PestanaMapa } from '@/lib/infraestructura/mapa/tipos'
import { FiltrosChips } from '@/components/mapas/filtros-chips'
import { PanelEstadisticas } from '@/components/mapas/panel-estadisticas'
import { useEscuelasMapa } from '@/lib/infraestructura/use-escuelas-mapa'
import type { EscuelaMapaPadron } from '@/lib/infraestructura/parte-mapa'

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
  hazardContextEnabled?: boolean
  riskRadarEnabled?: boolean
  seasonalEnabled?: boolean
}) {
  const [tab, setTab] = React.useState<PestanaMapa>('actual')
  const seleccionarEscuelaRef = React.useRef<((escuela: EscuelaMapaPadron) => void) | null>(null)
  const registrarSeleccion = React.useCallback((fn: ((escuela: EscuelaMapaPadron) => void) | null) => {
    seleccionarEscuelaRef.current = fn
  }, [])
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

  function seleccionarEscuela(cueAnexo: string) {
    const escuela = padron?.escuelas.find((item) => item.cueAnexo === cueAnexo)
    if (!escuela) return
    seleccionarEscuelaRef.current?.(escuela)
  }

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
  }, [props.riskRadarEnabled])

  return (
    <div className="mapa-pestanas">
      <div className="mapa-pestanas-barra">
        <Tabs value={tab} onValueChange={onTab}>
          <TabsList>
            <TabsTab
              value="actual"
              aria-label={cantidadConReporte > 0
                ? `Situación actual, ${cantidadConReporte} ${cantidadConReporte === 1 ? 'escuela' : 'escuelas'} con situaciones abiertas`
                : undefined}
            >
              Situación actual
              {cantidadConReporte > 0 && (
                <span className="map-sitact__pill map-sitact__pill--neutro ui-tabs-tab__contador" aria-hidden="true">
                  {cantidadConReporte}
                </span>
              )}
            </TabsTab>
            {props.riskRadarEnabled && <TabsTab value="radar">Radar</TabsTab>}
            <TabsTab value="planificacion">Planificación</TabsTab>
            <TabsTab value="estadisticas">Estadísticas</TabsTab>
            <TabsTab value="capas">Capas</TabsTab>
          </TabsList>
        </Tabs>
      </div>

      <FiltrosChips
        escuelas={padron?.escuelas ?? []}
        filtros={filtros}
        onChange={setFiltros}
        onSeleccionar={seleccionarEscuela}
      />

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
        <div className="mapa-pestana-panel" data-testid="pestana-mapa">
          <MapInfraestructuraPage
            mostrarEnlaceNominal={props.mostrarEnlaceNominal}
            hazardContextEnabled={props.hazardContextEnabled ?? false}
            riskRadarEnabled={props.riskRadarEnabled ?? false}
            seasonalEnabled={props.seasonalEnabled ?? false}
            pestana={pestanaDeMapa(tab)}
            panel={tab}
            estadisticas={<PanelEstadisticas escuelas={escuelasFiltradas} filtros={filtros} />}
            escuelasMapa={escuelasMapa}
            onRegistrarSeleccion={registrarSeleccion}
          />
        </div>

      </div>
    </div>
  )
}
