'use client'

import type { JSX } from 'react'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { IndicadoresMapa } from '@/lib/infraestructura/parte-mapa'

export function Indicadores(props: {
  indicadores: IndicadoresMapa
  loading: boolean
}): JSX.Element {
  const styles = useOverlayStyles()
  const { indicadores, loading } = props

  return (
    <div className={`${styles.panel} ${styles.titlePanel}`}>
      <b>Indicadores consolidados</b>
      <br />
      <span className={styles.hint}>
        Totales sobre las escuelas y filtros aplicados.
      </span>
      <div>
        Escuelas: <span className={styles.emphasis}>{indicadores.escuelas}</span>
      </div>
      <div>
        Con servicio suspendido:{' '}
        <span className={styles.emphasis}>{indicadores.conServicioSuspendido}</span>
      </div>
      <div>
        Con servicio parcial:{' '}
        <span className={styles.emphasis}>{indicadores.conServicioParcial}</span>
      </div>
      <div>
        Evacuadas: <span className={styles.emphasis}>{indicadores.evacuadas}</span>
      </div>
      <div>
        Centros de evacuados:{' '}
        <span className={styles.emphasis}>{indicadores.centrosDeEvacuados}</span>
      </div>
      <div>
        Sin reportar: <span className={styles.emphasis}>{indicadores.sinReportar}</span>
      </div>
      <div>
        Alumnos alcanzados:{' '}
        <span className={styles.emphasis}>{indicadores.alumnosAlcanzados}</span>
      </div>
      <div>
        Secciones alcanzadas:{' '}
        <span className={styles.emphasis}>{indicadores.seccionesAlcanzadas}</span>
      </div>
      {loading && <span className={styles.hint}>Actualizando…</span>}
    </div>
  )
}
