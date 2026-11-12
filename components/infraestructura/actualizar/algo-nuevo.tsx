'use client'

import { localeRegion, zonaHorariaRegion } from '@/lib/infraestructura/formato-region'
import { useEffect, useState, type JSX } from 'react'
import { CamposAQuienAfecta, CamposQuePaso, crearAfectacionVacia, type AfectacionBorrador } from '@/components/infraestructura/afectacion-campos'
import { gravedadCompleta } from '@/components/infraestructura/campo-gravedad'
import { InstitutoCamposAQuienAfecta } from '@/components/infraestructura/instituto-alcance-campos'
import { CATEGORIA_META, esCategoria } from '@/lib/infraestructura/categorias'
import { carrerasSinAlumno, contar, type CarreraElegible } from '@/lib/infraestructura/parte/instituto-ui'
import { VigenciaChips } from '@/components/infraestructura/vigencia-chips'
import { BottomSheet } from '@/components/ui/bottom-sheet'
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
import { impactoAlumnosEnContexto } from '@/lib/infraestructura/prioridad-alumnos'

export interface AlgoNuevoProps {
  candidatasCausa: CandidataCausa[]
  situacionesActivas: SituacionRecorrido[]
  estado: EstadoRecorrido
  turnos: TurnoContexto[]
  /** Institutos superiores: CUE de la búsqueda de alumnos y catálogo de carreras (ausente en GE). */
  cue?: string
  carreras?: CarreraElegible[]
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
  return new Intl.DateTimeFormat(localeRegion(), {
    timeZone: zonaHorariaRegion(),
    day: 'numeric',
    month: 'long',
  }).format(fechaValida)
}

function fechaCausaLegible(fecha: string): string {
  const fechaValida = new Date(fecha)
  if (!Number.isFinite(fechaValida.getTime())) return fecha
  const fechaLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHorariaRegion(),
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(fechaValida)
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHorariaRegion(),
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const ayerDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const ayer = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHorariaRegion(),
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ayerDate)
  const dia = fechaLocal === hoy ? 'hoy' : fechaLocal === ayer ? 'ayer' : new Intl.DateTimeFormat(localeRegion(), {
    timeZone: zonaHorariaRegion(), day: 'numeric', month: 'long',
  }).format(fechaValida).toLocaleLowerCase('es-AR')
  const hora = new Intl.DateTimeFormat(localeRegion(), {
    timeZone: zonaHorariaRegion(),
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fechaValida)
  return `${dia} ${hora}`
}

function detalleCausa(candidata: CandidataCausa, cantidadSeccionesEscuela: number): string {
  const partes: Array<string | undefined> = [candidata.severidad]
  if (candidata.carreras !== undefined) {
    const alcance = contar(candidata.carreras, 'carrera', 'carreras')
    partes.push(candidata.alumnos !== undefined ? `${alcance}, ${contar(candidata.alumnos, 'alumno', 'alumnos')}` : alcance)
  } else if (candidata.secciones !== undefined) {
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

function crearNuevaSituacion(
  borrador: AfectacionBorrador,
  causadaPorId: string | null,
  esInstituto: boolean,
  turnos: TurnoContexto[],
): NuevaSituacion | null {
  // GE: la prioridad de alumnos sale del padrón y el volumen. Institutos: gravedad manual.
  const severidad = borrador.categoria === 'alumnos' && !esInstituto
    ? impactoAlumnosEnContexto(borrador.alumnos, turnos).prioridad
    : borrador.severidad
  if (borrador.categoria === '' || !severidad || borrador.motivo === '') return null
  // Institutos: la nueva situación va por carreras; los alumnos sólo en categorías que los admiten.
  const alcance = esInstituto
    ? { carreras: borrador.carreras ?? [] }
    : { secciones: borrador.secciones }
  return {
    causadaPorId,
    motivo: borrador.motivo,
    severidad,
    ...alcance,
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
  cue = '',
  carreras,
  motivos,
  onTerminar,
  onEtapaChange,
  onActualizarExistente,
  onSolucionarExistente,
}: AlgoNuevoProps): JSX.Element {
  const [etapa, setEtapa] = useState<Etapa>(() => estado.nueva ? 'datos' : 'pregunta')
  const [hayAlgoNuevo, setHayAlgoNuevo] = useState<boolean | null>(() => estado.nueva ? true : null)
  const [causadaPorId, setCausadaPorId] = useState<string | null>(() => estado.nueva?.causadaPorId ?? null)
  const [borrador, setBorrador] = useState<AfectacionBorrador>(() => {
    const vacia = crearAfectacionVacia('nueva-situacion')
    const nueva = estado.nueva
    if (!nueva) return vacia
    return {
      ...vacia,
      categoria: nueva.alumnos !== undefined ? 'alumnos' : 'establecimiento',
      motivo: nueva.motivo,
      severidad: nueva.severidad ?? '',
      justificacionCritica: nueva.justificacionCritica ?? '',
      justificacionCriticaDetalle: nueva.justificacionCriticaDetalle ?? '',
      descripcion: nueva.descripcion ?? '',
      secciones: nueva.secciones ?? [],
      carreras: nueva.carreras ?? [],
      alumnos: nueva.alumnos ?? [],
    }
  })
  const [motivoPendiente, setMotivoPendiente] = useState<string | null>(null)
  const [situacionPendiente, setSituacionPendiente] = useState<SituacionRecorrido | null>(null)
  const [decisionDuplicado, setDecisionDuplicado] = useState<DecisionDuplicado | null>(null)
  const [cuandoSolucionada, setCuandoSolucionada] = useState<EleccionVigencia>(VIGENCIA_AHORA)
  const [anterioresAbiertas, setAnterioresAbiertas] = useState(false)

  useEffect(() => { onEtapaChange?.(etapa) }, [etapa, onEtapaChange])

  const candidatasOrdenadas = armarCandidatasCausa(candidatasCausa)
  const candidatasActivas = candidatasOrdenadas.filter((candidata) => candidata.activa)
  const candidatasCerradas = candidatasOrdenadas.filter((candidata) => !candidata.activa)
  const cantidadSeccionesEscuela = turnos.reduce((total, turno) => total + turno.niveles.reduce((subtotal, nivel) => subtotal + nivel.secciones.length, 0), 0)
  // Las anteriores se eligen en un panel aparte; la elegida queda a la vista
  // junto a las activas para que la selección no quede escondida.
  const anteriorElegida = candidatasCerradas.find((candidata) => candidata.id === causadaPorId)
  const candidatasVisibles = anteriorElegida ? [...candidatasActivas, anteriorElegida] : candidatasActivas
  const sugerida = motivos.find((motivo) => motivo.nombre === borrador.motivo)?.severidadSugerida ?? null
  const esInstituto = carreras !== undefined
  // GE: los alumnos no eligen gravedad a mano (la marca la prioridad de la matrícula).
  const completaLaGravedad = (borrador.categoria === 'alumnos' && !esInstituto) || gravedadCompleta(borrador, sugerida)
  const alcanceCompleto = esInstituto
    ? (borrador.carreras ?? []).length > 0 && !(borrador.categoria === 'alumnos' && carrerasSinAlumno(borrador.carreras ?? [], borrador.alumnosElegidos ?? []).length > 0)
    : borrador.secciones.length > 0 && (borrador.categoria !== 'establecimiento' || borrador.alcanceEstablecimiento !== '')
  const datosCompletos = borrador.categoria !== '' && borrador.motivo !== '' && completaLaGravedad && alcanceCompleto

  function mensajeFaltantes(): string | null {
    const faltantes: string[] = []
    if (!borrador.categoria) faltantes.push('el tipo')
    if (!borrador.motivo) faltantes.push('el motivo')
    if (!completaLaGravedad) faltantes.push('la gravedad')
    if (esInstituto) {
      if ((borrador.carreras ?? []).length === 0) faltantes.push('al menos una carrera')
      else if (borrador.categoria === 'alumnos' && carrerasSinAlumno(borrador.carreras ?? [], borrador.alumnosElegidos ?? []).length > 0) faltantes.push('al menos un alumno de cada carrera')
    } else if (borrador.categoria === 'establecimiento' && !borrador.alcanceEstablecimiento) {
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
    const nueva = crearNuevaSituacion(borrador, causadaPorId ?? null, esInstituto, turnos)
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
      <h2 className={etapa === 'pregunta' ? 'asistente__titulo' : 'asistente__titulo asistente__titulo--rotulo'}>{etapa === 'pregunta' ? '¿Hay algo nuevo?' : 'Situación nueva'}</h2>
      {etapa === 'pregunta' ? (
        <>
          <fieldset className="afectacion-campos__grupo" aria-label="¿Hay algo nuevo?">
            <div className="afectacion-campos__opciones">
              <Opcion tipo="radio" name="algo-nuevo" checked={hayAlgoNuevo === false} onChange={() => { setHayAlgoNuevo(false); onTerminar(null) }} label="No" />
              <Opcion tipo="radio" name="algo-nuevo" checked={hayAlgoNuevo === true} onChange={() => { setHayAlgoNuevo(true); setEtapa('datos') }} label="Sí, agregar una situación nueva" />
            </div>
          </fieldset>
          {hayAlgoNuevo ? (
            <div className="asistente__acciones asistente__acciones--pegada">
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
            {candidatasCerradas.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="algo-nuevo__ver-causas"
                aria-haspopup="dialog"
                onClick={() => setAnterioresAbiertas(true)}
              >
                Ver anteriores ({candidatasCerradas.length})
              </Button>
            ) : null}
          </fieldset>
          <BottomSheet open={anterioresAbiertas} titulo="Situaciones anteriores" onCerrar={() => setAnterioresAbiertas(false)}>
            <div className="afectacion-campos__opciones">
              {candidatasCerradas.map((candidata) => {
                const detalle = detalleCausa(candidata, cantidadSeccionesEscuela)
                return (
                  <Opcion
                    key={candidata.id}
                    tipo="radio"
                    name="causa-anterior"
                    aria-label={`${candidata.motivo} · ${detalle}`}
                    checked={causadaPorId === candidata.id}
                    onChange={() => {
                      setCausadaPorId(candidata.id)
                      setAnterioresAbiertas(false)
                    }}
                    label={candidata.motivo}
                    ayuda={<span className="algo-nuevo__causa-estado">{detalle}</span>}
                    compacta
                  />
                )
              })}
            </div>
          </BottomSheet>
          <div className="asistente__acciones asistente__acciones--pegada">
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
              esInstituto={esInstituto}
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
            {esInstituto ? (
              <InstitutoCamposAQuienAfecta
                cue={cue}
                idPrefijo="algo-nuevo"
                borrador={borrador}
                carreras={carreras}
                permiteAlumnos={esCategoria(borrador.categoria) ? CATEGORIA_META[borrador.categoria].permiteAlumnos : true}
                mostrarDescripcion={false}
                onChange={setBorrador}
              />
            ) : (
              <CamposAQuienAfecta
                borrador={borrador}
                idPrefijo="algo-nuevo"
                turnos={turnos}
                usaSelectorEstablecimiento
                ocultarPreguntaAlcance
                ocultarDescripcion
                onChange={setBorrador}
              />
            )}
          </div>
          <div className="asistente__acciones asistente__acciones--pegada algo-nuevo__acciones">
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
