'use client'

import * as React from 'react'
import diagnosticStyles from '@/components/mapas/natalidad-diagnostico.module.css'
import dynamic from 'next/dynamic'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import type { DatosNatalidad } from '@/lib/mapas/natalidad'
import type { construirSnapshotRenaper } from '@/lib/mapas/renaper-natalidad'
import { construirDatosNatalidadRenaper } from '@/lib/mapas/datos-natalidad-renaper'

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
  const [fuente, setFuente] = React.useState<'renaper' | 'deis'>('renaper')
  const [datosPorFuente, setDatosPorFuente] = React.useState<Record<'renaper' | 'deis', DatosNatalidad | null>>({ renaper: null, deis: null })
  const [errores, setErrores] = React.useState<Record<string, string>>({})
  const [notaRenaper, setNotaRenaper] = React.useState('')
  const datos = datosPorFuente[fuente]

  React.useEffect(() => {
    let cancelado = false
    const cargar = async <T,>(archivo: string): Promise<T> => {
      const response = await fetch(`/data/natalidad/${archivo}.json`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    }
    const base = cargar<DatosNatalidad>('departamentos')
    base.then((deis) => {
      if (!cancelado) setDatosPorFuente((prev) => ({ ...prev, deis }))
    }).catch(() => {
      if (!cancelado) setErrores((prev) => ({ ...prev, deis: 'No se pudo cargar DEIS.' }))
    })
    Promise.all([base, cargar<ReturnType<typeof construirSnapshotRenaper>>('renaper')])
      .then(([deis, renaper]) => {
        const actualizado = construirDatosNatalidadRenaper(deis, renaper)
        if (cancelado) return
        setDatosPorFuente((prev) => ({ ...prev, renaper: actualizado }))
        setNotaRenaper(`Corte: ${renaper.meta.corteFuente}. Serie independiente de DEIS. Diferencia entre el total provincial y la suma departamental en ${actualizado.meta.anioFin}: ${renaper.conciliacion[actualizado.meta.anioFin].diferenciaProvincia}; se conserva sin redistribuir.`)
      }).catch(() => {
        if (!cancelado) setErrores((prev) => ({ ...prev, renaper: 'No se pudo cargar RENAPER. DEIS está disponible como fuente alternativa.' }))
      })
    return () => { cancelado = true }
  }, [])

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
      <div className={diagnosticStyles.fuente}>
        <label className="map-filtro-label" htmlFor="fuente-natalidad">Fuente de natalidad</label>
        <select id="fuente-natalidad" className="map-filtro-input" value={fuente}
          onChange={(event) => setFuente(event.target.value === 'deis' ? 'deis' : 'renaper')}>
          <option value="renaper">RENAPER · 2012–2025</option>
          <option value="deis">DEIS · 2014–2023</option>
        </select>
      </div>
      </div>

      {errores[fuente] ? <p role="alert">{errores[fuente]}</p> : !datos ? <p role="status">Cargando {fuente.toUpperCase()}…</p> : <div className="mapa-pestanas-cuerpo">
        {/* El mapa NUNCA se desmonta al cambiar de pestaña (misma regla F5.1
            que infraestructura): sólo se oculta con [hidden], así MapLibre no
            pierde el encuadre ni vuelve a bajar el basemap al volver. */}
        <div className="mapa-pestana-panel" hidden={!mapaVisible} data-testid="pestana-mapa">
          <MapNatalidadPage visible={mapaVisible} datos={datos} notaFuente={fuente === 'renaper' ? notaRenaper : ''} />
        </div>

        {/* Estadísticas sí se monta/desmonta: es un fetch + gráficos, sin
            estado caro que preservar. */}
        {tab === 'estadisticas' && (
          <div className="mapa-pestana-panel mapa-pestana-panel--scroll" data-testid="pestana-estadisticas">
            <EstadisticasNatalidadPanel datos={datos} />
          </div>
        )}
      </div>}
    </div>
  )
}
