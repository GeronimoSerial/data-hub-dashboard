'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { resolverPestana } from '@/lib/infraestructura/mapa/pestanas'
import { filtrarEscuelas } from '@/lib/infraestructura/mapa/filtrar'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa, type PestanaMapa } from '@/lib/infraestructura/mapa/tipos'
import { FiltrosChips } from '@/components/mapas/filtros-chips'
import { useEscuelasMapa } from '@/lib/infraestructura/use-escuelas-mapa'

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

// Carga diferida al igual que el mapa: Recharts pesa y sólo hace falta cuando
// alguien abre la pestaña de evolución, así el primer viewport del mapa no
// arrastra el bundle de los gráficos.
const EvolucionPanel = dynamic(
  () =>
    import('@/components/infraestructura/evolucion-panel').then(
      (modulo) => modulo.EvolucionPanel,
    ),
  { ssr: false, loading: () => <p>Cargando evolución…</p> },
)

export function InfraestructuraMapClient(props: {
  mostrarEnlaceNominal: boolean
  hazardContextEnabled?: boolean
  riskRadarEnabled?: boolean
  seasonalEnabled?: boolean
}) {
  const [tab, setTab] = React.useState<PestanaMapa>('actual')
  const [filtros, setFiltros] = React.useState<FiltrosMapa>(FILTROS_MAPA_VACIOS)
  const { data: padron } = useEscuelasMapa()
  const escuelasFiltradas = React.useMemo(
    () => filtrarEscuelas(padron?.escuelas ?? [], filtros),
    [padron, filtros],
  )
  const escuelasMapa = React.useMemo(
    () => padron ? { ...padron, escuelas: escuelasFiltradas } : null,
    [padron, escuelasFiltradas],
  )
  const [ultimaPestanaMapa, setUltimaPestanaMapa] = React.useState<
    Exclude<PestanaMapa, 'estadisticas'>
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

  const mapaVisible = tab !== 'estadisticas'
  if (tab !== 'estadisticas' && tab !== ultimaPestanaMapa) {
    setUltimaPestanaMapa(tab)
  }

  return (
    <div className="mapa-pestanas">
      <div className="mapa-pestanas-barra">
        <Tabs value={tab} onValueChange={onTab}>
          <TabsList>
            <TabsTab value="actual">Situación actual</TabsTab>
            {props.riskRadarEnabled && <TabsTab value="radar">Radar</TabsTab>}
            <TabsTab value="planificacion">Planificación</TabsTab>
            <TabsTab value="estadisticas">Estadísticas</TabsTab>
          </TabsList>
        </Tabs>
      </div>

      <FiltrosChips
        escuelas={padron?.escuelas ?? []}
        filtros={filtros}
        onChange={setFiltros}
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
        <div className="mapa-pestana-panel" hidden={!mapaVisible} data-testid="pestana-mapa">
          <MapInfraestructuraPage
            mostrarEnlaceNominal={props.mostrarEnlaceNominal}
            hazardContextEnabled={props.hazardContextEnabled ?? false}
            riskRadarEnabled={props.riskRadarEnabled ?? false}
            seasonalEnabled={props.seasonalEnabled ?? false}
            pestana={ultimaPestanaMapa}
            visible={mapaVisible}
            escuelasMapa={escuelasMapa}
          />
        </div>

        {/*
          La pestaña de Estadísticas sí se monta y desmonta: son gráficos y un
          fetch, sin estado caro que preservar, y así el pedido a /evolucion
          sólo se hace cuando alguien la abre. La regla de no desmontar es
          exclusiva del mapa, por lo que cuesta remontar.
        */}
        {tab === 'estadisticas' && (
          <div
            className="mapa-pestana-panel mapa-pestana-panel--scroll"
            data-testid="pestana-estadisticas"
          >
            {/* El batch 5 lo reemplaza por PanelEstadisticas. */}
            <EvolucionPanel />
          </div>
        )}
      </div>
    </div>
  )
}
