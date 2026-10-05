'use client'

import { useState, type JSX } from 'react'
import { ChevronDown } from 'lucide-react'
import { Opcion } from '@/components/ui/opcion'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'

export function seccionesDeAlumnos(turnos: TurnoContexto[], alumnos: number[]): number[] {
  const marcados = new Set(alumnos)
  return turnos.flatMap((t) =>
    t.niveles.flatMap((n) =>
      n.secciones.filter((s) => s.alumnos.some((a) => marcados.has(a.gePersonId))).map((s) => s.geSectionId),
    ),
  )
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

// En la categoría alumnos se eligen personas; las secciones sólo agrupan la
// lista. Siempre se conserva la lista explícita de alumnos, incluso cuando se
// selecciona a todo el curso.
export function SelectorAlumnos({
  turnos,
  alumnosSeleccionados,
  onCambiar,
  disabled = false,
}: {
  turnos: TurnoContexto[]
  alumnosSeleccionados: number[]
  onCambiar: (secciones: number[], alumnos: number[]) => void
  disabled?: boolean
}): JSX.Element {
  const marcados = new Set(alumnosSeleccionados)
  const [abiertas, setAbiertas] = useState<Set<number>>(() => new Set(seccionesDeAlumnos(turnos, alumnosSeleccionados)))
  const [busquedas, setBusquedas] = useState<Record<number, string>>({})

  function alternarAlumno(gePersonId: number, marcar: boolean) {
    const siguiente = marcar
      ? [...alumnosSeleccionados, gePersonId]
      : alumnosSeleccionados.filter((id) => id !== gePersonId)
    onCambiar(seccionesDeAlumnos(turnos, siguiente), siguiente)
  }

  function alternarSeccion(id: number) {
    setAbiertas((actual) => {
      const siguiente = new Set(actual)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  const totalSecciones = seccionesDeAlumnos(turnos, alumnosSeleccionados).length

  return (
    <div className="selector-alumnos">
      {turnos.map((turno) => {
        const alumnosTurno = turno.niveles.flatMap((nivel) => nivel.secciones.flatMap((seccion) => seccion.alumnos))
        const elegidosTurno = alumnosTurno.filter((alumno) => marcados.has(alumno.gePersonId)).length
        return (
        <section key={turno.turno} className="secciones-selector__turno">
          <h3>{turno.turno} · {elegidosTurno} de {alumnosTurno.length} alumnos</h3>
          {turno.niveles.map((nivel) => {
            const alumnosNivel = nivel.secciones.flatMap((seccion) => seccion.alumnos)
            const elegidosNivel = alumnosNivel.filter((alumno) => marcados.has(alumno.gePersonId)).length
            return <div className="secciones-selector__nivel" key={nivel.nivel}>
            <h4>{nivel.nivel} · {elegidosNivel} de {alumnosNivel.length} alumnos</h4>
            {nivel.secciones.map((seccion) => {
              const elegidos = seccion.alumnos.filter((a) => marcados.has(a.gePersonId)).length
              const abierta = abiertas.has(seccion.geSectionId)
              const panelId = `selector-alumnos-${seccion.geSectionId}`
              return (
                <div key={seccion.geSectionId} className="selector-alumnos__seccion">
                  <button
                    type="button"
                    className="selector-alumnos__cabecera"
                    aria-expanded={abierta}
                    aria-controls={panelId}
                    onClick={() => alternarSeccion(seccion.geSectionId)}
                    disabled={disabled}
                  >
                    <span>{`Elegir alumnos (${elegidos} de ${seccion.alumnos.length}) · ${seccion.curso} "${seccion.division}"`}</span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  <div id={panelId} hidden={!abierta} className="selector-alumnos__lista">
                    {seccion.alumnos.length > 10 ? <input
                      className="secciones-selector__busqueda"
                      type="search"
                      aria-label={`Buscar alumnos de ${seccion.curso} ${seccion.division}`}
                      placeholder="Buscar alumno"
                      value={busquedas[seccion.geSectionId] ?? ''}
                      onChange={(event) => setBusquedas((actual) => ({ ...actual, [seccion.geSectionId]: event.target.value }))}
                    /> : null}
                    {seccion.alumnos.filter((alumno) => `${alumno.apellido} ${alumno.nombre}`.toLocaleLowerCase('es').includes((busquedas[seccion.geSectionId] ?? '').toLocaleLowerCase('es'))).map((alumno) => (
                      <Opcion
                        key={alumno.gePersonId}
                        tipo="checkbox"
                        label={`${alumno.apellido}, ${alumno.nombre}`}
                        checked={marcados.has(alumno.gePersonId)}
                        onChange={(event) => alternarAlumno(alumno.gePersonId, event.currentTarget.checked)}
                        disabled={disabled}
                        compacta
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>})}
        </section>
        )
      })}
      <p className="afectacion-borrador__resumen" aria-live="polite">
        {`${plural(alumnosSeleccionados.length, 'alumno afectado', 'alumnos afectados')} en ${plural(totalSecciones, 'sección', 'secciones')}`}
      </p>
    </div>
  )
}
