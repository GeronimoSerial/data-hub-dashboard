import { useEffect } from 'react'
import { Filter, X } from 'lucide-react'
import type { TotalesDepartamento } from '@/lib/infraestructura/totales-mapa'
import { useTextos } from '@/lib/i18n/idioma-provider'
import styles from './vista-previa-escuela.module.css'
import propios from './resumen-departamento.module.css'

type TotalesResumenDepartamento = Pick<
  TotalesDepartamento,
  'departamentoOriginal' | 'totalEscuelas' | 'escuelasAfectadas' | 'porcentajeAfectadas'
>

export interface ResumenDepartamentoProps {
  nombre: string
  totales: TotalesResumenDepartamento | null
  onQuitar: () => void
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')

export function ResumenDepartamento({ nombre, totales, onQuitar }: ResumenDepartamentoProps) {
  const t = useTextos().fichaCuerpo.resumen
  useEffect(() => {
    const alPresionarTecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onQuitar()
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [onQuitar])

  return (
    <section className={`${styles.card} ${propios.card}`} aria-label={`Departamento ${nombre}`}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <p className={propios.etiqueta}><Filter size={12} aria-hidden="true" />{t.filtroActivo}</p>
          <h2 className={styles.title}>{nombre}</h2>
          <p className={styles.meta}>
            Departamento{totales ? t.escuelas(FORMATO_NUMERO.format(totales.totalEscuelas)) : ''}
          </p>
        </div>
        <button type="button" className={styles.closeIconBtn} aria-label={t.cerrar} onClick={onQuitar}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {totales && (
        <div className={styles.impacto}>
          <p className={styles.impactoCifra}>
            <strong>{FORMATO_NUMERO.format(totales.escuelasAfectadas)}</strong>
            <span>{t.escuelasAfectadas(totales.escuelasAfectadas)}</span>
          </p>
          <p className={styles.impactoContexto}>
            {t.porcentajeDelDepartamento(totales.porcentajeAfectadas)}
          </p>
          <div className={styles.proporcion} role="img" aria-label={t.porcentajeAfectadas(totales.porcentajeAfectadas)}>
            <span style={{ width: `${totales.porcentajeAfectadas}%` }} />
          </div>
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.ghostBtn} onClick={onQuitar}>{t.quitar}</button>
      </div>
    </section>
  )
}
