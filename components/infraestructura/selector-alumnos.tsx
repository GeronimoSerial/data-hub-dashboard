'use client'

import { useState, type JSX } from 'react'
import { ChevronDown } from 'lucide-react'
import { Opcion } from '@/components/ui/opcion'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import { useTextos } from '@/lib/i18n/idioma-provider'

const colacionAlumnos = new Intl.Collator('es-AR')

export function seccionesDeAlumnos(turnos: TurnoContexto[], alumnos: number[]): number[] {
  const marcados = new Set(alumnos)
  return turnos.flatMap((t) =>
    t.niveles.flatMap((n) =>
      n.secciones.filter((s) => s.alumnos.some((a) => marcados.has(a.gePersonId))).map((s) => s.geSectionId),
    ),
  )
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
  const t = useTextos().parteGaleria.alumnos
  const [abiertas, setAbiertas] = useState<Set<number>>(() => new Set(seccionesDeAlumnos(turnos, alumnosSeleccionados)))
  const [busquedas, setBusquedas] = useState<Record<number, string>>({})

  function alternarAlumno(gePersonId: number, marcar: boolean) {
    const siguiente = marcar
      ? [...alumnosSeleccionados, gePersonId]
      : alumnosSeleccionados.filter((id) => id !== gePersonId)
    onCambiar(seccionesDeAlumnos(turnos, siguiente), siguiente)
  }

  function alternarSeccionCompleta(gePersonIds: number[], marcar: boolean) {
    const idsSeccion = new Set(gePersonIds)
    const siguiente = marcar
      ? [...alumnosSeleccionados.filter((id) => !idsSeccion.has(id)), ...gePersonIds]
      : alumnosSeleccionados.filter((id) => !idsSeccion.has(id))
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
          <h3>{t.turnoResumen(turno.turno, elegidosTurno, alumnosTurno.length)}</h3>
          {turno.niveles.map((nivel) => {
            return <div className="secciones-selector__nivel" key={nivel.nivel}>
            <h4>{nivel.nivel}</h4>
            {nivel.secciones.map((seccion) => {
              const elegidos = seccion.alumnos.filter((a) => marcados.has(a.gePersonId)).length
              const completa = seccion.alumnos.length > 0 && elegidos === seccion.alumnos.length
              const abierta = abiertas.has(seccion.geSectionId)
              const panelId = `selector-alumnos-${seccion.geSectionId}`
              return (
                <div key={seccion.geSectionId} className="selector-alumnos__seccion">
                  <div className="selector-alumnos__cabecera">
                    <button
                      type="button"
                      className="selector-alumnos__desplegar"
                      aria-expanded={abierta}
                      aria-controls={panelId}
                      onClick={() => alternarSeccion(seccion.geSectionId)}
                      disabled={disabled}
                    >
                      <span className="selector-alumnos__titulo">{t.seccionTitulo(seccion.curso, seccion.division, elegidos, seccion.alumnos.length)}</span>
                      <span className="selector-alumnos__accion">{t.elegir}</span>
                      <ChevronDown size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <div id={panelId} hidden={!abierta} className="selector-alumnos__lista">
                    <Opcion
                      tipo="checkbox"
                      label={completa ? t.quitarSeccion : t.marcarSeccion}
                      checked={completa}
                      indeterminate={elegidos > 0 && !completa}
                      onChange={(event) => alternarSeccionCompleta(seccion.alumnos.map((alumno) => alumno.gePersonId), event.currentTarget.checked)}
                      disabled={disabled || seccion.alumnos.length === 0}
                      compacta
                    />
                    {seccion.alumnos.length > 10 ? <input
                      className="secciones-selector__busqueda"
                      type="search"
                      aria-label={t.buscarDe(seccion.curso, seccion.division)}
                      placeholder={t.buscar}
                      value={busquedas[seccion.geSectionId] ?? ''}
                      onChange={(event) => setBusquedas((actual) => ({ ...actual, [seccion.geSectionId]: event.target.value }))}
                    /> : null}
                    {seccion.alumnos
                      .filter((alumno) => `${alumno.apellido} ${alumno.nombre}`.toLocaleLowerCase('es-AR').includes((busquedas[seccion.geSectionId] ?? '').toLocaleLowerCase('es-AR')))
                      .sort((a, b) => colacionAlumnos.compare(a.apellido, b.apellido) || colacionAlumnos.compare(a.nombre, b.nombre))
                      .map((alumno) => (
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
        {t.resumenAfectados(alumnosSeleccionados.length, totalSecciones)}
      </p>
    </div>
  )
}
