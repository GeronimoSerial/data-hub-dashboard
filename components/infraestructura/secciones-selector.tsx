'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SeccionContexto, TurnoContexto } from '@/lib/infraestructura/contexto'
import { Opcion } from '@/components/ui/opcion'
import { useTextos } from '@/lib/i18n/idioma-provider'

export interface SeccionesSelectorProps {
  turnos: TurnoContexto[]
  seleccionadas: number[]
  alumnosSeleccionados: number[]
  onCambiar: (geSectionIds: number[], alumnosSeleccionados: number[]) => void
  disabled?: boolean
  // Por defecto true para no romper a los llamadores existentes. En false
  // (categoría 'establecimiento', ver CATEGORIA_META): no se ofrece "Elegir
  // alumnos" ni el panel de alumnos, y tildar/destildar una sección nunca
  // pasa por aplicarEfectivo — siempre emite alumnosSeleccionados vacío.
  permiteAlumnos?: boolean
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
  permiteAlumnos = true,
}: SeccionesSelectorProps) {
  const [expandidas, setExpandidas] = useState<Set<number>>(() =>
    seccionesAbiertasAlMontar(turnos, alumnosSeleccionados),
  )
  const [busquedas, setBusquedas] = useState<Record<number, string>>({})
  const t = useTextos().parteGaleria

  function alternarExpansion(geSectionId: number) {
    setExpandidas((actuales) => {
      const siguiente = new Set(actuales)
      if (siguiente.has(geSectionId)) siguiente.delete(geSectionId)
      else siguiente.add(geSectionId)
      return siguiente
    })
  }

  const todosLosIds = aplanarGeSectionIds(turnos)
  const matriculaTotal = turnos.flatMap((t) => t.niveles.flatMap((n) => n.secciones)).reduce((suma, s) => suma + s.matricula, 0)
  const setSeleccionadas = new Set(seleccionadas)
  const todasSeleccionadas =
    todosLosIds.length > 0 &&
    seleccionadas.length === todosLosIds.length &&
    todosLosIds.every((id) => setSeleccionadas.has(id)) &&
    alumnosSeleccionados.length === 0

  function alternarSeccion(seccion: SeccionContexto, marcar: boolean) {
    // Categoría sin selección nominal (permiteAlumnos: false): la sección es
    // todo o nada, nunca pasa por aplicarEfectivo ni por la lista de alumnos
    // explícitos. Se comporta como el checkbox simple de siempre.
    if (!permiteAlumnos) {
      onCambiar(
        marcar ? [...seleccionadas, seccion.geSectionId] : seleccionadas.filter((id) => id !== seccion.geSectionId),
        [],
      )
      return
    }
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

  function alternarTurno(turno: TurnoContexto, marcar: boolean) {
    let siguientes = [...seleccionadas]
    let alumnosSiguientes = [...alumnosSeleccionados]
    for (const seccion of turno.niveles.flatMap((nivel) => nivel.secciones)) {
      if (!permiteAlumnos || seccion.alumnos.length === 0) {
        siguientes = marcar
          ? [...siguientes.filter((id) => id !== seccion.geSectionId), seccion.geSectionId]
          : siguientes.filter((id) => id !== seccion.geSectionId)
        if (marcar && !permiteAlumnos) alumnosSiguientes = []
        continue
      }
      const resultado = aplicarEfectivo(
        seccion,
        marcar ? new Set(seccion.alumnos.map((alumno) => alumno.gePersonId)) : new Set<number>(),
        siguientes,
        alumnosSiguientes,
      )
      siguientes = resultado.seleccionadas
      alumnosSiguientes = resultado.alumnosSeleccionados
    }
    onCambiar(siguientes, alumnosSiguientes)
  }

  return (
    <div className="secciones-selector">
      <Opcion
        tipo="checkbox"
        label={t.secciones.todas(seleccionadas.length, todosLosIds.length, matriculaTotal)}
        checked={todasSeleccionadas}
        onChange={(event) => onCambiar(event.currentTarget.checked ? todosLosIds : [], [])}
        disabled={disabled}
      />

      {turnos.map((turno) => {
        const seccionesTurno = turno.niveles.flatMap((nivel) => nivel.secciones)
        const seccionesCompletas = seccionesTurno.filter((seccion) => {
          const efectivos = efectivoDeSeccion(seccion, seleccionadas, alumnosSeleccionados)
          return seleccionadas.includes(seccion.geSectionId) &&
            (!permiteAlumnos || seccion.alumnos.length === 0 || efectivos.size === seccion.alumnos.length)
        }).length
        const todasDelTurno = seccionesTurno.length > 0 && seccionesCompletas === seccionesTurno.length
        return (
        <section className="secciones-selector__turno" key={turno.turno}>
          <Opcion
            tipo="checkbox"
            className="secciones-selector__turno-opcion"
            label={t.secciones.todoTurno(turno.turno)}
            checked={todasDelTurno}
            onChange={(event) => alternarTurno(turno, event.currentTarget.checked)}
            disabled={disabled}
            compacta
          />
          <h3>{t.secciones.resumenTurno(turno.turno, turno.niveles.reduce((n, nivel) => n + nivel.secciones.filter((s) => setSeleccionadas.has(s.geSectionId)).length, 0), turno.niveles.reduce((n, nivel) => n + nivel.secciones.length, 0))}</h3>

          {turno.niveles.map((nivel) => (
            <div className="secciones-selector__nivel" key={nivel.nivel}>
              <h4>{t.secciones.resumenNivel(nivel.nivel, nivel.secciones.filter((s) => setSeleccionadas.has(s.geSectionId)).length, nivel.secciones.length)}</h4>

              {nivel.secciones.map((seccion) => {
                const efectivo = efectivoDeSeccion(seccion, seleccionadas, alumnosSeleccionados)
                const seccionSeleccionada = seleccionadas.includes(seccion.geSectionId)
                const esParcial =
                  permiteAlumnos &&
                  seccionSeleccionada &&
                  seccion.alumnos.length > 0 &&
                  efectivo.size < seccion.alumnos.length
                const ofreceAlumnos = permiteAlumnos && seccion.alumnos.length > 0

                const expandida = expandidas.has(seccion.geSectionId)
                const panelId = `secciones-selector-alumnos-${seccion.geSectionId}`

                return (
                  <div className="secciones-selector__seccion" key={seccion.geSectionId}>
                    <div className="secciones-selector__fila">
                      <Opcion
                        tipo="checkbox"
                        label={`${seccion.curso} "${seccion.division}"`}
                        ayuda={t.secciones.matricula(seccion.matricula)}
                        checked={seccionSeleccionada && !esParcial}
                        indeterminate={esParcial}
                        onChange={(event) => alternarSeccion(seccion, event.currentTarget.checked)}
                        disabled={disabled}
                        compacta
                      />

                      {ofreceAlumnos && (
                        <button
                          type="button"
                          className="secciones-selector__toggle"
                          aria-expanded={expandida}
                          aria-controls={panelId}
                          aria-label={t.secciones.elegirAria(efectivo.size, seccion.alumnos.length)}
                          onClick={() => alternarExpansion(seccion.geSectionId)}
                        >
                          {efectivo.size === 0 ? t.alumnos.elegir : t.secciones.elegidosDe(efectivo.size, seccion.alumnos.length)}
                          <ChevronDown size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {ofreceAlumnos && (
                      <div className="secciones-selector__alumnos" id={panelId} hidden={!expandida}>
                        {seccion.alumnos.length > 10 ? (
                          <input
                            className="secciones-selector__busqueda"
                            type="search"
                            aria-label={t.alumnos.buscarDe(seccion.curso, seccion.division)}
                            placeholder={t.alumnos.buscar}
                            value={busquedas[seccion.geSectionId] ?? ''}
                            onChange={(event) => setBusquedas((actual) => ({ ...actual, [seccion.geSectionId]: event.target.value }))}
                          />
                        ) : null}
                        {seccion.alumnos.filter((alumno) => `${alumno.apellido} ${alumno.nombre}`.toLocaleLowerCase('es').includes((busquedas[seccion.geSectionId] ?? '').toLocaleLowerCase('es'))).map((alumno) => (
                          <Opcion
                            key={alumno.gePersonId}
                            tipo="checkbox"
                            label={`${alumno.apellido}, ${alumno.nombre}`}
                            checked={efectivo.has(alumno.gePersonId)}
                            onChange={(event) =>
                              alternarAlumno(seccion, alumno.gePersonId, event.currentTarget.checked)
                            }
                            disabled={disabled}
                            compacta
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
        )
      })}
    </div>
  )
}
