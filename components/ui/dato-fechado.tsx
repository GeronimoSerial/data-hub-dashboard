'use client'

import { useId, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Valor con su fecha de actualización en un tooltip (hover y foco de teclado).
 * Si la fuente superó su umbral de frescura, el valor se ve atenuado; el aviso
 * operativo de fuentes vencidas vive en el panel de salud de admin, no acá.
 */
export function DatoFechado({ actualizado, vencido = false, children, className }: {
  /** Texto del tooltip, p. ej. 'Actualizado 13/10 20:03'. */
  actualizado: string
  vencido?: boolean
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <span
      className={cn('dato-fechado', vencido && 'dato-fechado--vencido', className)}
      title={actualizado}
      tabIndex={0}
      aria-describedby={id}
    >
      {children}
      <span id={id} className="sr-only">{actualizado}</span>
    </span>
  )
}

/** Nota de procedencia o calidad del dato detrás de un ícono de info (tooltip accesible). */
export function NotaInfo({ texto, className }: { texto: string; className?: string }) {
  return (
    <span className={cn('nota-info', className)} title={texto} tabIndex={0} role="note" aria-label={texto}>
      <Info aria-hidden="true" size={14} />
    </span>
  )
}
