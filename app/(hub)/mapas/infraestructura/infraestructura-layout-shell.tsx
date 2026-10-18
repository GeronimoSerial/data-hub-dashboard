'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { InfraestructuraMapClient } from './map-client'

export interface InfraestructuraLayoutShellProps {
  mostrarEnlaceNominal: boolean
  hazardContextEnabled?: boolean
  riskRadarEnabled?: boolean
  seasonalEnabled?: boolean
  children: React.ReactNode
}

export function esRutaRaizMapa(pathname: string | null): boolean {
  if (!pathname) return false
  return pathname === '/mapas/infraestructura' || pathname === '/mapas/infraestructura/'
}

export function InfraestructuraLayoutShell({
  mostrarEnlaceNominal,
  hazardContextEnabled = false,
  riskRadarEnabled = false,
  seasonalEnabled = false,
  children,
}: InfraestructuraLayoutShellProps) {
  const pathname = usePathname()
  const enMapa = esRutaRaizMapa(pathname)
  const [mapaMontado, setMapaMontado] = React.useState(enMapa)

  if (enMapa && !mapaMontado) {
    setMapaMontado(true)
  }

  return (
    <>
      {mapaMontado && (
        <div
          hidden={!enMapa}
          data-testid="contenedor-mapa-persistente"
          style={enMapa ? { display: 'contents' } : undefined}
        >
          <InfraestructuraMapClient
            mostrarEnlaceNominal={mostrarEnlaceNominal}
            hazardContextEnabled={hazardContextEnabled}
            riskRadarEnabled={riskRadarEnabled}
            seasonalEnabled={seasonalEnabled}
            rutaActiva={enMapa}
          />
        </div>
      )}
      {!enMapa ? children : null}
    </>
  )
}
