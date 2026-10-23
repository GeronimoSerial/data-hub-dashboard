import styles from './observacion-reporte.module.css'

export function ObservacionReporte({ texto }: { texto: string | null | undefined }) {
  if (texto == null || texto === '') return null

  return (
    <figure className={styles.observacion} data-testid="observacion-reporte">
      <figcaption>Observación registrada en el reporte:</figcaption>
      <blockquote>
        <p>{texto}</p>
      </blockquote>
    </figure>
  )
}
