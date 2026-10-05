import type { ReactNode } from 'react'

export interface PanelEncabezadoProps {
  titulo: string
  subtitulo?: ReactNode
}

export function PanelEncabezado({ titulo, subtitulo }: PanelEncabezadoProps) {
  return (
    <header className="map-panel-lateral__encabezado" data-testid="panel-encabezado">
      <h2>{titulo}</h2>
      {subtitulo != null && <span>{subtitulo}</span>}
    </header>
  )
}
