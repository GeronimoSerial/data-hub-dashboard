'use client'

import type { JSX } from 'react'
import Link from 'next/link'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { CATEGORIA_META } from '@/lib/infraestructura/categorias'
import { ETIQUETA_ESTABLECIMIENTO, ETIQUETA_SERVICIO } from './estado-actual-textos'
import { formatearFechaRelativa } from '@/lib/model'

// Ficha mínima sobre ParteMapa (Fase 2): un punto ahora es una escuela, no
// una alerta suelta, así que esta ficha ya no itera una lista de alertas
// sino que muestra el parte entero — estado de servicio, estado del
// establecimiento, y cada afectación vigente con su descripción libre (que
// hasta esta fase no se mostraba en ningún lado). El rediseño a modal
// completo es Fase 3 (F3.2): esto sólo evita que la ficha se rompa y expone
// los datos nuevos.
export function FichaAlerta(props: {
  parte: ParteMapa | null
  mostrarEnlaceNominal: boolean
}): JSX.Element {
  const styles = useOverlayStyles()
  const { parte } = props

  if (!parte) {
    return <></>
  }

  // Enlace provisional: apunta a la primera afectación vigente. La página de
  // destino (app/(hub)/infraestructura/afectados/[problematicaId]) todavía
  // consulta contra el modelo deprecado (F3.3 repunta problematicaId a
  // afectacionId) — fuera de alcance de esta fase, se deja tal cual estaba.
  const primeraAfectacion = parte.afectaciones[0]

  return (
    <div className={styles.popup}>
      <div className={styles.popupTitle}>{parte.nombre}</div>
      <div className={styles.popupMuted}>
        {parte.localidad}, {parte.departamento}
      </div>

      <div className={styles.popupRow}>
        <span
          className={styles.swatch}
          style={{ backgroundColor: colorSeveridad(parte.peorSeveridad) }}
        />
        {ETIQUETA_SERVICIO[parte.servicio]} · {ETIQUETA_ESTABLECIMIENTO[parte.estadoEstablecimiento]}
      </div>
      <div className={styles.popupMuted}>
        {parte.seccionesAlcanzadas} secciones · {parte.alumnosAlcanzados} alumnos alcanzados
      </div>
      <div className={styles.popupMuted}>
        Actualizado {formatearFechaRelativa(parte.actualizadaEn)}
      </div>

      <hr className={styles.popupRule} />
      {parte.afectaciones.map((afectacion) => (
        <div key={afectacion.id} className={styles.popupRow}>
          <span
            className={styles.swatch}
            style={{ backgroundColor: colorSeveridad(afectacion.severidad) }}
          />
          {afectacion.severidad} · {afectacion.motivo}
          <div className={styles.popupMuted}>
            {CATEGORIA_META[afectacion.categoria].label} · desde{' '}
            {formatearFechaRelativa(afectacion.rigeDesde)}
          </div>
          {afectacion.descripcion && (
            <div className={styles.popupMuted}>{afectacion.descripcion}</div>
          )}
        </div>
      ))}

      {props.mostrarEnlaceNominal && primeraAfectacion && (
        <>
          <hr className={styles.popupRule} />
          <Link href={`/infraestructura/afectados/${primeraAfectacion.id}`}>
            Ver alumnos alcanzados
          </Link>
        </>
      )}
    </div>
  )
}
