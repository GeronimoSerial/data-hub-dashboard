'use client'

import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import { Checkbox } from '@/components/ui/checkbox'

export interface SeccionesSelectorProps {
  turnos: TurnoContexto[]
  seleccionadas: number[]
  onCambiar: (geSectionIds: number[]) => void
  disabled?: boolean
}

function aplanarGeSectionIds(turnos: TurnoContexto[]): number[] {
  return turnos.flatMap((turno) =>
    turno.niveles.flatMap((nivel) => nivel.secciones.map((seccion) => seccion.geSectionId)),
  )
}

export function SeccionesSelector({ turnos, seleccionadas, onCambiar, disabled }: SeccionesSelectorProps) {
  const todosLosIds = aplanarGeSectionIds(turnos)
  const setSeleccionadas = new Set(seleccionadas)
  const todasSeleccionadas =
    todosLosIds.length > 0 &&
    seleccionadas.length === todosLosIds.length &&
    todosLosIds.every((id) => setSeleccionadas.has(id))

  return (
    <div className="secciones-selector">
      <Checkbox
        label="Todas las secciones"
        checked={todasSeleccionadas}
        onCheckedChange={(checked: boolean) => onCambiar(checked ? todosLosIds : [])}
        disabled={disabled}
      />

      {turnos.map((turno) => (
        <section className="secciones-selector__turno" key={turno.turno}>
          <h3>{turno.turno}</h3>

          {turno.niveles.map((nivel) => (
            <div className="secciones-selector__nivel" key={nivel.nivel}>
              <h4>{nivel.nivel}</h4>

              {nivel.secciones.map((seccion) => (
                <Checkbox
                  key={seccion.geSectionId}
                  label={`${seccion.curso} "${seccion.division}" — ${seccion.matricula} alumnos`}
                  checked={seleccionadas.includes(seccion.geSectionId)}
                  onCheckedChange={(checked: boolean) =>
                    onCambiar(
                      checked
                        ? [...seleccionadas, seccion.geSectionId]
                        : seleccionadas.filter((id) => id !== seccion.geSectionId),
                    )
                  }
                  disabled={disabled}
                />
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
