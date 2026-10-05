'use client'

import { useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
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
  consecuencias: SituacionRecorrido[]
  clasesEdificio: ValorClasesEdificio
  onResponder: (respuesta: RespuestaSituacion) => void
  onCambiarClasesEdificio: (valor: ValorClasesEdificio & { confirmarInterrupcionTotal: boolean }) => void
  onCascada: (consecuenciaId: string, solucionadaEn: string) => void
  posicion: { actual: number; total: number }
}

function seccionesDe(turnos: TurnoContexto[]): number[] {
  return turnos.flatMap((turno) => turno.niveles.flatMap((nivel) => nivel.secciones.map((seccion) => seccion.geSectionId)))
}

export function RevisarSituacion(p: RevisarSituacionProps): JSX.Element {
  const [modo, setModo] = useState<Modo>('eligiendo')
  const [preguntandoAspectos, setPreguntandoAspectos] = useState(false)
  const [aspectos, setAspectos] = useState<AspectoCambio[]>([])
  const [gravedad, setGravedad] = useState<ValorGravedad>({ severidad: p.situacion.severidad, justificacionCritica: '', justificacionCriticaDetalle: '' })
  const [alcance, setAlcance] = useState<{ secciones: number[]; alumnos: number[]; alcanceEstablecimiento: ValorAlcanceEstablecimiento['alcance'] }>(() => {
    const todas = seccionesDe(p.turnos)
    const cubreTodaLaEscuela = todas.length > 0 && todas.every((id) => p.situacion.secciones.includes(id))
    return {
      secciones: p.situacion.secciones,
      alumnos: p.situacion.alumnos,
      alcanceEstablecimiento: cubreTodaLaEscuela ? 'toda' : 'algunas',
    }
  })
  const [clases, setClases] = useState<ValorClasesEdificio>(p.clasesEdificio)
  const [interrumpeTodo, setInterrumpeTodo] = useState(false)
  const [cuando, setCuando] = useState<EleccionVigencia>(VIGENCIA_AHORA)
  const [cascada, setCascada] = useState<{ pendientes: SituacionRecorrido[]; solucionadaEn: string } | null>(null)

  function elegir(tipo: 'sigue' | 'cambio' | 'solucionada') {
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
  }

  function listoCambio() {
    const cambio: CambioSituacion = { aspectos }
    if (aspectos.includes('gravedad') && gravedad.severidad !== '') {
      cambio.severidad = gravedad.severidad
      if (gravedad.justificacionCritica) cambio.justificacionCritica = gravedad.justificacionCritica
      if (gravedad.justificacionCriticaDetalle) cambio.justificacionCriticaDetalle = gravedad.justificacionCriticaDetalle
    }
    if (aspectos.includes('alcance')) {
      cambio.secciones = alcance.secciones
      if (p.situacion.categoria === 'alumnos') cambio.alumnos = alcance.alumnos
    }
    if (aspectos.includes('clases-edificio')) {
      p.onCambiarClasesEdificio({ ...clases, confirmarInterrupcionTotal: interrumpeTodo })
    }
    p.onResponder({ tipo: 'cambio', cambio })
    setModo('eligiendo')
  }

  function listoSolucion() {
    const solucionadaEn = resolverVigencia(cuando)
    if (!solucionadaEn) return
    p.onResponder({ tipo: 'solucionada', solucionadaEn })
    if (p.consecuencias.length > 0) setCascada({ pendientes: p.consecuencias, solucionadaEn })
    setModo('eligiendo')
  }

  const actual = cascada?.pendientes[0]
  const tipoRespondido = p.respuesta?.tipo
  const cambioListo = aspectos.length > 0 && (!aspectos.includes('gravedad') || gravedadCompleta(gravedad, p.sugerida))

  return (
    <section className="revisar-situacion" aria-label={`Situación ${p.posicion.actual} de ${p.posicion.total}`}>
      <p className="asistente__contador">{`Lo que ya reportó · ${p.posicion.actual} de ${p.posicion.total}`}</p>
      <h3>{p.situacion.motivo} <EstadoActualSeveridad severidad={p.situacion.severidad} prefijo={false} /></h3>

      <fieldset className="afectacion-campos__grupo">
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
      </fieldset>

      {modo === 'cambio' && (
        <div className="revisar-situacion__bloques">
          {aspectos.includes('gravedad') && (
            <CampoGravedad idPrefijo={`rev-${p.situacion.id}`} categoria={p.situacion.categoria} sugerida={p.sugerida} valor={gravedad} onCambiar={setGravedad} />
          )}
          {aspectos.includes('alcance') && (p.situacion.categoria === 'alumnos'
            ? <SelectorAlumnos turnos={p.turnos} alumnosSeleccionados={alcance.alumnos} onCambiar={(secciones, alumnos) => setAlcance((actual) => ({ ...actual, secciones, alumnos }))} />
            : <SelectorEstablecimiento turnos={p.turnos} valor={{ alcance: alcance.alcanceEstablecimiento, secciones: alcance.secciones }} onCambiar={(valor) => setAlcance((actual) => ({ ...actual, alcanceEstablecimiento: valor.alcance, secciones: valor.secciones }))} />)}
          {aspectos.includes('clases-edificio') && (
            <CamposClasesEdificio valor={clases} onCambiar={setClases} alcanceParcial={alcance.alcanceEstablecimiento !== 'toda'} onInterrumpirTodaLaEscuela={() => setInterrumpeTodo(true)} />
          )}
          <div className="asistente__acciones">
            <Button type="button" onClick={listoCambio} disabled={!cambioListo}>Listo</Button>
          </div>
        </div>
      )}

      {modo === 'solucion' && (
        <div className="revisar-situacion__bloques">
          <VigenciaChips value={cuando} onChange={setCuando} label="¿Cuándo se solucionó?" />
          <div className="asistente__acciones">
            <Button type="button" onClick={listoSolucion}>Listo</Button>
          </div>
        </div>
      )}

      <ConfirmSheet
        open={preguntandoAspectos}
        titulo={`¿Qué cambió en ${p.situacion.motivo}?`}
        confirmarLabel="Continuar"
        confirmarDeshabilitado={aspectos.length === 0}
        onCancelar={() => setPreguntandoAspectos(false)}
        onConfirmar={() => { setPreguntandoAspectos(false); setModo('cambio') }}
      >
        {ASPECTOS.map((aspecto) => (
          <Opcion key={aspecto.id} tipo="checkbox" label={aspecto.etiqueta} checked={aspectos.includes(aspecto.id)} onChange={(event) => {
            const marcado = event.currentTarget.checked
            setAspectos((actuales) => marcado ? [...actuales, aspecto.id] : actuales.filter((id) => id !== aspecto.id))
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
