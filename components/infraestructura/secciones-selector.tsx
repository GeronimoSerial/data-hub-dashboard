'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SeccionContexto, TurnoContexto } from '@/lib/infraestructura/contexto'
import { Checkbox } from '@/components/ui/checkbox'

export interface SeccionesSelectorProps {
  turnos: TurnoContexto[]
  seleccionadas: number[]
  alumnosSeleccionados: number[]
  onCambiar: (geSectionIds: number[], alumnosSeleccionados: number[]) => void
  disabled?: boolean
}

function aplanarGeSectionIds(turnos: TurnoContexto[]): number[] {
  return turnos.flatMap((turno) =>
    turno.niveles.flatMap((nivel) => nivel.secciones.map((seccion) => seccion.geSectionId)),
  )
}

function aplanarSecciones(turnos: TurnoContexto[]): SeccionContexto[] {
  return turnos.flatMap((turno) => turno.niveles.flatMap((nivel) => nivel.secciones))
}

// Una escuela real trae decenas de secciones por cientos de alumnos: con todo
// desplegado el formulario es un muro de checkboxes. Arrancan plegadas, salvo
// las que ya traen alumnos elegidos explícitamente, porque esa selección vive
// adentro del panel y plegarla la escondería.
function seccionesAbiertasAlMontar(
  turnos: TurnoContexto[],
  alumnosSeleccionados: number[],
): Set<number> {
  const abiertas = new Set<number>()
  for (const seccion of aplanarSecciones(turnos)) {
    if (seccion.alumnos.some((alumno) => alumnosSeleccionados.includes(alumno.gePersonId))) {
      abiertas.add(seccion.geSectionId)
    }
  }
  return abiertas
}

// Alumnos explícitamente seleccionados que pertenecen a esta sección, según
// la semántica de validacion.ts: sección seleccionada sin ninguno de sus
// alumnos en la lista explícita = sección completa (todo el mundo marcado).
function efectivoDeSeccion(
  seccion: SeccionContexto,
  seleccionadas: number[],
  alumnosSeleccionados: number[],
): Set<number> {
  if (!seleccionadas.includes(seccion.geSectionId)) return new Set()
  const idsSeccion = seccion.alumnos.map((a) => a.gePersonId)
  const explicitos = idsSeccion.filter((id) => alumnosSeleccionados.includes(id))
  return new Set(explicitos.length > 0 ? explicitos : idsSeccion)
}

// Traduce el conjunto "efectivo" (quiénes quedan marcados en esta sección)
// de vuelta a (secciones, alumnos): vacío = sección afuera; completo = sección
// adentro sin alumnos explícitos; cualquier otro tamaño = sección adentro con
// esos alumnos como lista explícita. Nunca deja una sección parcial con la
// lista completa de sus alumnos: eso colapsa a "sección completa" para que
// el checkbox de sección vuelva a mostrarse marcado, no indeterminado.
function aplicarEfectivo(
  seccion: SeccionContexto,
  efectivo: Set<number>,
  seleccionadas: number[],
  alumnosSeleccionados: number[],
): { seleccionadas: number[]; alumnosSeleccionados: number[] } {
  const idsSeccion = seccion.alumnos.map((a) => a.gePersonId)
  const otrasSecciones = seleccionadas.filter((id) => id !== seccion.geSectionId)
  const alumnosDeOtrasSecciones = alumnosSeleccionados.filter((id) => !idsSeccion.includes(id))

  if (efectivo.size === 0) {
    return { seleccionadas: otrasSecciones, alumnosSeleccionados: alumnosDeOtrasSecciones }
  }
  if (efectivo.size === idsSeccion.length) {
    return {
      seleccionadas: [...otrasSecciones, seccion.geSectionId],
      alumnosSeleccionados: alumnosDeOtrasSecciones,
    }
  }
  return {
    seleccionadas: [...otrasSecciones, seccion.geSectionId],
    alumnosSeleccionados: [...alumnosDeOtrasSecciones, ...idsSeccion.filter((id) => efectivo.has(id))],
  }
}

export function SeccionesSelector({
  turnos,
  seleccionadas,
  alumnosSeleccionados,
  onCambiar,
  disabled,
}: SeccionesSelectorProps) {
  const [expandidas, setExpandidas] = useState<Set<number>>(() =>
    seccionesAbiertasAlMontar(turnos, alumnosSeleccionados),
  )

  function alternarExpansion(geSectionId: number) {
    setExpandidas((actuales) => {
      const siguiente = new Set(actuales)
      if (siguiente.has(geSectionId)) siguiente.delete(geSectionId)
      else siguiente.add(geSectionId)
      return siguiente
    })
  }

  const todosLosIds = aplanarGeSectionIds(turnos)
  const setSeleccionadas = new Set(seleccionadas)
  const todasSeleccionadas =
    todosLosIds.length > 0 &&
    seleccionadas.length === todosLosIds.length &&
    todosLosIds.every((id) => setSeleccionadas.has(id)) &&
    alumnosSeleccionados.length === 0
  const algunaSeleccionada = seleccionadas.length > 0 || alumnosSeleccionados.length > 0

  function alternarSeccion(seccion: SeccionContexto, marcar: boolean) {
    // Sin identidades de alumnos cargadas (padrón nominal no importado
    // todavía, o sección sin matrícula): se comporta como el checkbox simple
    // de siempre, sin tocar alumnosSeleccionados.
    if (seccion.alumnos.length === 0) {
      onCambiar(
        marcar ? [...seleccionadas, seccion.geSectionId] : seleccionadas.filter((id) => id !== seccion.geSectionId),
        alumnosSeleccionados,
      )
      return
    }
    const efectivoNuevo = marcar ? new Set(seccion.alumnos.map((a) => a.gePersonId)) : new Set<number>()
    const resultado = aplicarEfectivo(seccion, efectivoNuevo, seleccionadas, alumnosSeleccionados)
    onCambiar(resultado.seleccionadas, resultado.alumnosSeleccionados)
  }

  function alternarAlumno(seccion: SeccionContexto, gePersonId: number, marcar: boolean) {
    const efectivoActual = efectivoDeSeccion(seccion, seleccionadas, alumnosSeleccionados)
    const efectivoNuevo = new Set(efectivoActual)
    if (marcar) efectivoNuevo.add(gePersonId)
    else efectivoNuevo.delete(gePersonId)
    const resultado = aplicarEfectivo(seccion, efectivoNuevo, seleccionadas, alumnosSeleccionados)
    onCambiar(resultado.seleccionadas, resultado.alumnosSeleccionados)
  }

  return (
    <div className="secciones-selector">
      <Checkbox
        label="Todas las secciones"
        checked={todasSeleccionadas}
        indeterminate={!todasSeleccionadas && algunaSeleccionada}
        onCheckedChange={(checked: boolean) => onCambiar(checked ? todosLosIds : [], [])}
        disabled={disabled}
      />

      {turnos.map((turno) => (
        <section className="secciones-selector__turno" key={turno.turno}>
          <h3>{turno.turno}</h3>

          {turno.niveles.map((nivel) => (
            <div className="secciones-selector__nivel" key={nivel.nivel}>
              <h4>{nivel.nivel}</h4>

              {nivel.secciones.map((seccion) => {
                const efectivo = efectivoDeSeccion(seccion, seleccionadas, alumnosSeleccionados)
                const seccionSeleccionada = seleccionadas.includes(seccion.geSectionId)
                const esParcial =
                  seccionSeleccionada && seccion.alumnos.length > 0 && efectivo.size < seccion.alumnos.length

                const expandida = expandidas.has(seccion.geSectionId)
                const panelId = `secciones-selector-alumnos-${seccion.geSectionId}`

                return (
                  <div className="secciones-selector__seccion" key={seccion.geSectionId}>
                    <div className="secciones-selector__fila">
                      <Checkbox
                        label={`${seccion.curso} "${seccion.division}" — ${seccion.matricula} alumnos`}
                        checked={seccionSeleccionada && !esParcial}
                        indeterminate={esParcial}
                        onCheckedChange={(checked: boolean) => alternarSeccion(seccion, checked)}
                        disabled={disabled}
                      />

                      {seccion.alumnos.length > 0 && (
                        <button
                          type="button"
                          className="secciones-selector__toggle"
                          aria-expanded={expandida}
                          aria-controls={panelId}
                          onClick={() => alternarExpansion(seccion.geSectionId)}
                        >
                          {expandida ? 'Ocultar alumnos' : 'Elegir alumnos'}
                          <ChevronDown size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {seccion.alumnos.length > 0 && (
                      <div className="secciones-selector__alumnos" id={panelId} hidden={!expandida}>
                        {seccion.alumnos.map((alumno) => (
                          <Checkbox
                            key={alumno.gePersonId}
                            label={`${alumno.apellido}, ${alumno.nombre}`}
                            checked={efectivo.has(alumno.gePersonId)}
                            onCheckedChange={(checked: boolean) =>
                              alternarAlumno(seccion, alumno.gePersonId, checked)
                            }
                            disabled={disabled}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
