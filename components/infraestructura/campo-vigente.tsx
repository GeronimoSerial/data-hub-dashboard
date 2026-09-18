'use client'

import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export interface CampoVigenteProps {
  /** La pregunta, en la lengua del director. */
  etiqueta: string
  /** Lo que rige hoy, ya traducido a lenguaje llano. */
  valorVigente: string
  /** Lo que quedaría si guarda. `null` mientras no haya tocado nada. */
  valorNuevo?: string | null
  /** Devuelve la selección a "sin cambios" al cerrar. */
  onDejarComoEsta: () => void
  children: ReactNode
  disabled?: boolean
}

/**
 * Un dato del parte que ya tiene un valor vigente y que el director sólo toca
 * si cambió.
 *
 * Por qué existe: la pantalla de actualización mostraba "Estado actual: X"
 * como texto suelto y debajo un grupo de radios TODOS vacíos. Eso se lee como
 * un formulario a medio llenar — el director no sabe si tiene que volver a
 * elegir lo que ya está vigente o si dejarlo vacío significa "sin cambios".
 * Peor todavía en el servicio educativo: el estado vigente puede ser "Clases
 * parcialmente suspendidas", que es derivado (spec §3.4) y por lo tanto NO
 * figura entre las opciones ofrecidas, así que leía un estado actual que no
 * podía encontrar en la lista.
 *
 * Acá el valor vigente es una afirmación cerrada y las opciones no existen
 * hasta que el director dice que algo cambió. Es el mismo gesto que ya usa
 * VigenciaField ("Ahora" + "Cambiar"), así que la pantalla no estrena un
 * patrón: reusa el que el director ya vio.
 */
export function CampoVigente({
  etiqueta,
  valorVigente,
  valorNuevo = null,
  onDejarComoEsta,
  children,
  disabled = false,
}: CampoVigenteProps): JSX.Element {
  const [abierto, setAbierto] = useState(false)

  function cerrar() {
    onDejarComoEsta()
    setAbierto(false)
  }

  return (
    <div className={`campo-vigente${abierto ? ' campo-vigente--abierto' : ''}`}>
      <div className="campo-vigente__cabecera">
        <div className="campo-vigente__valor">
          <span className="campo-vigente__etiqueta">{etiqueta}</span>
          <span className="campo-vigente__actual">{valorVigente}</span>
          {valorNuevo && (
            <span className="campo-vigente__nuevo">Va a quedar: {valorNuevo}</span>
          )}
        </div>
        {abierto ? (
          <Button type="button" variant="ghost" onClick={cerrar} disabled={disabled}>
            Dejar como está
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setAbierto(true)} disabled={disabled}>
            Cambiar
          </Button>
        )}
      </div>

      {abierto && <div className="campo-vigente__cuerpo">{children}</div>}
    </div>
  )
}
