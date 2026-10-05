'use client'

import { useId, type JSX } from 'react'
import { rangoVigencia } from '@/lib/infraestructura/vigencia-rango'
import { resumenVigencia, type EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'

const OPCIONES: Array<{ modo: EleccionVigencia['modo']; etiqueta: string }> = [
  { modo: 'ahora', etiqueta: 'Ahora' },
  { modo: 'hoy', etiqueta: 'Hoy, más temprano' },
  { modo: 'otro', etiqueta: 'Otro día' },
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fechaInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export interface VigenciaChipsProps {
  value: EleccionVigencia
  onChange: (valor: EleccionVigencia) => void
  label: string
  disabled?: boolean
  error?: string | null
}

export function VigenciaChips({ value, onChange, label, disabled = false, error = null }: VigenciaChipsProps): JSX.Element {
  const id = useId()
  const { min, max } = rangoVigencia()

  function elegir(modo: EleccionVigencia['modo']) {
    if (modo === value.modo) return
    if (modo === 'ahora') onChange({ modo: 'ahora' })
    else if (modo === 'hoy') onChange({ modo: 'hoy', hora: '' })
    else onChange({ modo: 'otro', fecha: '', hora: '' })
  }

  return (
    <fieldset className="vigencia-chips" disabled={disabled}>
      <legend className="vigencia-chips__titulo">{label}</legend>
      <div className="vigencia-chips__opciones" role="radiogroup" aria-label={label}>
        {OPCIONES.map((opcion) => (
          <label key={opcion.modo} className="chip-radio">
            <input
              type="radio"
              name={`${id}-modo`}
              checked={value.modo === opcion.modo}
              onChange={() => elegir(opcion.modo)}
            />
            <span>{opcion.etiqueta}</span>
          </label>
        ))}
      </div>

      {value.modo !== 'ahora' && (
        <div className="vigencia-chips__campos">
          {value.modo === 'otro' && (
            <label className="ui-label" htmlFor={`${id}-fecha`}>
              Fecha
              <input
                id={`${id}-fecha`}
                type="date"
                min={fechaInput(min)}
                max={fechaInput(max)}
                value={value.fecha}
                onChange={(evento) => onChange({ ...value, fecha: evento.target.value })}
              />
            </label>
          )}
          <label className="ui-label" htmlFor={`${id}-hora`}>
            Hora
            <input
              id={`${id}-hora`}
              type="time"
              value={value.hora}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(evento) => onChange({ ...value, hora: evento.target.value })}
            />
          </label>
        </div>
      )}

      {error ? <p id={`${id}-error`} className="vigencia-field__error" role="alert">{error}</p> : null}
      {!error ? <p className="vigencia-chips__resumen" aria-live="polite">{resumenVigencia(value)}</p> : null}
    </fieldset>
  )
}
