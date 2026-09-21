'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface VigenciaFieldProps {
  /**
   * ISO 8601 timestamp (the same representation `new Date().toISOString()`
   * produces, matching every other timestamp column in `lib/db/schema.ts`)
   * the change is in effect from.
   */
  value: string
  /** Called with the new ISO 8601 timestamp whenever the director picks a date or time. */
  onChange: (value: string) => void
  /**
   * Field legend. Defaults to the plain question §12 itself asks ("desde
   * cuándo rige"), not the bare noun phrase: a director reading "Rige desde"
   * over a collapsed word has to work out that it is a question about when
   * the change takes effect.
   */
  label?: string
  id?: string
  disabled?: boolean
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local (not UTC) `YYYY-MM-DD`, the shape `<input type="date">` expects. */
function fechaLocalInput(fecha: Date): string {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`
}

/** Local (not UTC) `HH:mm`, the shape `<input type="time">` expects. */
function horaLocalInput(fecha: Date): string {
  return `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`
}

/**
 * Plain-language echo of the chosen moment, matching the spec's own worked
 * example (§13: "Rige desde el 18 de septiembre a las 10:30") — so the
 * director can read back what they set without interpreting two raw
 * date/time widgets themselves.
 */
function resumenLegible(fecha: Date): string {
  const dia = fecha.getDate()
  const mes = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(fecha)
  return `Desde el ${dia} de ${mes} a las ${horaLocalInput(fecha)}`
}

/**
 * "Rige desde" vigencia primitive (spec §12).
 *
 * Starts collapsed, showing the word "Ahora" — never a pre-filled date/time
 * input. Date and time stay hidden until the director presses "Cambiar".
 * Once expanded, either an earlier or a later moment is valid; neither
 * direction is clamped.
 *
 * Uses native `<input type="date">` / `<input type="time">` on purpose, not
 * a custom picker: same reasoning as the native `<select>` in
 * `formulario-problematica.tsx` — this is filled by a non-technical director
 * on a phone, and native controls give the OS picker, full keyboard and
 * screen-reader support, and no touch/scroll bugs for free.
 */
export function VigenciaField({
  value,
  onChange,
  label = '¿Desde cuándo rige este cambio?',
  id,
  disabled = false,
}: VigenciaFieldProps) {
  const generatedId = useId()
  const baseId = id ?? generatedId
  const panelId = `${baseId}-panel`
  const dateId = `${baseId}-fecha`
  const timeId = `${baseId}-hora`

  const [expandido, setExpandido] = useState(false)
  // Si el director ELIGIÓ un momento, o sigue rigiendo el valor por defecto.
  // Es estado propio y no algo derivado del reloj a propósito: comparar
  // `value` contra `Date.now()` haría que la etiqueta pasara sola de "Desde
  // ahora" a una fecha concreta al minuto de abierto el formulario, sin que
  // el director tocara nada.
  const [momentoElegido, setMomentoElegido] = useState(false)
  const fechaInputRef = useRef<HTMLInputElement>(null)
  const cambiarBotonRef = useRef<HTMLButtonElement>(null)
  const esPrimerRender = useRef(true)

  const fecha = new Date(value)
  const fechaValida = !Number.isNaN(fecha.getTime())

  // Move focus to the control that makes sense for the direction just
  // taken: into the date input on expand, back onto "Cambiar" when
  // returning to "Ahora" — in both cases the control the user just
  // activated disappears (`hidden`), so focus would otherwise be lost.
  // Skipped on mount: there is no prior user action to follow up on yet.
  useEffect(() => {
    if (esPrimerRender.current) {
      esPrimerRender.current = false
      return
    }
    if (expandido) {
      fechaInputRef.current?.focus()
    } else {
      cambiarBotonRef.current?.focus()
    }
  }, [expandido])

  // Returns to the "Ahora" default: collapses the panel and re-captures a
  // fresh "now" rather than keeping whatever custom moment was mid-edit, so
  // "Ahora" always means the actual current moment (Nielsen #3 — this is
  // the field's one required emergency exit, spec §12 has no back button).
  function volverAAhora() {
    setExpandido(false)
    setMomentoElegido(false)
    onChange(new Date().toISOString())
  }

  function actualizarFecha(fechaTexto: string) {
    if (!fechaTexto) return
    setMomentoElegido(true)
    const [anio, mes, dia] = fechaTexto.split('-').map(Number)
    const base = fechaValida ? new Date(fecha) : new Date()
    base.setFullYear(anio, mes - 1, dia)
    onChange(base.toISOString())
  }

  function actualizarHora(horaTexto: string) {
    if (!horaTexto) return
    setMomentoElegido(true)
    const [horas, minutos] = horaTexto.split(':').map(Number)
    const base = fechaValida ? new Date(fecha) : new Date()
    base.setHours(horas, minutos, 0, 0)
    onChange(base.toISOString())
  }

  return (
    <fieldset className="vigencia-field" disabled={disabled}>
      <legend className="ui-label">{label}</legend>

      {/* §12 fija el valor inicial "Ahora" y que fecha y hora permanezcan
          ocultas hasta pulsar "Cambiar": eso se conserva. Lo que cambia es
          que el estado colapsado ahora AFIRMA algo legible en vez de mostrar
          una palabra suelta. */}
      <div className="vigencia-field__resumen" hidden={expandido}>
        <span className="vigencia-field__ahora">
          {momentoElegido && fechaValida ? resumenLegible(fecha) : 'Desde ahora'}
        </span>
        <Button
          ref={cambiarBotonRef}
          type="button"
          variant="secondary"
          aria-expanded={expandido}
          aria-controls={panelId}
          onClick={() => setExpandido(true)}
        >
          Cambiar
        </Button>
      </div>

      <div className="vigencia-field__panel" id={panelId} hidden={!expandido}>
        <div className="vigencia-field__inputs">
          <div className="vigencia-field__campo">
            <label htmlFor={dateId} className="ui-label">
              Fecha
            </label>
            <input
              ref={fechaInputRef}
              type="date"
              id={dateId}
              className="ui-input"
              value={fechaValida ? fechaLocalInput(fecha) : ''}
              onChange={(evento) => actualizarFecha(evento.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="vigencia-field__campo">
            <label htmlFor={timeId} className="ui-label">
              Hora
            </label>
            <input
              type="time"
              id={timeId}
              className="ui-input"
              value={fechaValida ? horaLocalInput(fecha) : ''}
              onChange={(evento) => actualizarHora(evento.target.value)}
              disabled={disabled}
            />
          </div>
        </div>

        {/* Plain-language echo (Nielsen #1): read back what was picked
            without interpreting the raw widgets above. aria-live announces
            it to screen-reader users as it changes, with no extra step. */}
        <p className="vigencia-field__resumen-valor" aria-live="polite">
          {fechaValida ? resumenLegible(fecha) : ''}
        </p>

        {/*
          Antes acá había un solo botón, "Usar ahora", que además de ser el
          único se veía como la acción principal del panel — pero DESCARTABA
          el momento recién elegido y volvía atrás. Leía como "confirmar" y
          hacía "cancelar".

          Ahora hay una acción hacia adelante y una hacia atrás, y cada una
          dice a dónde lleva: "Listo" cierra conservando lo elegido,
          "Volver a «Desde ahora»" deshace y vuelve al valor por defecto, que
          es exactamente lo que muestra el estado colapsado.
        */}
        <div className="vigencia-field__acciones">
          <Button type="button" onClick={() => setExpandido(false)} disabled={!fechaValida}>
            Listo
          </Button>
          <Button type="button" variant="ghost" onClick={volverAAhora}>
            Volver a «Desde ahora»
          </Button>
        </div>
      </div>
    </fieldset>
  )
}
