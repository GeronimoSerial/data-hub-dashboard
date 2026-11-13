import { textosActuales } from '@/lib/i18n'
import styles from './observacion-reporte.module.css'

export function ObservacionReporte({ texto }: { texto: string | null | undefined }) {
  if (texto == null || texto === '') return null

  return (
    <figure className={styles.observacion} data-testid="observacion-reporte">
      <figcaption>{textosActuales().controles.observacion.registrada}</figcaption>
      <blockquote>
        <p>{texto}</p>
      </blockquote>
    </figure>
  )
}
