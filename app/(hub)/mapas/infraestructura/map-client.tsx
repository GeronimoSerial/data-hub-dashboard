'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'

const MapInfraestructuraPage = dynamic(
  () => import('@/components/mapas/map-infraestructura-page'),
  { ssr: false, loading: () => <p>Cargando mapa…</p> },
)

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

// F5.1: las dos pestañas del mapa de infraestructura. `operativa` (el mapa)
// es la default; `evolucion` se abre directo con la URL #evolucion.
type PestanaMapa = 'operativa' | 'evolucion'

const PESTANAS: readonly string[] = ['operativa', 'evolucion']

function esPestana(valor: string): valor is PestanaMapa {
  return PESTANAS.includes(valor)
}

export function InfraestructuraMapClient(props: {
  mostrarEnlaceNominal: boolean
  hazardContextEnabled?: boolean
  riskRadarEnabled?: boolean
  seasonalEnabled?: boolean
}) {
  const [tab, setTab] = React.useState<PestanaMapa>('operativa')

  // Mismo patrón que AdminPage (components/admin-page.tsx:1841-1857): estado
  // local con useState espejado contra window.location.hash, para que la
  // pestaña sea linkeable. La diferencia con admin es que acá además se
  // ESCRIBE el hash al cambiar de pestaña: sin eso, la sincronía sólo serviría
  // para quien llega con un #evolucion ya armado, y no habría forma de copiar
  // una URL que lleve a la evolución desde la interfaz. El `hashchange` que
  // dispara esa escritura vuelve a llamar a setTab con el mismo valor, así que
  // no re-renderiza de más. Un hash desconocido (URL vieja o copy-paste a
  // medias) se ignora: no puede dejar la página sin ninguna pestaña activa.
  const onTab = (valor: string) => {
    if (!esPestana(valor)) return
    setTab(valor)
    if (window.location.hash.slice(1) !== valor) window.location.hash = valor
  }

  React.useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.slice(1)
      if (esPestana(hash)) setTab(hash)
    }
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  const mapaVisible = tab === 'operativa'

  return (
    <div className="mapa-pestanas">
      <div className="mapa-pestanas-barra">
        <Tabs value={tab} onValueChange={onTab}>
          <TabsList>
            <TabsTab value="operativa">Operativa</TabsTab>
            <TabsTab value="evolucion">Evolución</TabsTab>
          </TabsList>
        </Tabs>
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
        <div className="mapa-pestana-panel" hidden={!mapaVisible} data-testid="pestana-operativa">
          <MapInfraestructuraPage
            mostrarEnlaceNominal={props.mostrarEnlaceNominal}
            hazardContextEnabled={props.hazardContextEnabled ?? false}
            riskRadarEnabled={props.riskRadarEnabled ?? false}
            seasonalEnabled={props.seasonalEnabled ?? false}
          />
        </div>

        {/*
          La pestaña de evolución sí se monta y desmonta: son gráficos y un
          fetch, sin estado caro que preservar, y así el pedido a /evolucion
          sólo se hace cuando alguien la abre. La regla de no desmontar es
          exclusiva del mapa, por lo que cuesta remontar.
        */}
        {tab === 'evolucion' && (
          <div
            className="mapa-pestana-panel mapa-pestana-panel--scroll"
            data-testid="pestana-evolucion"
          >
            <EvolucionPanel />
          </div>
        )}
      </div>
    </div>
  )
}
