import { BookOpen, ExternalLink } from 'lucide-react'
import styles from './materiales-tras-reporte.module.css'

export function MaterialesTrasReporte() {
  return (
    <aside className={styles.offer} aria-label="Materiales de consulta">
      <BookOpen size={22} strokeWidth={1.7} aria-hidden="true" />
      <div>
        <h3>Materiales para consultar sin conexión</h3>
        <p>Guardá el manual de reportes y los cuadernillos de asistencia pedagógica para tenerlos a mano.</p>
        <a href="/materiales" target="_blank" rel="noopener noreferrer">
          Ver manuales y cuadernillos
          <ExternalLink size={16} aria-hidden="true" />
          <span className="sr-only"> (abre en otra pestaña)</span>
        </a>
      </div>
    </aside>
  )
}
