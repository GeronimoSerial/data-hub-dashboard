'use client'

import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  tipo: 'radio' | 'checkbox'
  label: ReactNode
  ayuda?: ReactNode
  className?: string
  compacta?: boolean
  indeterminate?: boolean
}

/** Opción táctil con input nativo accesible y control dibujado por la aplicación. */
export function Opcion({ tipo, label, ayuda, className, compacta = false, indeterminate = false, ...inputProps }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <label className={cn('opcion', compacta && 'opcion--compacta', className)} data-indeterminate={indeterminate || undefined}>
      <input ref={inputRef} className="opcion__input" type={tipo} {...inputProps} />
      <span className="opcion__indicador" aria-hidden="true" />
      <span className="opcion__contenido">
        <span className="opcion__label">{label}</span>
        {ayuda ? <span className="opcion__ayuda">{ayuda}</span> : null}
      </span>
    </label>
  )
}
