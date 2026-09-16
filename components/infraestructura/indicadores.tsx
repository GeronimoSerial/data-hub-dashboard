'use client'

import type { JSX } from 'react'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { IndicadoresConsolidados } from '@/lib/infraestructura/consulta'

export function Indicadores(props: {
  indicadores: IndicadoresConsolidados
  loading: boolean
}): JSX.Element {
  const styles = useOverlayStyles()
  const { indicadores, loading } = props

  return (
    <div className={`${styles.panel} ${styles.titlePanel}`}>
      <b>Indicadores consolidados</b>
      <br />
      <span className={styles.hint}>
        Totales sobre las secciones y filtros aplicados.
      </span>
      <div>
        Escuelas:{' '}
        <span className={styles.emphasis}>{indicadores.escuelas}</span>
      </div>
      <div>
        Localizaciones georreferenciadas:{' '}
        <span className={styles.emphasis}>{indicadores.localizaciones}</span>
      </div>
      <div>
        Inmuebles:{' '}
        <span className={styles.emphasis}>
          {indicadores.inmueblesDisponible
            ? indicadores.inmuebles
            : 'No disponible'}
        </span>
      </div>
      <div>
        Alumnos en alertas activas:{' '}
        <span className={styles.emphasis}>{indicadores.alumnos}</span>
      </div>
      <div>
        Universo educativo:{' '}
        <span className={styles.emphasis}>{indicadores.universoEducativo}</span>
      </div>
      {loading && <span className={styles.hint}>Actualizando…</span>}
    </div>
  )
}
