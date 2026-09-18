'use client'

import type { JSX } from 'react'
import Link from 'next/link'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { AlertaActiva } from '@/lib/infraestructura/consulta'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { CATEGORIA_META } from '@/lib/infraestructura/categorias'

function fechaLegible(iso: string): string {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? iso : fecha.toLocaleDateString('es-AR')
}

export function FichaAlerta(props: {
  alertas: AlertaActiva[]
  mostrarEnlaceNominal: boolean
}): JSX.Element {
  const styles = useOverlayStyles()

  if (props.alertas.length === 0) {
    return <></>
  }

  const primera = props.alertas[0]
  const cantidad = props.alertas.length

  return (
    <div className={styles.popup}>
      <div className={styles.popupTitle}>{primera.nombre}</div>
      <div className={styles.popupMuted}>
        {primera.localidad}, {primera.departamento}
      </div>
      <div className={styles.popupRow}>
        {cantidad === 1
          ? '1 alerta activa en este establecimiento'
          : `${cantidad} alertas activas en este establecimiento`}
      </div>
      <hr className={styles.popupRule} />
      {props.alertas.map((alerta) => (
        <div key={alerta.id} className={styles.popupRow}>
          <span
            className={styles.swatch}
            style={{ backgroundColor: colorSeveridad(alerta.severidad) }}
          />
          {alerta.severidad} · {alerta.motivo}
          <div className={styles.popupMuted}>
            {CATEGORIA_META[alerta.categoria].label} · {fechaLegible(alerta.creadaEn)}
          </div>
        </div>
      ))}
      {props.mostrarEnlaceNominal && (
        <>
          <hr className={styles.popupRule} />
          <Link href={`/infraestructura/afectados/${primera.id}`}>Ver alumnos alcanzados</Link>
        </>
      )}
    </div>
  )
}
