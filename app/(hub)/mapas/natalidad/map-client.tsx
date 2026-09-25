'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'

// Carga diferida sin SSR, mismo patrón que InfraestructuraMapClient
// (app/(hub)/mapas/infraestructura/map-client.tsx): MapLibre depende del DOM
// y del worker de tiles, no puede renderizarse en el servidor.
const MapNatalidadPage = dynamic(() => import('@/components/mapas/map-natalidad-page'), {
  ssr: false,
  loading: () => <p>Cargando mapa…</p>,
})

// T8: Recharts pesa y sólo hace falta cuando alguien abre la pestaña de
// estadísticas, así el primer viewport del mapa no arrastra ese bundle
// (mismo patrón que EvolucionPanel en el mapa de infraestructura).
const EstadisticasNatalidadPanel = dynamic(
  () =>
    import('@/components/mapas/estadisticas-natalidad-panel').then(
      (modulo) => modulo.EstadisticasNatalidadPanel,
    ),
  { ssr: false, loading: () => <p>Cargando estadísticas…</p> },
)

type PestanaNatalidad = 'mapa' | 'estadisticas'

const PESTANAS: readonly string[] = ['mapa', 'estadisticas']

function esPestana(valor: string): valor is PestanaNatalidad {
  return PESTANAS.includes(valor)
}

export function NatalidadMapClient() {
  const [tab, setTab] = React.useState<PestanaNatalidad>('mapa')

  // Mismo patrón que InfraestructuraMapClient: estado espejado contra
  // window.location.hash, para que la pestaña sea linkeable.
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

  const mapaVisible = tab === 'mapa'

  return (
    <div className="mapa-pestanas">
      <div className="mapa-pestanas-barra">
        <Tabs value={tab} onValueChange={onTab}>
          <TabsList>
            <TabsTab value="mapa">Mapa</TabsTab>
            <TabsTab value="estadisticas">Estadísticas</TabsTab>
          </TabsList>
        </Tabs>
      </div>

      <div className="mapa-pestanas-cuerpo">
        {/* El mapa NUNCA se desmonta al cambiar de pestaña (misma regla F5.1
            que infraestructura): sólo se oculta con [hidden], así MapLibre no
            pierde el encuadre ni vuelve a bajar el basemap al volver. */}
        <div className="mapa-pestana-panel" hidden={!mapaVisible} data-testid="pestana-mapa">
          <MapNatalidadPage />
        </div>

        {/* Estadísticas sí se monta/desmonta: es un fetch + gráficos, sin
            estado caro que preservar. */}
        {tab === 'estadisticas' && (
          <div className="mapa-pestana-panel mapa-pestana-panel--scroll" data-testid="pestana-estadisticas">
            <EstadisticasNatalidadPanel />
          </div>
        )}
      </div>
    </div>
  )
}
