'use client'

import { impactoAlumnosEnContexto, textoImpactoAlumnos } from '@/lib/infraestructura/prioridad-alumnos'

import { useEffect, useRef, useState, type JSX } from 'react'
import { Opcion } from '@/components/ui/opcion'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { CampoGravedad, gravedadCompleta, type ValorGravedad } from '@/components/infraestructura/campo-gravedad'
import { CamposClasesEdificio, type ValorClasesEdificio } from '@/components/infraestructura/campos-clases-edificio'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { SelectorAlumnos } from '@/components/infraestructura/selector-alumnos'
import { SelectorEstablecimiento, type ValorAlcanceEstablecimiento } from '@/components/infraestructura/selector-establecimiento'
import { crearAfectacionVacia } from '@/components/infraestructura/afectacion-campos'
import { InstitutoCamposAQuienAfecta } from '@/components/infraestructura/instituto-alcance-campos'
import { CATEGORIA_META } from '@/lib/infraestructura/categorias'
import { carrerasSinAlumno, type AlumnoElegido, type CarreraElegible } from '@/lib/infraestructura/parte/instituto-ui'
import { VigenciaChips } from '@/components/infraestructura/vigencia-chips'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { ResultadoCambioAHabitual } from '@/lib/infraestructura/consistencia-estado-activo'
import type { AspectoCambio, CambioSituacion, RespuestaSituacion, SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'
import type { Severidad } from '@/lib/infraestructura/validacion'
import { VIGENCIA_AHORA, resolverVigencia, type EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'
import { respuestasDeSituacion } from '@/components/infraestructura/actualizar/consistencia-actualizacion'

const ASPECTOS: Array<{ id: AspectoCambio; etiqueta: string }> = [
  { id: 'gravedad', etiqueta: 'La gravedad' },
  { id: 'alcance', etiqueta: 'A quién afecta (secciones / alumnos)' },
  { id: 'clases-edificio', etiqueta: 'Las clases o el edificio' },
]

type Modo = 'eligiendo' | 'cambio' | 'solucion'

export interface RevisarSituacionProps {
  /** Institutos superiores: CUE de la búsqueda de alumnos. */
  cue?: string
  /** Institutos superiores: carreras del CUE para elegir el alcance. Ausente en GE. */
  carreras?: CarreraElegible[]
  situacion: SituacionRecorrido & { secciones: number[]; alumnos: number[]; carreras?: number[]; alumnosElegidos?: AlumnoElegido[] }
  turnos: TurnoContexto[]
  sugerida: Severidad | null
  respuesta: RespuestaSituacion | undefined
  faltaRespuesta: boolean
  onInteractuar: () => void
  consecuencias: SituacionRecorrido[]
  clasesEdificio: ValorClasesEdificio & { confirmarInterrupcionTotal?: boolean }
  onResponder: (respuesta: RespuestaSituacion | null) => void
  onCambiarClasesEdificio: (valor: ValorClasesEdificio & { confirmarInterrupcionTotal: boolean }) => void
  onCascada: (consecuenciaId: string, solucionadaEn: string) => void
  posicion: { actual: number; total: number }
  /** Consistencia: motivo de la situación y edificio actual de la escuela. */
  motivoId?: string | null
  estadoActual?: EstadoEstablecimiento
  afectacionesActivas?: Array<{ id: string; motivo: string }>
  onDecidirAfectacionesHabitual?: (decisiones: Record<string, 'solucionada' | 'sigue'>) => void
  /** Bloqueos y advertencias del cambio a habitual, calculados con las respuestas ya guardadas. */
  habitual?: ResultadoCambioAHabitual
  /** Por afectación activa, el bloqueo de habitual si sigue activa (ver CamposClasesEdificio). */
  bloqueosHabitualPorAfectacion?: Record<string, string>
  /** Institutos superiores: el alcance se elige por carreras. */
  esInstituto?: boolean
}

function seccionesDe(turnos: TurnoContexto[]): number[] {
  return turnos.flatMap((turno) => turno.niveles.flatMap((nivel) => nivel.secciones.map((seccion) => seccion.geSectionId)))
}

export function RevisarSituacion(p: RevisarSituacionProps): JSX.Element {
  const cambioGuardado = p.respuesta?.tipo === 'cambio' ? p.respuesta.cambio : undefined
  const [modo, setModo] = useState<Modo>(cambioGuardado ? 'cambio' : 'eligiendo')
  const [preguntandoAspectos, setPreguntandoAspectos] = useState(false)
  // GE: la gravedad de alumnos la marca la matrícula; sólo se revisa el alcance.
  const prioridadPorAlumnos = p.situacion.categoria === 'alumnos' && !p.esInstituto
  const [aspectos, setAspectos] = useState<AspectoCambio[]>((cambioGuardado?.aspectos ?? []).filter((a) => !prioridadPorAlumnos || a === 'alcance'))
  const [gravedad, setGravedad] = useState<ValorGravedad>({
    severidad: cambioGuardado?.severidad ?? p.situacion.severidad,
    justificacionCritica: cambioGuardado?.justificacionCritica ?? '',
    justificacionCriticaDetalle: cambioGuardado?.justificacionCriticaDetalle ?? '',
  })
  const [alcance, setAlcance] = useState<{
    secciones: number[]
    alumnos: number[]
    alcanceEstablecimiento: ValorAlcanceEstablecimiento['alcance']
    carreras: number[]
    alumnosElegidos: AlumnoElegido[]
  }>(() => {
    const todas = seccionesDe(p.turnos)
    const secciones = cambioGuardado?.secciones ?? p.situacion.secciones
    const cubreTodaLaEscuela = todas.length > 0 && todas.every((id) => secciones.includes(id))
    return {
      secciones,
      alumnos: cambioGuardado?.alumnos ?? p.situacion.alumnos,
      alcanceEstablecimiento: cubreTodaLaEscuela ? 'toda' : 'algunas',
      carreras: cambioGuardado?.carreras ?? p.situacion.carreras ?? [],
      alumnosElegidos: cambioGuardado?.alumnosElegidos ?? p.situacion.alumnosElegidos ?? [],
    }
  })
  // Institutos: sólo las categorías con permiteAlumnos guardan alumnos (la regla del servidor).
  const permiteAlumnos = CATEGORIA_META[p.situacion.categoria].permiteAlumnos
  const alumnosEfectivos = permiteAlumnos ? alcance.alumnosElegidos : []
  const [clases, setClases] = useState<ValorClasesEdificio>(p.clasesEdificio)
  const [interrumpeTodo, setInterrumpeTodo] = useState(p.clasesEdificio.confirmarInterrupcionTotal ?? false)
  const [cuando, setCuando] = useState<EleccionVigencia>(VIGENCIA_AHORA)
  const [errorSolucion, setErrorSolucion] = useState<string | null>(null)
  const [cascada, setCascada] = useState<{ pendientes: SituacionRecorrido[]; solucionadaEn: string } | null>(null)
  const solucionRef = useRef<HTMLDivElement>(null)

  function completarSolucion(eleccion: EleccionVigencia) {
    const solucionadaEn = resolverVigencia(eleccion)
    const anteriorAlInicio = solucionadaEn !== null && Date.parse(solucionadaEn) < Date.parse(p.situacion.rigeDesde)
    setErrorSolucion(anteriorAlInicio ? 'La fecha de solución no puede ser anterior al inicio de la situación.' : null)
    if (!solucionadaEn || anteriorAlInicio) {
      p.onResponder(null)
      setCascada(null)
      return
    }
    p.onResponder({ tipo: 'solucionada', solucionadaEn })
    setCascada(p.consecuencias.length > 0 ? { pendientes: p.consecuencias, solucionadaEn } : null)
  }

  function elegir(tipo: 'sigue' | 'cambio' | 'solucionada') {
    p.onInteractuar()
    if (tipo === 'sigue') {
      setModo('eligiendo')
      p.onResponder({ tipo: 'sigue' })
      return
    }
    if (tipo === 'cambio') {
      setPreguntandoAspectos(true)
      return
    }
    setModo('solucion')
    setCuando(VIGENCIA_AHORA)
    completarSolucion(VIGENCIA_AHORA)
  }

  function guardarCambio(
    aspectosActuales = aspectos,
    gravedadActual = gravedad,
    alcanceActual = alcance,
    clasesActuales = clases,
    interrumpeTodoActual = interrumpeTodo,
  ) {
    const alcanceCompleto = p.carreras !== undefined
      ? alcanceActual.carreras.length > 0 && !(p.situacion.categoria === 'alumnos' && carrerasSinAlumno(alcanceActual.carreras, alcanceActual.alumnosElegidos).length > 0)
      : alcanceActual.secciones.length > 0 && (p.situacion.categoria !== 'establecimiento' || alcanceActual.alcanceEstablecimiento !== '')
    const completo = aspectosActuales.length > 0 &&
      (!aspectosActuales.includes('gravedad') || gravedadCompleta(gravedadActual, p.sugerida)) &&
      (!aspectosActuales.includes('alcance') || alcanceCompleto) &&
      (!aspectosActuales.includes('clases-edificio') || Boolean(clasesActuales.servicioEstado && clasesActuales.estadoEstablecimiento))

    if (!completo) {
      p.onResponder(null)
      return
    }

    const cambio: CambioSituacion = { aspectos: aspectosActuales }
    if (aspectosActuales.includes('gravedad') && gravedadActual.severidad !== '') {
      cambio.severidad = gravedadActual.severidad
      if (gravedadActual.justificacionCritica) cambio.justificacionCritica = gravedadActual.justificacionCritica
      if (gravedadActual.justificacionCriticaDetalle) cambio.justificacionCriticaDetalle = gravedadActual.justificacionCriticaDetalle
    }
    if (aspectosActuales.includes('alcance')) {
      if (p.carreras !== undefined) {
        cambio.carreras = alcanceActual.carreras
        cambio.alumnosElegidos = permiteAlumnos ? alcanceActual.alumnosElegidos : []
        cambio.alumnos = (permiteAlumnos ? alcanceActual.alumnosElegidos : []).map((alumno) => alumno.id)
      } else {
        cambio.secciones = alcanceActual.secciones
        if (p.situacion.categoria === 'alumnos') cambio.alumnos = alcanceActual.alumnos
      }
    }
    if (aspectosActuales.includes('clases-edificio')) {
      p.onCambiarClasesEdificio({ ...clasesActuales, confirmarInterrupcionTotal: interrumpeTodoActual })
    }
    p.onResponder({ tipo: 'cambio', cambio })
  }

  const respuestasCambio = respuestasDeSituacion({
    categoria: p.situacion.categoria,
    motivoId: p.motivoId ?? null,
    severidad: gravedad.severidad || null,
    justificacionCritica: gravedad.justificacionCritica || null,
    alcance: p.carreras !== undefined || alcance.secciones.length === 0
      ? null
      : alcance.alcanceEstablecimiento === 'toda' ? { tipo: 'toda' } : { tipo: 'algunas', secciones: alcance.secciones.length },
    clases: clases.servicioEstado || null,
    edificio: clases.estadoEstablecimiento || null,
  })
  const actual = cascada?.pendientes[0]
  const cascadaAnteriorAlInicio = Boolean(actual && cascada && Date.parse(cascada.solucionadaEn) < Date.parse(actual.rigeDesde))
  const tipoRespondido = p.respuesta?.tipo
  const carrerasSinAlumnoElegido = p.carreras !== undefined && p.situacion.categoria === 'alumnos'
    ? carrerasSinAlumno(alcance.carreras, alumnosEfectivos)
    : []
  const alcanceIncompleto = p.carreras !== undefined
    ? alcance.carreras.length === 0 || carrerasSinAlumnoElegido.length > 0
    : alcance.secciones.length === 0 || (p.situacion.categoria === 'establecimiento' && alcance.alcanceEstablecimiento === '')
  const bloqueIncompleto = aspectos.includes('gravedad') && !gravedadCompleta(gravedad, p.sugerida)
    ? { id: 'revisar-situacion-gravedad', mensaje: 'Complete la gravedad de esta situación.' }
    : aspectos.includes('alcance') && alcanceIncompleto
      ? { id: 'revisar-situacion-alcance', mensaje: p.carreras !== undefined ? (alcance.carreras.length === 0 ? 'Elija al menos una carrera para esta situación.' : 'Seleccione al menos un alumno afectado en cada carrera elegida.') : 'Elija a quién afecta esta situación.' }
      : aspectos.includes('clases-edificio') && (!clases.servicioEstado || !clases.estadoEstablecimiento)
        ? { id: 'revisar-situacion-clases', mensaje: 'Indique cómo están las clases y el edificio.' }
        : null
  const bloqueIncompletoId = bloqueIncompleto?.id

  useEffect(() => {
    if (!p.faltaRespuesta) return
    const selector = modo === 'solucion'
      ? cuando.modo === 'otro' && !cuando.fecha ? 'input[type="date"]' : 'input[type="time"]'
      : modo === 'cambio' && bloqueIncompletoId
        ? `#${bloqueIncompletoId} input`
        : '.revisar-situacion__respuesta input'
    const campo = document.querySelector<HTMLElement>(selector)
    campo?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    campo?.focus()
  }, [p.faltaRespuesta, modo, cuando, bloqueIncompletoId])

  useEffect(() => {
    if (modo !== 'solucion') return
    const reducirMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    solucionRef.current?.scrollIntoView?.({ behavior: reducirMovimiento ? 'auto' : 'smooth', block: 'start' })
  }, [modo])

  return (
    <section className="revisar-situacion" aria-label={`Situación ${p.posicion.actual} de ${p.posicion.total}`}>
      <p className="asistente__contador">{`Lo que ya reportó · ${p.posicion.actual} de ${p.posicion.total}`}</p>
      <h3>{p.situacion.motivo} {!prioridadPorAlumnos && <EstadoActualSeveridad severidad={p.situacion.severidad} prefijo={false} />}</h3>
      {prioridadPorAlumnos && <p aria-live="polite">{textoImpactoAlumnos(impactoAlumnosEnContexto(alcance.alumnos, p.turnos))}</p>}
      <p className="revisar-situacion__fecha">{`Reportada ${formatearMomentoHistorial(p.situacion.creadaEn).replace(/^Hoy/, 'hoy').replace(/^(\d)/, 'el $1')}`}</p>

      <fieldset className="afectacion-campos__grupo revisar-situacion__respuesta" aria-describedby={p.faltaRespuesta && modo !== 'solucion' ? 'revisar-situacion-error' : undefined}>
        <legend className="afectacion-campos__legend">¿Cómo sigue?</legend>
        {(['sigue', 'cambio', 'solucionada'] as const).map((tipo) => (
          <Opcion
              key={tipo}
              tipo="radio"
              name={`revisar-${p.situacion.id}`}
              checked={tipoRespondido === tipo || (modo === 'solucion' && tipo === 'solucionada') || (modo === 'cambio' && tipo === 'cambio')}
              onChange={() => elegir(tipo)}
              label={tipo === 'sigue' ? 'Sigue igual' : tipo === 'cambio' ? 'Cambió' : 'Se solucionó'}
              compacta
            />
        ))}
        {p.faltaRespuesta && modo !== 'solucion' && modo !== 'cambio' ? <p id="revisar-situacion-error" className="reporte-inicial__error-campo" role="alert">Indique cómo sigue esta situación.</p> : null}
      </fieldset>

      {modo === 'cambio' && (
        <div className="revisar-situacion__bloques">
          {aspectos.includes('gravedad') && (
            <div id="revisar-situacion-gravedad" className="revisar-situacion__bloque" tabIndex={-1}>
              <CampoGravedad idPrefijo={`rev-${p.situacion.id}`} categoria={p.situacion.categoria} esInstituto={p.esInstituto} sugerida={p.sugerida} severidadActual={p.situacion.severidad} pregunta="¿Qué tan grave es ahora?" valor={gravedad} onCambiar={(valor) => { setGravedad(valor); guardarCambio(aspectos, valor) }} />
              {p.faltaRespuesta && bloqueIncompleto?.id === 'revisar-situacion-gravedad' ? <p className="reporte-inicial__error-campo" role="alert">{bloqueIncompleto.mensaje}</p> : null}
            </div>
          )}
          {aspectos.includes('alcance') && (p.carreras !== undefined
            ? <div id="revisar-situacion-alcance" className="revisar-situacion__bloque" tabIndex={-1}>
              <h4 className="afectacion-campos__legend">¿A quiénes afecta?</h4>
              <InstitutoCamposAQuienAfecta
                cue={p.cue ?? ''}
                idPrefijo={`rev-${p.situacion.id}`}
                borrador={{ ...crearAfectacionVacia(p.situacion.id), categoria: p.situacion.categoria, carreras: alcance.carreras, alumnos: alumnosEfectivos.map((alumno) => alumno.id), alumnosElegidos: alumnosEfectivos }}
                carreras={p.carreras}
                permiteAlumnos={permiteAlumnos}
                mostrarDescripcion={false}
                onChange={(siguiente) => {
                  const nuevo = { ...alcance, carreras: siguiente.carreras ?? [], alumnosElegidos: siguiente.alumnosElegidos ?? [], alumnos: siguiente.alumnos }
                  setAlcance(nuevo)
                  guardarCambio(aspectos, gravedad, nuevo)
                }}
              />
              {p.faltaRespuesta && bloqueIncompleto?.id === 'revisar-situacion-alcance' ? <p className="reporte-inicial__error-campo" role="alert">{bloqueIncompleto.mensaje}</p> : null}
            </div>
            : p.situacion.categoria === 'alumnos'
            ? <div id="revisar-situacion-alcance" className="revisar-situacion__bloque" tabIndex={-1}>
              <h4 className="afectacion-campos__legend">¿A quiénes afecta?</h4>
              <SelectorAlumnos turnos={p.turnos} alumnosSeleccionados={alcance.alumnos} onCambiar={(secciones, alumnos) => { const siguiente = { ...alcance, secciones, alumnos }; setAlcance(siguiente); guardarCambio(aspectos, gravedad, siguiente) }} />
              {p.faltaRespuesta && bloqueIncompleto?.id === 'revisar-situacion-alcance' ? <p className="reporte-inicial__error-campo" role="alert">{bloqueIncompleto.mensaje}</p> : null}
            </div>
            : <div id="revisar-situacion-alcance" className="revisar-situacion__bloque" tabIndex={-1}>
              <div className="afectacion-campos__grupo">
                <p className="afectacion-campos__legend">¿A quiénes afecta?</p>
                <SelectorEstablecimiento turnos={p.turnos} valor={{ alcance: alcance.alcanceEstablecimiento, secciones: alcance.secciones }} onCambiar={(valor) => { const siguiente = { ...alcance, alcanceEstablecimiento: valor.alcance, secciones: valor.secciones }; setAlcance(siguiente); guardarCambio(aspectos, gravedad, siguiente) }} />
              </div>
              {p.faltaRespuesta && bloqueIncompleto?.id === 'revisar-situacion-alcance' ? <p className="reporte-inicial__error-campo" role="alert">{bloqueIncompleto.mensaje}</p> : null}
            </div>)}
          {aspectos.includes('clases-edificio') && (
            <div id="revisar-situacion-clases" className="revisar-situacion__bloque" tabIndex={-1}>
              <div className="revisar-situacion__preguntas-edificio">
                <CamposClasesEdificio esInstituto={p.esInstituto} valor={clases} onCambiar={(valor) => {
                  setClases(valor)
                  // Una afectación ya cerrada en esta actualización (hoja de salida de
                  // evacuación) conserva su cierre: el cambio de clases es sólo del edificio.
                  if (p.respuesta?.tipo === 'solucionada') p.onCambiarClasesEdificio({ ...valor, confirmarInterrupcionTotal: interrumpeTodo })
                  else guardarCambio(aspectos, gravedad, alcance, valor)
                }} alcanceParcial={alcance.alcanceEstablecimiento !== 'toda'} onInterrumpirTodaLaEscuela={(nuevo) => { setClases(nuevo); setInterrumpeTodo(true); guardarCambio(aspectos, gravedad, alcance, nuevo, true) }} respuestas={respuestasCambio} estadoActual={p.estadoActual} afectacionesActivas={p.afectacionesActivas} onConfirmarHabitual={p.onDecidirAfectacionesHabitual} bloqueos={p.habitual?.bloqueos} advertencias={p.habitual?.advertencias} bloqueosHabitualPorAfectacion={p.bloqueosHabitualPorAfectacion} />
              </div>
              {p.faltaRespuesta && bloqueIncompleto?.id === 'revisar-situacion-clases' ? <p className="reporte-inicial__error-campo" role="alert">{bloqueIncompleto.mensaje}</p> : null}
            </div>
          )}
        </div>
      )}

      {modo === 'solucion' && (
        <div ref={solucionRef} className="revisar-situacion__bloques revisar-situacion__solucion" tabIndex={-1}>
          <VigenciaChips
            value={cuando}
            onChange={(valor) => { setCuando(valor); completarSolucion(valor) }}
            label="¿Cuándo se solucionó?"
            etiquetaMomento="Se solucionó"
            minimo={p.situacion.rigeDesde}
            error={errorSolucion ?? (p.faltaRespuesta ? 'Falta indicar cuándo se solucionó.' : null)}
          />
        </div>
      )}

      <ConfirmSheet
        open={preguntandoAspectos}
        titulo={`¿Qué cambió en ${p.situacion.motivo}?`}
        confirmarLabel="Continuar"
        confirmarDeshabilitado={aspectos.length === 0}
        onCancelar={() => setPreguntandoAspectos(false)}
        onConfirmar={() => { setPreguntandoAspectos(false); setModo('cambio'); guardarCambio() }}
      >
        {ASPECTOS.filter((aspecto) => !prioridadPorAlumnos || aspecto.id === 'alcance').map((aspecto) => (
          <Opcion key={aspecto.id} tipo="checkbox" label={aspecto.id === 'alcance' && p.esInstituto ? 'A quién afecta (carreras / alumnos)' : aspecto.etiqueta} checked={aspectos.includes(aspecto.id)} onChange={(event) => {
            const marcado = event.currentTarget.checked
            const siguientes = marcado ? [...aspectos, aspecto.id] : aspectos.filter((id) => id !== aspecto.id)
            setAspectos(siguientes)
            guardarCambio(siguientes)
          }} />
        ))}
      </ConfirmSheet>

      <ConfirmSheet
        open={actual !== undefined}
        titulo={`${p.situacion.motivo} se solucionó`}
        confirmarLabel="Sí, también se solucionó"
        cancelarLabel="No, sigue activo"
        confirmarDeshabilitado={cascadaAnteriorAlInicio}
        onCancelar={() => setCascada((actualCascada) => actualCascada ? { ...actualCascada, pendientes: actualCascada.pendientes.slice(1) } : null)}
        onConfirmar={() => {
          if (cascadaAnteriorAlInicio) return
          if (actual && cascada) p.onCascada(actual.id, cascada.solucionadaEn)
          setCascada((actualCascada) => actualCascada ? { ...actualCascada, pendientes: actualCascada.pendientes.slice(1) } : null)
        }}
      >
        <p>{actual ? `${actual.motivo} (causado por ${p.situacion.motivo}), ¿también?` : null}</p>
        {cascadaAnteriorAlInicio ? <p role="alert">La fecha de solución es anterior al inicio de esta consecuencia. Revísela por separado.</p> : null}
      </ConfirmSheet>
    </section>
  )
}
