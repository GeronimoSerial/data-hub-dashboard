'use client'

import { BookOpen, ExternalLink } from 'lucide-react'
import { useTextos } from '@/lib/i18n/idioma-provider'
import styles from './materiales-tras-reporte.module.css'

export function MaterialesTrasReporte() {
  const t = useTextos().parteResto
  return (
    <aside className={styles.offer} aria-label={t.materiales.ariaLabel}>
      <BookOpen size={22} strokeWidth={1.7} aria-hidden="true" />
      <div>
        <h3>{t.materiales.titulo}</h3>
        <p>{t.materiales.texto}</p>
        <a href="/materiales" target="_blank" rel="noopener noreferrer">
          {t.materiales.ver}
          <ExternalLink size={16} aria-hidden="true" />
          <span className="sr-only"> {t.abreEnOtraPestana}</span>
        </a>
      </div>
    </aside>
  )
}
