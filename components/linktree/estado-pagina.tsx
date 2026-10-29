import styles from './linktree-pagina.module.css'

/** Loading and error screens for the public page, in the same frame as the page itself. */
export function EstadoPagina({
  titulo,
  detalle,
  role,
  children,
}: {
  titulo: string
  detalle?: string
  role: 'status' | 'alert'
  children?: React.ReactNode
}) {
  return (
    <div className={styles.pagina}>
      <main className={`${styles.principal} ${styles.estado}`}>
        <div className={styles.vacio} role={role}>
          <p className={styles.vacioTitulo}>{titulo}</p>
          {detalle ? <p>{detalle}</p> : null}
          {children ? <div className={styles.accion}>{children}</div> : null}
        </div>
      </main>
    </div>
  )
}
