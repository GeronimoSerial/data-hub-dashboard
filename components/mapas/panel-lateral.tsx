import type { ReactNode } from 'react'
import type { PestanaMapa } from '@/lib/infraestructura/mapa/tipos'

export interface PanelLateralProps {
  pestana: Exclude<PestanaMapa, 'estadisticas'>
  /** Selección vigente PARA la pestaña activa (cue de la escuela), o null. */
  seleccion: string | null
  onCerrarFicha: () => void
  /** Ficha de la selección; sólo se muestra si hay `seleccion`. */
  ficha?: ReactNode
  actual: ReactNode
  radar: ReactNode
  planificacion: ReactNode
}

export function PanelLateral(props: PanelLateralProps) {
  let contenido = props.actual
  if (props.seleccion !== null && props.ficha != null) {
    contenido = props.ficha
  } else if (props.pestana === 'radar') {
    contenido = props.radar
  } else if (props.pestana === 'planificacion') {
    contenido = props.planificacion
  }

  // Lo invocan las fichas que se montan acá desde la Task 13.
  return <div className="map-panel-lateral" data-testid="panel-lateral">{contenido}</div>
}
