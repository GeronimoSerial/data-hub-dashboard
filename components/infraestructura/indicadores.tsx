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

  // Orden estable y explícito: es el que se muestra en pantalla (no depende
  // del orden de las claves del objeto). Se mantiene tal cual estaba.
  const items: { label: string; valor: number }[] = [
    { label: 'Escuelas con parte vigente', valor: indicadores.escuelas },
    { label: 'Con servicio suspendido', valor: indicadores.conServicioSuspendido },
    { label: 'Con servicio parcial', valor: indicadores.conServicioParcial },
    { label: 'Evacuadas', valor: indicadores.evacuadas },
    { label: 'Centros de evacuados', valor: indicadores.centrosDeEvacuados },
    { label: 'Sin reportar', valor: indicadores.sinReportar },
    { label: 'Alumnos alcanzados', valor: indicadores.alumnosAlcanzados },
    { label: 'Secciones alcanzadas', valor: indicadores.seccionesAlcanzadas },
  ]

  return (
    <div className={`${styles.panel} ${styles.titlePanel}`}>
      <b>Indicadores consolidados</b>
      <br />
      <span className={styles.hint}>
        Totales sobre las escuelas y filtros aplicados. Cuenta los partes
        vigentes aunque la escuela no tenga ubicación en el mapa, por eso puede
        diferir del contador del padrón.
      </span>
      <div className="map-indicadores-grid">
        {items.map((item) => (
          <div className="map-indicador" key={item.label}>
            <span className="map-indicador__valor">{item.valor}</span>
            <span className="map-indicador__label">{item.label}</span>
          </div>
        ))}
      </div>
      {loading && <span className={styles.hint}>Actualizando…</span>}
    </div>
  )
}
