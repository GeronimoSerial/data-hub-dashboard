import type { ReactNode } from 'react'
import type { PestanaMapa } from '@/lib/infraestructura/mapa/tipos'
import { PanelEncabezado } from './panel-encabezado'
import { useTextos } from '@/lib/i18n/idioma-provider'

type PestanaConMapa = Exclude<PestanaMapa, 'estadisticas' | 'metodologia' | 'exportar'>

export interface PanelLateralProps {
  pestana: PestanaConMapa
  /** Selección vigente PARA la pestaña activa (cue de la escuela), o null. */
  seleccion: string | null
  onCerrarFicha: () => void
  /** Ficha de la selección; sólo se muestra si hay `seleccion`. */
  ficha?: ReactNode
  /** Cabecera compartida por las pestañas, oculta mientras se muestra una ficha. */
  cabecera?: ReactNode
  /** Subtítulos visibles junto al título de cada pestaña. */
  subtitulos?: Partial<Record<PestanaConMapa, ReactNode>>
  actual: ReactNode
  radar: ReactNode
  planificacion: ReactNode
  capas: ReactNode
}

export function PanelLateral(props: PanelLateralProps) {
  const t = useTextos()
  const titulos: Record<PestanaConMapa, string> = {
    actual: t.controlesCapas.pestanas.actual,
    radar: 'Radar',
    planificacion: t.controlesCapas.pestanas.planificacion,
    capas: t.controlesCapas.capas,
  }
  let contenido = props.actual
  const mostrandoFicha = props.seleccion !== null && props.ficha != null
  if (mostrandoFicha) {
    contenido = props.ficha
  } else if (props.pestana === 'radar') {
    contenido = props.radar
  } else if (props.pestana === 'planificacion') {
    contenido = props.planificacion
  } else if (props.pestana === 'capas') {
    contenido = props.capas
  }

  // Lo invocan las fichas que se montan acá desde la Task 13.
  return (
    <div className="map-panel-lateral" data-testid="panel-lateral">
      {!mostrandoFicha && <PanelEncabezado titulo={titulos[props.pestana]} subtitulo={props.subtitulos?.[props.pestana]} />}
      <div className="map-panel-lateral__cuerpo" data-testid="panel-cuerpo">
        {!mostrandoFicha && props.cabecera}
        {contenido}
      </div>
    </div>
  )
}
