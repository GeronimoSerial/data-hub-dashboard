'use client'

import { useId, type JSX } from 'react'
import { SeccionesSelector } from '@/components/infraestructura/secciones-selector'
import { Opcion } from '@/components/ui/opcion'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import { useTextos } from '@/lib/i18n/idioma-provider'

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
  const t = useTextos().parteGaleria.establecimiento
  return (
    <div className="selector-establecimiento">
      <div className="selector-establecimiento__opciones" role="radiogroup" aria-label={t.aria}>
        <Opcion
          tipo="radio"
          name={`${id}-alcance`}
          label={t.toda}
          checked={valor.alcance === 'toda'}
          onChange={() => onCambiar({ alcance: 'toda', secciones: idsDe(turnos) })}
          disabled={disabled}
          compacta
        />
        <Opcion
          tipo="radio"
          name={`${id}-alcance`}
          label={t.algunas}
          checked={valor.alcance === 'algunas'}
          onChange={() => onCambiar({ alcance: 'algunas', secciones: [] })}
          disabled={disabled}
          compacta
        />
      </div>

      {valor.alcance === 'algunas' ? (
        <SeccionesSelector
          turnos={turnos}
          seleccionadas={valor.secciones}
          alumnosSeleccionados={[]}
          onCambiar={(secciones) => onCambiar({ alcance: 'algunas', secciones })}
          disabled={disabled}
          permiteAlumnos={false}
        />
      ) : null}
    </div>
  )
}
