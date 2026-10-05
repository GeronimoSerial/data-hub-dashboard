'use client'

import { useState, type JSX } from 'react'
import { CamposAQuienAfecta, CamposQuePaso, crearAfectacionVacia, type AfectacionBorrador } from '@/components/infraestructura/afectacion-campos'
import { gravedadCompleta } from '@/components/infraestructura/campo-gravedad'
import { SelectorAlumnos } from '@/components/infraestructura/selector-alumnos'
import { SelectorEstablecimiento } from '@/components/infraestructura/selector-establecimiento'
import { VigenciaChips } from '@/components/infraestructura/vigencia-chips'
import { Button } from '@/components/ui/button'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import {
  situacionConMismoMotivo,
  type EstadoRecorrido,
  type NuevaSituacion,
  type SituacionRecorrido,
} from '@/lib/infraestructura/parte/recorrido-actualizacion'
import { VIGENCIA_AHORA, resolverVigencia, type EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'

interface CandidataCausa {
  id: string
  motivo: string
  fecha: string
  activa: boolean
}

export interface AlgoNuevoProps {
  candidatasCausa: CandidataCausa[]
  situacionesActivas: SituacionRecorrido[]
  estado: EstadoRecorrido
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
  onTerminar: (nueva: NuevaSituacion | null) => void
  onActualizarExistente: (id: string) => void
  onSolucionarExistente: (id: string, solucionadaEn: string) => void
}

type Etapa = 'pregunta' | 'causa' | 'datos'
type DecisionDuplicado = 'distintos' | 'actualizar' | 'solucionada'

function marcaDeTiempo(fecha: string): number {
  const iso = Date.parse(fecha)
  if (Number.isFinite(iso)) return iso
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha)
  return local ? new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1])).getTime() : 0
}

function fechaCorta(fecha: string): string {
  const fechaValida = new Date(fecha)
  if (!Number.isFinite(fechaValida.getTime())) return fecha
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fechaValida)
}

function crearNuevaSituacion(borrador: AfectacionBorrador, causadaPorId: string | null): NuevaSituacion | null {
  if (borrador.categoria === '' || borrador.severidad === '' || borrador.motivo === '') return null
  return {
    causadaPorId,
    motivo: borrador.motivo,
    severidad: borrador.severidad,
    secciones: borrador.secciones,
    ...(borrador.categoria === 'alumnos' ? { alumnos: borrador.alumnos } : {}),
    ...(borrador.justificacionCritica ? { justificacionCritica: borrador.justificacionCritica } : {}),
    ...(borrador.justificacionCriticaDetalle ? { justificacionCriticaDetalle: borrador.justificacionCriticaDetalle } : {}),
    ...(borrador.descripcion.trim() ? { descripcion: borrador.descripcion.trim() } : {}),
  }
}

export function AlgoNuevo({
  candidatasCausa,
  situacionesActivas,
  estado,
  turnos,
  motivos,
  onTerminar,
  onActualizarExistente,
  onSolucionarExistente,
}: AlgoNuevoProps): JSX.Element {
  const [etapa, setEtapa] = useState<Etapa>('pregunta')
  const [causadaPorId, setCausadaPorId] = useState<string | null | undefined>(undefined)
  const [borrador, setBorrador] = useState<AfectacionBorrador>(() => crearAfectacionVacia('nueva-situacion'))
  const [motivoPendiente, setMotivoPendiente] = useState<string | null>(null)
  const [situacionPendiente, setSituacionPendiente] = useState<SituacionRecorrido | null>(null)
  const [decisionDuplicado, setDecisionDuplicado] = useState<DecisionDuplicado | null>(null)
  const [cuandoSolucionada, setCuandoSolucionada] = useState<EleccionVigencia>(VIGENCIA_AHORA)

  const candidatasOrdenadas = [...candidatasCausa].sort((a, b) => {
    if (a.activa !== b.activa) return a.activa ? -1 : 1
    return marcaDeTiempo(b.fecha) - marcaDeTiempo(a.fecha)
  })
  const sugerida = motivos.find((motivo) => motivo.nombre === borrador.motivo)?.severidadSugerida ?? null
  const completaLaGravedad = gravedadCompleta(borrador, sugerida)
  const alcanceCompleto = borrador.secciones.length > 0 &&
    (borrador.categoria !== 'establecimiento' || borrador.alcanceEstablecimiento !== '')
  const datosCompletos = borrador.categoria !== '' && borrador.motivo !== '' && completaLaGravedad && alcanceCompleto

  function aplicarMotivo(motivo: string): void {
    setBorrador((actual) => ({
      ...actual,
      motivo,
      severidad: '',
      justificacionCritica: '',
      justificacionCriticaDetalle: '',
    }))
  }

  function cambiarBorrador(siguiente: AfectacionBorrador): void {
    if (siguiente.motivo !== borrador.motivo) {
      const activa = situacionConMismoMotivo(situacionesActivas, siguiente.motivo, estado)
      if (activa) {
        setMotivoPendiente(siguiente.motivo)
        setSituacionPendiente(activa)
        setDecisionDuplicado(null)
        setCuandoSolucionada(VIGENCIA_AHORA)
        return
      }
    }
    setBorrador(siguiente)
  }

  function confirmarMotivoPendiente(): void {
    if (!motivoPendiente || !situacionPendiente || !decisionDuplicado) return
    if (decisionDuplicado === 'actualizar') {
      onActualizarExistente(situacionPendiente.id)
    } else {
      if (decisionDuplicado === 'solucionada') {
        const solucionadaEn = resolverVigencia(cuandoSolucionada)
        if (!solucionadaEn) return
        onSolucionarExistente(situacionPendiente.id, solucionadaEn)
      }
      aplicarMotivo(motivoPendiente)
    }
    setMotivoPendiente(null)
    setSituacionPendiente(null)
    setDecisionDuplicado(null)
  }

  function terminar(): void {
    const nueva = crearNuevaSituacion(borrador, causadaPorId ?? null)
    if (nueva && datosCompletos) onTerminar(nueva)
  }

  return (
    <section className="algo-nuevo" aria-label="Problema nuevo">
      {etapa === 'pregunta' ? (
        <fieldset className="afectacion-campos__grupo">
          <legend className="afectacion-campos__legend">¿Pasó algo nuevo?</legend>
          <div className="afectacion-campos__opciones">
            <label className="opcion-radio">
              <input type="radio" name="algo-nuevo" onChange={() => onTerminar(null)} />
              <span className="opcion-radio__titulo">No, nada nuevo</span>
            </label>
            <label className="opcion-radio">
              <input type="radio" name="algo-nuevo" onChange={() => setEtapa('causa')} />
              <span className="opcion-radio__titulo">Sí, hay un problema nuevo</span>
            </label>
          </div>
        </fieldset>
      ) : null}

      {etapa === 'causa' ? (
        <>
          <fieldset className="afectacion-campos__grupo">
            <legend className="afectacion-campos__legend">¿Es consecuencia de algo anterior?</legend>
            <div className="afectacion-campos__opciones">
              {candidatasOrdenadas.map((candidata) => (
                <label key={candidata.id} className="opcion-radio opcion-radio--compacta">
                  <input
                    type="radio"
                    name="causa-problema-nuevo"
                    checked={causadaPorId === candidata.id}
                    onChange={() => setCausadaPorId(candidata.id)}
                  />
                  <span className="opcion-radio__titulo">{`De ${candidata.motivo} (${candidata.fecha})`}</span>
                </label>
              ))}
              <label className="opcion-radio opcion-radio--compacta">
                <input
                  type="radio"
                  name="causa-problema-nuevo"
                  checked={causadaPorId === null}
                  onChange={() => setCausadaPorId(null)}
                />
                <span className="opcion-radio__titulo">No, es independiente</span>
              </label>
            </div>
          </fieldset>
          <div className="asistente__acciones">
            <Button type="button" disabled={causadaPorId === undefined} onClick={() => setEtapa('datos')}>
              Siguiente
            </Button>
          </div>
        </>
      ) : null}

      {etapa === 'datos' ? (
        <div className="algo-nuevo__datos">
          <CamposQuePaso
            borrador={borrador}
            idPrefijo="algo-nuevo"
            motivos={motivos}
            otrasAfectaciones={[]}
            esNueva
            onChange={cambiarBorrador}
          />
          <CamposAQuienAfecta
            borrador={borrador}
            idPrefijo="algo-nuevo"
            turnos={turnos}
            usaSelectorEstablecimiento
            onChange={setBorrador}
          />
          <div className="asistente__acciones">
            <Button type="button" disabled={!datosCompletos || motivoPendiente !== null} onClick={terminar}>
              Listo
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmSheet
        open={situacionPendiente !== null}
        titulo={situacionPendiente
          ? `Ya tiene activa "${situacionPendiente.motivo}" desde el ${fechaCorta(situacionPendiente.rigeDesde)}. ¿Qué pasó con esa?`
          : ''}
        confirmarLabel="Continuar"
        confirmarDeshabilitado={decisionDuplicado === null || (decisionDuplicado === 'solucionada' && resolverVigencia(cuandoSolucionada) === null)}
        onCancelar={() => {
          setMotivoPendiente(null)
          setSituacionPendiente(null)
          setDecisionDuplicado(null)
        }}
        onConfirmar={confirmarMotivoPendiente}
      >
        <div className="afectacion-campos__opciones">
          <label className="opcion-radio opcion-radio--compacta">
            <input type="radio" name="decision-mismo-motivo" checked={decisionDuplicado === 'distintos'} onChange={() => setDecisionDuplicado('distintos')} />
            <span className="opcion-radio__titulo">Son dos problemas distintos a la vez</span>
          </label>
          <label className="opcion-radio opcion-radio--compacta">
            <input type="radio" name="decision-mismo-motivo" checked={decisionDuplicado === 'actualizar'} onChange={() => setDecisionDuplicado('actualizar')} />
            <span className="opcion-radio__titulo">Sigue igual: es la misma, quiero actualizarla</span>
          </label>
          <label className="opcion-radio opcion-radio--compacta">
            <input type="radio" name="decision-mismo-motivo" checked={decisionDuplicado === 'solucionada'} onChange={() => setDecisionDuplicado('solucionada')} />
            <span className="opcion-radio__titulo">Se solucionó y esto es un problema nuevo</span>
          </label>
        </div>
        {decisionDuplicado === 'solucionada' ? (
          <VigenciaChips value={cuandoSolucionada} onChange={setCuandoSolucionada} label="¿Cuándo se solucionó?" />
        ) : null}
      </ConfirmSheet>
    </section>
  )
}
