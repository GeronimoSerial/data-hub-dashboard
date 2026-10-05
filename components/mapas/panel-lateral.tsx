import type { ReactNode } from 'react'
import type { PestanaMapa } from '@/lib/infraestructura/mapa/tipos'
import { PanelEncabezado } from './panel-encabezado'

const TITULOS: Record<PestanaMapa, string> = {
  actual: 'Situación actual',
  radar: 'Radar',
  planificacion: 'Planificación',
  estadisticas: 'Estadísticas',
  capas: 'Capas',
}

export interface PanelLateralProps {
  pestana: PestanaMapa
  /** Selección vigente PARA la pestaña activa (cue de la escuela), o null. */
  seleccion: string | null
  onCerrarFicha: () => void
  /** Ficha de la selección; sólo se muestra si hay `seleccion`. */
  ficha?: ReactNode
  /** Cabecera compartida por las pestañas, oculta mientras se muestra una ficha. */
  cabecera?: ReactNode
  /** Subtítulos visibles junto al título de cada pestaña. */
  subtitulos?: Partial<Record<PestanaMapa, ReactNode>>
  actual: ReactNode
  radar: ReactNode
  planificacion: ReactNode
  estadisticas: ReactNode
  capas: ReactNode
}

export function PanelLateral(props: PanelLateralProps) {
  let contenido = props.actual
  const mostrandoFicha = props.seleccion !== null && props.ficha != null
  if (mostrandoFicha) {
    contenido = props.ficha
  } else if (props.pestana === 'radar') {
    contenido = props.radar
  } else if (props.pestana === 'planificacion') {
    contenido = props.planificacion
  } else if (props.pestana === 'estadisticas') {
    contenido = props.estadisticas
  } else if (props.pestana === 'capas') {
    contenido = props.capas
  }

  // Lo invocan las fichas que se montan acá desde la Task 13.
  return (
    <div className="map-panel-lateral" data-testid="panel-lateral">
      {!mostrandoFicha && <PanelEncabezado titulo={TITULOS[props.pestana]} subtitulo={props.subtitulos?.[props.pestana]} />}
      <div className="map-panel-lateral__cuerpo" data-testid="panel-cuerpo">
        {!mostrandoFicha && props.cabecera}
        {contenido}
      </div>
    </div>
  )
}
