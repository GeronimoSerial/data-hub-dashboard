'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { InfraestructuraMapClient } from './map-client'
import { FullscreenButton } from '@/components/mapas/fullscreen-button'
import { useFullscreenTarget } from '@/components/ui/use-fullscreen-element'

export interface InfraestructuraLayoutShellProps {
  mostrarEnlaceNominal: boolean
  mostrarCallCenter?: boolean
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
  mostrarCallCenter = false,
  hazardContextEnabled = false,
  riskRadarEnabled = false,
  seasonalEnabled = false,
  children,
}: InfraestructuraLayoutShellProps) {
  const pathname = usePathname()
  const enMapa = esRutaRaizMapa(pathname)
  const [mapaMontado, setMapaMontado] = React.useState(enMapa)
  const pantallaCompletaRef = React.useRef<HTMLDivElement>(null)
  const pantallaCompleta = useFullscreenTarget(pantallaCompletaRef)

  if (enMapa && !mapaMontado) {
    setMapaMontado(true)
  }

  return (
    <div
      className="infraestructura-pantalla-completa"
      ref={pantallaCompletaRef}
      data-testid="infraestructura-pantalla-completa"
    >
      {pantallaCompleta && !enMapa && (
        <div className="infraestructura-pantalla-completa__acciones">
          <FullscreenButton targetRef={pantallaCompletaRef} />
        </div>
      )}
      <div className="infraestructura-pantalla-completa__contenido">
        {mapaMontado && (
          <div
            hidden={!enMapa}
            data-testid="contenedor-mapa-persistente"
            style={enMapa ? { display: 'contents' } : undefined}
          >
            <InfraestructuraMapClient
              mostrarEnlaceNominal={mostrarEnlaceNominal}
              mostrarCallCenter={mostrarCallCenter}
              hazardContextEnabled={hazardContextEnabled}
              riskRadarEnabled={riskRadarEnabled}
              seasonalEnabled={seasonalEnabled}
              rutaActiva={enMapa}
              pantallaCompletaRef={pantallaCompletaRef}
            />
          </div>
        )}
        {!enMapa ? children : null}
      </div>
    </div>
  )
}
