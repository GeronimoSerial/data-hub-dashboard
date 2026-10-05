'use client'

import { useEffect, useRef, useState, type JSX } from 'react'
import { Opcion } from '@/components/ui/opcion'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { CampoGravedad, gravedadCompleta, type ValorGravedad } from '@/components/infraestructura/campo-gravedad'
import { CamposClasesEdificio, type ValorClasesEdificio } from '@/components/infraestructura/campos-clases-edificio'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { SelectorAlumnos } from '@/components/infraestructura/selector-alumnos'
import { SelectorEstablecimiento, type ValorAlcanceEstablecimiento } from '@/components/infraestructura/selector-establecimiento'
import { VigenciaChips } from '@/components/infraestructura/vigencia-chips'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { AspectoCambio, CambioSituacion, RespuestaSituacion, SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import type { Severidad } from '@/lib/infraestructura/validacion'
import { VIGENCIA_AHORA, resolverVigencia, type EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'

const ASPECTOS: Array<{ id: AspectoCambio; etiqueta: string }> = [
  { id: 'gravedad', etiqueta: 'La gravedad' },
  { id: 'alcance', etiqueta: 'A quién afecta (secciones / alumnos)' },
  { id: 'clases-edificio', etiqueta: 'Las clases o el edificio' },
]

type Modo = 'eligiendo' | 'cambio' | 'solucion'

export interface RevisarSituacionProps {
  situacion: SituacionRecorrido & { secciones: number[]; alumnos: number[] }
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
}

function seccionesDe(turnos: TurnoContexto[]): number[] {
  return turnos.flatMap((turno) => turno.niveles.flatMap((nivel) => nivel.secciones.map((seccion) => seccion.geSectionId)))
}

export function RevisarSituacion(p: RevisarSituacionProps): JSX.Element {
  const cambioGuardado = p.respuesta?.tipo === 'cambio' ? p.respuesta.cambio : undefined
  const [modo, setModo] = useState<Modo>(cambioGuardado ? 'cambio' : 'eligiendo')
  const [preguntandoAspectos, setPreguntandoAspectos] = useState(false)
  const [aspectos, setAspectos] = useState<AspectoCambio[]>(cambioGuardado?.aspectos ?? [])
  const [gravedad, setGravedad] = useState<ValorGravedad>({
    severidad: cambioGuardado?.severidad ?? p.situacion.severidad,
    justificacionCritica: cambioGuardado?.justificacionCritica ?? '',
    justificacionCriticaDetalle: cambioGuardado?.justificacionCriticaDetalle ?? '',
  })
  const [alcance, setAlcance] = useState<{ secciones: number[]; alumnos: number[]; alcanceEstablecimiento: ValorAlcanceEstablecimiento['alcance'] }>(() => {
    const todas = seccionesDe(p.turnos)
    const secciones = cambioGuardado?.secciones ?? p.situacion.secciones
    const cubreTodaLaEscuela = todas.length > 0 && todas.every((id) => secciones.includes(id))
    return {
      secciones,
      alumnos: cambioGuardado?.alumnos ?? p.situacion.alumnos,
      alcanceEstablecimiento: cubreTodaLaEscuela ? 'toda' : 'algunas',
    }
  })
  const [clases, setClases] = useState<ValorClasesEdificio>(p.clasesEdificio)
  const [interrumpeTodo, setInterrumpeTodo] = useState(p.clasesEdificio.confirmarInterrupcionTotal ?? false)
  const [cuando, setCuando] = useState<EleccionVigencia>(VIGENCIA_AHORA)
  const [cascada, setCascada] = useState<{ pendientes: SituacionRecorrido[]; solucionadaEn: string } | null>(null)
  const solucionRef = useRef<HTMLDivElement>(null)

  function completarSolucion(eleccion: EleccionVigencia) {
    const solucionadaEn = resolverVigencia(eleccion)
    if (!solucionadaEn) {
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
    const completo = aspectosActuales.length > 0 &&
      (!aspectosActuales.includes('gravedad') || gravedadCompleta(gravedadActual, p.sugerida)) &&
      (!aspectosActuales.includes('alcance') || (
        alcanceActual.secciones.length > 0 &&
        (p.situacion.categoria !== 'establecimiento' || alcanceActual.alcanceEstablecimiento !== '')
      )) &&
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
      cambio.secciones = alcanceActual.secciones
      if (p.situacion.categoria === 'alumnos') cambio.alumnos = alcanceActual.alumnos
    }
    if (aspectosActuales.includes('clases-edificio')) {
      p.onCambiarClasesEdificio({ ...clasesActuales, confirmarInterrupcionTotal: interrumpeTodoActual })
    }
    p.onResponder({ tipo: 'cambio', cambio })
  }

  const actual = cascada?.pendientes[0]
  const tipoRespondido = p.respuesta?.tipo
  const bloqueIncompleto = aspectos.includes('gravedad') && !gravedadCompleta(gravedad, p.sugerida)
    ? { id: 'revisar-situacion-gravedad', mensaje: 'Complete la gravedad de esta situación.' }
    : aspectos.includes('alcance') && (alcance.secciones.length === 0 || (p.situacion.categoria === 'establecimiento' && alcance.alcanceEstablecimiento === ''))
      ? { id: 'revisar-situacion-alcance', mensaje: 'Elija a quién afecta esta situación.' }
      : aspectos.includes('clases-edificio') && (!clases.servicioEstado || !clases.estadoEstablecimiento)
        ? { id: 'revisar-situacion-clases', mensaje: 'Indique cómo están las clases y el edificio.' }
        : null

  useEffect(() => {
    if (!p.faltaRespuesta) return
    const selector = modo === 'solucion'
      ? cuando.modo === 'otro' && !cuando.fecha ? 'input[type="date"]' : 'input[type="time"]'
      : modo === 'cambio' && bloqueIncompleto
        ? `#${bloqueIncompleto.id} input`
        : '.revisar-situacion__respuesta input'
    const campo = document.querySelector<HTMLElement>(selector)
    campo?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    campo?.focus()
  }, [p.faltaRespuesta, modo, cuando, bloqueIncompleto?.id])

  useEffect(() => {
    if (modo !== 'solucion') return
    const reducirMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    solucionRef.current?.scrollIntoView?.({ behavior: reducirMovimiento ? 'auto' : 'smooth', block: 'start' })
  }, [modo])

  return (
    <section className="revisar-situacion" aria-label={`Situación ${p.posicion.actual} de ${p.posicion.total}`}>
      <p className="asistente__contador">{`Lo que ya reportó · ${p.posicion.actual} de ${p.posicion.total}`}</p>
      <h3>{p.situacion.motivo} <EstadoActualSeveridad severidad={p.situacion.severidad} prefijo={false} /></h3>

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
              <CampoGravedad idPrefijo={`rev-${p.situacion.id}`} categoria={p.situacion.categoria} sugerida={p.sugerida} severidadActual={p.situacion.severidad} pregunta="¿Qué tan grave es ahora?" valor={gravedad} onCambiar={(valor) => { setGravedad(valor); guardarCambio(aspectos, valor) }} />
              {p.faltaRespuesta && bloqueIncompleto?.id === 'revisar-situacion-gravedad' ? <p className="reporte-inicial__error-campo" role="alert">{bloqueIncompleto.mensaje}</p> : null}
            </div>
          )}
          {aspectos.includes('alcance') && (p.situacion.categoria === 'alumnos'
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
                <CamposClasesEdificio valor={clases} onCambiar={(valor) => { setClases(valor); guardarCambio(aspectos, gravedad, alcance, valor) }} alcanceParcial={alcance.alcanceEstablecimiento !== 'toda'} onInterrumpirTodaLaEscuela={() => { setInterrumpeTodo(true); guardarCambio(aspectos, gravedad, alcance, clases, true) }} />
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
            error={p.faltaRespuesta ? 'Falta indicar cuándo se solucionó.' : null}
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
        {ASPECTOS.map((aspecto) => (
          <Opcion key={aspecto.id} tipo="checkbox" label={aspecto.etiqueta} checked={aspectos.includes(aspecto.id)} onChange={(event) => {
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
        onCancelar={() => setCascada((actualCascada) => actualCascada ? { ...actualCascada, pendientes: actualCascada.pendientes.slice(1) } : null)}
        onConfirmar={() => {
          if (actual && cascada) p.onCascada(actual.id, cascada.solucionadaEn)
          setCascada((actualCascada) => actualCascada ? { ...actualCascada, pendientes: actualCascada.pendientes.slice(1) } : null)
        }}
      >
        <p>{actual ? `${actual.motivo} (causado por ${p.situacion.motivo}), ¿también?` : null}</p>
      </ConfirmSheet>
    </section>
  )
}
