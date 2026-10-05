'use client'

import { useId, type JSX } from 'react'
import { Check } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'

export interface ValorAlcanceEstablecimiento {
  alcance: '' | 'toda' | 'algunas'
  secciones: number[]
}

function idsDe(turnos: TurnoContexto[]): number[] {
  return turnos.flatMap((t) => t.niveles.flatMap((n) => n.secciones.map((s) => s.geSectionId)))
}

// Categoría establecimiento (spec rediseño §5.5): primero una decisión
// explícita "toda / algunas". No hay checkbox maestro de tres estados: era el
// que se ponía parcial y hacía creer que se había marcado todo.
export function SelectorEstablecimiento({
  turnos,
  valor,
  onCambiar,
  disabled = false,
}: {
  turnos: TurnoContexto[]
  valor: ValorAlcanceEstablecimiento
  onCambiar: (valor: ValorAlcanceEstablecimiento) => void
  disabled?: boolean
}): JSX.Element {
  const id = useId()
  const marcadas = new Set(valor.secciones)

  function alternar(ids: number[], marcar: boolean) {
    const resto = valor.secciones.filter((s) => !ids.includes(s))
    onCambiar({ alcance: 'algunas', secciones: marcar ? [...resto, ...ids] : resto })
  }

  return (
    <div className="selector-establecimiento">
      <div className="vigencia-chips__opciones" role="radiogroup">
        <label className="chip-radio">
          <input
            type="radio"
            name={`${id}-alcance`}
            checked={valor.alcance === 'toda'}
            onChange={() => onCambiar({ alcance: 'toda', secciones: idsDe(turnos) })}
            disabled={disabled}
          />
          <span>Toda la escuela</span>
        </label>
        <label className="chip-radio">
          <input
            type="radio"
            name={`${id}-alcance`}
            checked={valor.alcance === 'algunas'}
            onChange={() => onCambiar({ alcance: 'algunas', secciones: [] })}
            disabled={disabled}
          />
          <span>Algunas secciones</span>
        </label>
      </div>

      {valor.alcance === 'algunas' &&
        turnos.map((turno) => {
          const idsTurno = turno.niveles.flatMap((n) => n.secciones.map((s) => s.geSectionId))
          const turnoCompleto = idsTurno.length > 0 && idsTurno.every((s) => marcadas.has(s))
          return (
            <section key={turno.turno} className="secciones-selector__turno">
              <Checkbox
                label={`Todo el turno ${turno.turno}`}
                checked={turnoCompleto}
                onCheckedChange={(checked: boolean) => alternar(idsTurno, checked)}
                disabled={disabled}
              />
              {turno.niveles.flatMap((nivel) =>
                nivel.secciones.map((s) => {
                  const marcada = marcadas.has(s.geSectionId)
                  return (
                    <div key={s.geSectionId} className="selector-establecimiento__seccion">
                      <Checkbox
                        label={`${s.curso} "${s.division}" · ${nivel.nivel} — ${s.matricula} alumnos`}
                        checked={marcada}
                        onCheckedChange={(checked: boolean) => alternar([s.geSectionId], checked)}
                        disabled={disabled}
                      />
                      {marcada && s.alumnos.length > 0 ? (
                        <ul className="selector-establecimiento__alumnos" aria-label={`Alumnos de ${s.curso} "${s.division}"`}>
                          {s.alumnos.map((a) => (
                            <li key={a.gePersonId}>
                              <Check size={14} aria-hidden="true" /> {`${a.apellido}, ${a.nombre}`}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )
                }),
              )}
            </section>
          )
        })}
    </div>
  )
}
