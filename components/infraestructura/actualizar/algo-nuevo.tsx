'use client'

import { useEffect, useState, type JSX } from 'react'
import { CamposAQuienAfecta, CamposQuePaso, crearAfectacionVacia, type AfectacionBorrador } from '@/components/infraestructura/afectacion-campos'
import { gravedadCompleta } from '@/components/infraestructura/campo-gravedad'
import { VigenciaChips } from '@/components/infraestructura/vigencia-chips'
import { Button } from '@/components/ui/button'
import { Opcion } from '@/components/ui/opcion'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import { armarCandidatasCausa, type CandidataCausa } from '@/lib/infraestructura/parte/candidatas-causa'
import {
  situacionConMismoMotivo,
  type EstadoRecorrido,
  type NuevaSituacion,
  type SituacionRecorrido,
} from '@/lib/infraestructura/parte/recorrido-actualizacion'
import { VIGENCIA_AHORA, resolverVigencia, type EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'

export interface AlgoNuevoProps {
  candidatasCausa: CandidataCausa[]
  situacionesActivas: SituacionRecorrido[]
  estado: EstadoRecorrido
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
  onTerminar: (nueva: NuevaSituacion | null) => void
  onEtapaChange?: (etapa: Etapa) => void
  onActualizarExistente: (id: string) => void
  onSolucionarExistente: (id: string, solucionadaEn: string) => void
}

type Etapa = 'pregunta' | 'datos' | 'causa'
type DecisionDuplicado = 'distintos' | 'actualizar' | 'solucionada'

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

function fechaCausaLegible(fecha: string): string {
  const fechaValida = new Date(fecha)
  if (!Number.isFinite(fechaValida.getTime())) return fecha
  const fechaLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(fechaValida)
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const ayerDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const ayer = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ayerDate)
  const dia = fechaLocal === hoy ? 'hoy' : fechaLocal === ayer ? 'ayer' : new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long',
  }).format(fechaValida).toLocaleLowerCase('es-AR')
  const hora = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fechaValida)
  return `${dia} ${hora}`
}

function detalleCausa(candidata: CandidataCausa, cantidadSeccionesEscuela: number): string {
  const partes: Array<string | undefined> = [candidata.severidad]
  if (candidata.secciones !== undefined) {
    if (cantidadSeccionesEscuela > 0 && candidata.secciones === cantidadSeccionesEscuela) {
      partes.push('toda la escuela')
    } else {
      const alcance = `${candidata.secciones} ${candidata.secciones === 1 ? 'sección' : 'secciones'}`
      partes.push(candidata.alumnos !== undefined ? `${alcance}, ${candidata.alumnos} ${candidata.alumnos === 1 ? 'alumno' : 'alumnos'}` : alcance)
    }
  }
  partes.push(`desde ${fechaCausaLegible(candidata.fecha)}`)
  if (!candidata.activa) partes.push('Solucionada')
  return partes.filter(Boolean).join(' · ')
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
  onEtapaChange,
  onActualizarExistente,
  onSolucionarExistente,
}: AlgoNuevoProps): JSX.Element {
  const [etapa, setEtapa] = useState<Etapa>('pregunta')
  const [hayAlgoNuevo, setHayAlgoNuevo] = useState<boolean | null>(null)
  const [causadaPorId, setCausadaPorId] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<AfectacionBorrador>(() => crearAfectacionVacia('nueva-situacion'))
  const [motivoPendiente, setMotivoPendiente] = useState<string | null>(null)
  const [situacionPendiente, setSituacionPendiente] = useState<SituacionRecorrido | null>(null)
  const [decisionDuplicado, setDecisionDuplicado] = useState<DecisionDuplicado | null>(null)
  const [cuandoSolucionada, setCuandoSolucionada] = useState<EleccionVigencia>(VIGENCIA_AHORA)
  const [cantidadCerradasVisibles, setCantidadCerradasVisibles] = useState(0)

  useEffect(() => { onEtapaChange?.(etapa) }, [etapa, onEtapaChange])

  const candidatasOrdenadas = armarCandidatasCausa(candidatasCausa)
  const candidatasActivas = candidatasOrdenadas.filter((candidata) => candidata.activa)
  const candidatasCerradas = candidatasOrdenadas.filter((candidata) => !candidata.activa)
  const cantidadSeccionesEscuela = turnos.reduce((total, turno) => total + turno.niveles.reduce((subtotal, nivel) => subtotal + nivel.secciones.length, 0), 0)
  const candidatasVisibles = [...candidatasActivas, ...candidatasCerradas.slice(0, cantidadCerradasVisibles)]
  const causasCerradasRestantes = candidatasCerradas.length - cantidadCerradasVisibles
  const sugerida = motivos.find((motivo) => motivo.nombre === borrador.motivo)?.severidadSugerida ?? null
  const completaLaGravedad = gravedadCompleta(borrador, sugerida)
  const alcanceCompleto = borrador.secciones.length > 0 &&
    (borrador.categoria !== 'establecimiento' || borrador.alcanceEstablecimiento !== '')
  const datosCompletos = borrador.categoria !== '' && borrador.motivo !== '' && completaLaGravedad && alcanceCompleto

  function mensajeFaltantes(): string | null {
    const faltantes: string[] = []
    if (!borrador.categoria) faltantes.push('el tipo')
    if (!borrador.motivo) faltantes.push('el motivo')
    if (!completaLaGravedad) faltantes.push('la gravedad')
    if (borrador.categoria === 'establecimiento' && !borrador.alcanceEstablecimiento) {
      faltantes.push('el alcance del establecimiento')
    } else if (borrador.secciones.length === 0) {
      faltantes.push('al menos una sección')
    }

    if (faltantes.length === 0) return null
    const lista = faltantes.length === 1
      ? faltantes[0]
      : `${faltantes.slice(0, -1).join(', ')} y ${faltantes[faltantes.length - 1]}`
    return `Elija ${lista}.`
  }

  const textoFaltantes = mensajeFaltantes()

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

  function continuarDesdeDatos(): void {
    if (!datosCompletos || motivoPendiente !== null) return
    if (candidatasOrdenadas.length > 0) {
      setEtapa('causa')
    } else {
      terminar()
    }
  }

  return (
    <section className="algo-nuevo" aria-label="Situación nueva">
      <h2 className="asistente__titulo">{etapa === 'pregunta' ? '¿Hay algo nuevo?' : 'Situación nueva'}</h2>
      {etapa === 'pregunta' ? (
        <>
          <fieldset className="afectacion-campos__grupo" aria-label="¿Hay algo nuevo?">
            <div className="afectacion-campos__opciones">
              <Opcion tipo="radio" name="algo-nuevo" checked={hayAlgoNuevo === false} onChange={() => { setHayAlgoNuevo(false); onTerminar(null) }} label="No" />
              <Opcion tipo="radio" name="algo-nuevo" checked={hayAlgoNuevo === true} onChange={() => { setHayAlgoNuevo(true); setEtapa('datos') }} label="Sí, agregar una situación nueva" />
            </div>
          </fieldset>
          {hayAlgoNuevo ? (
            <div className="asistente__acciones">
              <Button type="button" onClick={() => setEtapa('datos')}>Continuar</Button>
            </div>
          ) : null}
        </>
      ) : null}

      {etapa === 'causa' ? (
        <>
          <fieldset className="afectacion-campos__grupo">
            <legend className="afectacion-campos__legend">¿Se originó por alguna de estas situaciones?</legend>
            <div className="afectacion-campos__opciones algo-nuevo__causas">
              <Opcion
                tipo="radio"
                name="causa-problema-nuevo"
                checked={causadaPorId === null}
                onChange={() => setCausadaPorId(null)}
                label="No, es independiente"
                compacta
              />
              {candidatasVisibles.map((candidata) => {
                const detalle = detalleCausa(candidata, cantidadSeccionesEscuela)
                return (
                  <Opcion
                    key={candidata.id}
                    tipo="radio"
                    name="causa-problema-nuevo"
                    aria-label={`${candidata.motivo} · ${detalle}`}
                    checked={causadaPorId === candidata.id}
                    onChange={() => setCausadaPorId(candidata.id)}
                    label={candidata.motivo}
                    ayuda={<span className="algo-nuevo__causa-estado">{detalle}</span>}
                    compacta
                  />
                )
              })}
            </div>
            {candidatasCerradas.length > 0 && cantidadCerradasVisibles === 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="algo-nuevo__ver-causas"
                aria-expanded={false}
                onClick={() => setCantidadCerradasVisibles(Math.min(5, candidatasCerradas.length))}
              >
                Ver anteriores ({candidatasCerradas.length})
              </Button>
            ) : null}
            {cantidadCerradasVisibles > 0 && causasCerradasRestantes > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="algo-nuevo__ver-causas"
                aria-expanded={true}
                onClick={() => setCantidadCerradasVisibles((cantidad) => Math.min(cantidad + 5, candidatasCerradas.length))}
              >
                Ver más ({causasCerradasRestantes})
              </Button>
            ) : null}
          </fieldset>
          <div className="asistente__acciones">
            <Button type="button" variant="secondary" onClick={() => setEtapa('datos')}>Volver</Button>
            <Button type="button" onClick={terminar}>
              Continuar
            </Button>
          </div>
        </>
      ) : null}

      {etapa === 'datos' ? (
        <div className="algo-nuevo__datos">
          <div className="asistente__cuerpo">
            <h2 className="asistente__titulo">¿Qué pasó?</h2>
            <CamposQuePaso
              borrador={borrador}
              idPrefijo="algo-nuevo"
              motivos={motivos}
              otrasAfectaciones={[]}
              esNueva
              onChange={cambiarBorrador}
            />
            <div className="afectacion-campos__grupo">
              <Label htmlFor="algo-nuevo-descripcion">Descripción (opcional)</Label>
              <Textarea
                id="algo-nuevo-descripcion"
                maxLength={500}
                value={borrador.descripcion}
                onChange={(evento) => setBorrador({ ...borrador, descripcion: evento.target.value })}
              />
            </div>
          </div>
          <div className="asistente__cuerpo">
            <h2 className="asistente__titulo">¿A quiénes afecta?</h2>
            <CamposAQuienAfecta
              borrador={borrador}
              idPrefijo="algo-nuevo"
              turnos={turnos}
              usaSelectorEstablecimiento
              ocultarPreguntaAlcance
              ocultarDescripcion
              onChange={setBorrador}
            />
          </div>
          <div className="asistente__acciones algo-nuevo__acciones">
            <Button
              type="button"
              className="algo-nuevo__continuar"
              disabled={!datosCompletos || motivoPendiente !== null}
              aria-describedby={textoFaltantes ? 'algo-nuevo-faltantes' : undefined}
              onClick={continuarDesdeDatos}
            >
              Continuar
            </Button>
            <Button type="button" variant="secondary" className="algo-nuevo__volver" onClick={() => setEtapa('pregunta')}>Volver</Button>
            {textoFaltantes ? <p id="algo-nuevo-faltantes" className="algo-nuevo__faltantes" role="status">{textoFaltantes}</p> : null}
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
          <Opcion tipo="radio" name="decision-mismo-motivo" checked={decisionDuplicado === 'distintos'} onChange={() => setDecisionDuplicado('distintos')} label="Son dos situaciones distintas a la vez" compacta />
          <Opcion tipo="radio" name="decision-mismo-motivo" checked={decisionDuplicado === 'actualizar'} onChange={() => setDecisionDuplicado('actualizar')} label="Sigue igual: es la misma, quiero actualizarla" compacta />
          <Opcion tipo="radio" name="decision-mismo-motivo" checked={decisionDuplicado === 'solucionada'} onChange={() => setDecisionDuplicado('solucionada')} label="Se solucionó y esto es una situación nueva" compacta />
        </div>
        {decisionDuplicado === 'solucionada' ? (
          <VigenciaChips value={cuandoSolucionada} onChange={setCuandoSolucionada} label="¿Cuándo se solucionó?" />
        ) : null}
      </ConfirmSheet>
    </section>
  )
}
