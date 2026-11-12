'use client'

import { useId, type JSX } from 'react'
import { rangoVigencia } from '@/lib/infraestructura/vigencia-rango'
import { resumenVigencia, type EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'
import { useTextos } from '@/lib/i18n/idioma-provider'

const OPCIONES: Array<{ modo: EleccionVigencia['modo']; clave: 'ahora' | 'hoy' | 'otro' }> = [
  { modo: 'ahora', clave: 'ahora' },
  { modo: 'hoy', clave: 'hoy' },
  { modo: 'otro', clave: 'otro' },
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
  etiquetaMomento?: string
  minimo?: string
}

export function VigenciaChips({ value, onChange, label, disabled = false, error = null, etiquetaMomento, minimo }: VigenciaChipsProps): JSX.Element {
  const id = useId()
  const dic = useTextos()
  const t = dic.fichaPanorama.vigencia
  const { min, max } = rangoVigencia()
  const fechaMinima = minimo && Date.parse(minimo) > min.getTime() ? new Date(minimo) : min
  const mostrarResumen = value.modo === 'hoy'
    ? Boolean(value.hora)
    : value.modo === 'otro' && Boolean(value.fecha && value.hora)

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
            <span>{t[opcion.clave]}</span>
          </label>
        ))}
      </div>

      {value.modo !== 'ahora' && (
        <div className="vigencia-chips__campos">
          {value.modo === 'otro' && (
            <label className="ui-label" htmlFor={`${id}-fecha`}>
              {t.fecha}
              <input
                id={`${id}-fecha`}
                type="date"
                lang="es-AR"
                min={fechaInput(fechaMinima)}
                max={fechaInput(max)}
                value={value.fecha}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(evento) => onChange({ ...value, fecha: evento.target.value })}
              />
            </label>
          )}
          <label className="ui-label" htmlFor={`${id}-hora`}>
            Hora
            <input
              id={`${id}-hora`}
              type="time"
              lang="es-AR"
              value={value.hora}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(evento) => onChange({ ...value, hora: evento.target.value })}
            />
          </label>
        </div>
      )}

      {error ? <p id={`${id}-error`} className="vigencia-field__error" role="alert">{error}</p> : null}
      {!error && mostrarResumen ? <p className={`vigencia-chips__resumen${etiquetaMomento === 'Se solucionó' ? ' vigencia-chips__resumen--solucionada' : ''}`} aria-live="polite">{resumenVigencia(value, etiquetaMomento, dic)}</p> : null}
    </fieldset>
  )
}
