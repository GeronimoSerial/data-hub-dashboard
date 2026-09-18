'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { AfectacionBorradorCard } from '@/components/infraestructura/afectacion-borrador'
import { CampoVigente } from '@/components/infraestructura/campo-vigente'
import { VigenciaField } from '@/components/infraestructura/vigencia-field'
import {
  ETIQUETA_ESTABLECIMIENTO,
  ETIQUETA_SERVICIO,
  MENSAJE_ACCESO_VENCIDO,
  MENSAJE_ERROR_LECTURA,
  MENSAJE_SIN_CORTE,
  MENSAJE_SIN_SITUACION,
  type EstadoActualRespuesta,
} from '@/components/infraestructura/estado-actual-textos'
import { describirAlcanceServicio } from '@/components/infraestructura/reporte-inicial-resumen'
import { SeccionesSelector } from '@/components/infraestructura/secciones-selector'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  afectacionVigenteABorrador,
  construirPayloadActualizacion,
  snapshotAntesDeVigente,
  snapshotDespuesDeFormulario,
  type AfectacionActualizable,
  type ServicioSeleccionado,
} from '@/lib/infraestructura/actualizacion-parte'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import { diffParte, esDiffVacio } from '@/lib/infraestructura/movimiento-diff'
import { describirMovimiento } from '@/lib/infraestructura/movimiento-descripcion'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'

export interface ActualizacionFormProps {
  cue: string
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
}

const MENSAJE_ERROR_GUARDADO =
  'No pudimos guardar la actualización. La información ingresada se mantiene para que pueda volver a intentar.'

const MENSAJE_AFECTACION_INCOMPLETA =
  'Complete categoría, motivo, severidad y al menos una sección en cada afectación agregada, o quítela.'

const MENSAJE_ALCANCE_FALTANTE = 'Indique el alcance del servicio educativo.'

const MENSAJE_GUARDADO =
  'La actualización fue registrada. El estado actual y el historial ya reflejan los cambios informados.'

// spec §17 "Situación sin cambios guardables".
const MENSAJE_SIN_CAMBIOS = 'Todavía no realizó cambios en el parte actual.'

const ALCANCES_SERVICIO: { tipo: 'establecimiento' | 'turno' | 'seccion'; etiqueta: string }[] = [
  { tipo: 'establecimiento', etiqueta: 'Todo el establecimiento' },
  { tipo: 'turno', etiqueta: 'Uno o más turnos' },
  { tipo: 'seccion', etiqueta: 'Una o más secciones' },
]

function esAfectacionLista(a: AfectacionActualizable): boolean {
  return a.categoria !== '' && a.motivo !== '' && a.severidad !== '' && a.secciones.length > 0
}

function esAfectacionParcial(a: AfectacionActualizable): boolean {
  if (esAfectacionLista(a)) return false
  return (
    a.categoria !== '' ||
    a.motivo !== '' ||
    a.severidad !== '' ||
    a.secciones.length > 0 ||
    a.alumnos.length > 0 ||
    a.descripcion.trim() !== ''
  )
}

type Estado =
  | { fase: 'cargando' }
  | { fase: 'listo'; datos: EstadoActualRespuesta }
  | { fase: 'error'; mensaje: string }

async function obtenerEstado(cue: string): Promise<Estado> {
  try {
    const respuesta = await fetch(`/api/problematicas/parte?cue=${encodeURIComponent(cue)}`)
    if (!respuesta.ok) {
      if (respuesta.status === 401) return { fase: 'error', mensaje: MENSAJE_ACCESO_VENCIDO }
      if (respuesta.status === 503) return { fase: 'error', mensaje: MENSAJE_SIN_CORTE }
      return { fase: 'error', mensaje: MENSAJE_ERROR_LECTURA }
    }
    return { fase: 'listo', datos: (await respuesta.json()) as EstadoActualRespuesta }
  } catch {
    return { fase: 'error', mensaje: MENSAJE_ERROR_LECTURA }
  }
}

/**
 * Pantalla de actualización del parte (spec §8, §9, §13, §14).
 *
 * Carga el estado vigente (mismo GET que EstadoActualParte), lo traduce a un
 * conjunto único de AfectacionActualizable (existentes + nuevas, ver
 * lib/infraestructura/actualizacion-parte.ts) y arma en cada render la
 * fotografía "después" para calcular, del lado del cliente, el mismo diff
 * que el servidor va a persistir. Ese diff maneja tres cosas a la vez:
 *  - habilita/deshabilita "Revisar cambios" (spec §17, diff vacío).
 *  - arma el resumen de la pantalla de confirmación (spec §13).
 *  - nunca decide nada por su cuenta: es sólo una previsualización: el
 *    servidor recalcula el mismo diff de forma independiente al guardar.
 */
export function ActualizacionForm({ cue, turnos, motivos }: ActualizacionFormProps): JSX.Element {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    let vigente = true
    void obtenerEstado(cue).then((siguiente) => {
      if (vigente) setEstado(siguiente)
    })
    return () => {
      vigente = false
    }
  }, [cue])

  if (estado.fase === 'cargando') {
    return (
      <p className="estado-actual-aviso" role="status">
        Buscando el estado actual del establecimiento…
      </p>
    )
  }

  if (estado.fase === 'error') {
    return (
      <p className="estado-actual-aviso__texto" role="alert">
        {estado.mensaje}
      </p>
    )
  }

  if (!estado.datos.parte) {
    return (
      <p className="estado-actual-aviso__texto" role="alert">
        {MENSAJE_SIN_SITUACION}
      </p>
    )
  }

  return (
    <ActualizacionFormCargado
      cue={cue}
      turnos={turnos}
      motivos={motivos}
      datos={estado.datos}
    />
  )
}

function ActualizacionFormCargado({
  cue,
  turnos,
  motivos,
  datos,
}: ActualizacionFormProps & { datos: EstadoActualRespuesta }): JSX.Element {
  const vigentes = datos.afectaciones ?? []
  const estadoEstablecimientoVigente: EstadoEstablecimiento = datos.parte?.estadoEstablecimiento ?? 'habitual'
  const servicioAlcanceVigente = datos.servicio?.alcanceVigente ?? []

  const [afectaciones, setAfectaciones] = useState<AfectacionActualizable[]>(() =>
    vigentes.map(afectacionVigenteABorrador),
  )
  const [servicioEstado, setServicioEstado] = useState<'' | 'normal' | 'suspendido'>('')
  const [servicioAlcanceTipo, setServicioAlcanceTipo] = useState<'' | 'establecimiento' | 'turno' | 'seccion'>('')
  const [servicioTurnos, setServicioTurnos] = useState<string[]>([])
  const [servicioSecciones, setServicioSecciones] = useState<number[]>([])
  const [estadoEstablecimiento, setEstadoEstablecimiento] = useState<'' | EstadoEstablecimiento>('')
  const [rigeDesde, setRigeDesde] = useState(() => new Date().toISOString())
  const [paso, setPaso] = useState<'formulario' | 'resumen'>('formulario')
  const [tocadas, setTocadas] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<{ movimientoId: string } | null>(null)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const enviandoRef = useRef(false)

  const nombresTurnos = Array.from(new Set(turnos.map((t) => t.turno)))

  const servicioSeleccionado: ServicioSeleccionado | null = useMemo(() => {
    if (servicioEstado === '') return null
    const alcance =
      servicioAlcanceTipo === 'turno'
        ? { tipo: 'turno' as const, turnos: servicioTurnos }
        : servicioAlcanceTipo === 'seccion'
          ? { tipo: 'seccion' as const, secciones: servicioSecciones }
          : { tipo: 'establecimiento' as const }
    return { estado: servicioEstado, alcance }
  }, [servicioEstado, servicioAlcanceTipo, servicioTurnos, servicioSecciones])

  const snapshotAntes = useMemo(() => snapshotAntesDeVigente(datos), [datos])

  const snapshotDespues = useMemo(
    () =>
      snapshotDespuesDeFormulario({
        estadoEstablecimientoVigente,
        estadoEstablecimientoSeleccionado: estadoEstablecimiento,
        servicioAlcanceVigente,
        servicioSeleccionado,
        afectaciones,
        turnos,
      }),
    [estadoEstablecimientoVigente, estadoEstablecimiento, servicioAlcanceVigente, servicioSeleccionado, afectaciones, turnos],
  )

  const diff = useMemo(() => diffParte(snapshotAntes, snapshotDespues), [snapshotAntes, snapshotDespues])
  const diffVacio = esDiffVacio(diff)
  const lineasResumen = useMemo(() => describirMovimiento(diff, { tipo: 'actualizacion' }), [diff])

  const afectacionesVisibles = afectaciones.filter((a) => !a.retirada)

  // Qué situaciones ya informadas fueron tocadas: se deduce del mismo diff
  // que alimenta el resumen, sin llevar estado aparte que pueda desfasarse.
  const idsModificadas = new Set<string>([
    ...diff.severidadesCambiadas.map((c) => c.afectacionId),
    ...diff.alcancesCambiados.map((c) => c.afectacionId),
    ...diff.datosCambiados.map((c) => c.afectacionId),
  ])

  function actualizarAfectacion(clientId: string, siguiente: AfectacionActualizable) {
    setAfectaciones((actuales) => actuales.map((a) => (a.clientId === clientId ? siguiente : a)))
  }

  function agregarAfectacion() {
    setAfectaciones((actuales) => [
      ...actuales,
      {
        clientId: crypto.randomUUID(),
        origenId: null,
        retirada: false,
        categoria: '',
        motivo: '',
        severidad: '',
        secciones: [],
        alumnos: [],
        descripcion: '',
      },
    ])
  }

  function quitarONoRetirar(afectacion: AfectacionActualizable) {
    if (afectacion.origenId === null) {
      setAfectaciones((actuales) => actuales.filter((a) => a.clientId !== afectacion.clientId))
      return
    }
    actualizarAfectacion(afectacion.clientId, { ...afectacion, retirada: true })
  }

  function deshacerRetiro(afectacion: AfectacionActualizable) {
    actualizarAfectacion(afectacion.clientId, { ...afectacion, retirada: false })
  }

  function alternarTurno(turno: string) {
    setServicioTurnos((actuales) =>
      actuales.includes(turno) ? actuales.filter((t) => t !== turno) : [...actuales, turno],
    )
  }

  function irAResumen(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (afectacionesVisibles.some(esAfectacionParcial)) {
      setError(MENSAJE_AFECTACION_INCOMPLETA)
      return
    }
    if (servicioEstado !== '' && servicioAlcanceTipo === '') {
      setError(MENSAJE_ALCANCE_FALTANTE)
      return
    }
    if (diffVacio) return
    setError(null)
    setPaso('resumen')
  }

  function volverAFormulario() {
    setPaso('formulario')
  }

  async function confirmarGuardado() {
    if (enviando || enviandoRef.current) return
    enviandoRef.current = true
    setEnviando(true)
    setError(null)

    const payload = construirPayloadActualizacion({
      cue,
      idempotencyKey,
      rigeDesde,
      afectaciones,
      vigentes,
      servicioSeleccionado,
      estadoEstablecimientoSeleccionado: estadoEstablecimiento,
    })

    try {
      const respuesta = await fetch('/api/problematicas/parte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => null)
        enviandoRef.current = false
        setEnviando(false)
        setError(cuerpo && typeof cuerpo.error === 'string' ? cuerpo.error : MENSAJE_ERROR_GUARDADO)
        return
      }

      const cuerpo = await respuesta.json()
      if (cuerpo?.ok === true) {
        setGuardado({ movimientoId: cuerpo.movimientoId })
        return
      }

      enviandoRef.current = false
      setEnviando(false)
      setError(cuerpo && typeof cuerpo.error === 'string' ? cuerpo.error : MENSAJE_ERROR_GUARDADO)
    } catch {
      enviandoRef.current = false
      setEnviando(false)
      setError(MENSAJE_ERROR_GUARDADO)
    }
  }

  if (guardado) {
    return (
      <div className="reporte-inicial__confirmacion" role="status">
        <p>{MENSAJE_GUARDADO}</p>
      </div>
    )
  }

  if (paso === 'resumen') {
    return (
      <div className="reporte-inicial actualizacion-resumen">
        <section className="reporte-inicial__seccion">
          <h2>Cambios que se registrarán</h2>
          <ul className="actualizacion-resumen__lista">
            {lineasResumen.map((linea, indice) => (
              <li key={indice}>{linea}</li>
            ))}
          </ul>
        </section>

        {enviando && (
          <p role="status" aria-live="polite">
            Guardando…
          </p>
        )}

        {error && (
          <p className="reporte-inicial__error" role="alert">
            {error}
          </p>
        )}

        <div className="actualizacion-resumen__acciones">
          <Button type="button" variant="secondary" onClick={volverAFormulario} disabled={enviando}>
            Volver y corregir
          </Button>
          <Button type="button" onClick={confirmarGuardado} disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar actualización'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form className="reporte-inicial" onSubmit={irAResumen}>
      <section className="reporte-inicial__seccion">
        <h2>Lo que está pasando en la escuela</h2>
        {afectaciones.map((a, indiceReal) => (
          <div key={a.clientId} onBlur={() => setTocadas((actuales) => new Set(actuales).add(a.clientId))}>
            <AfectacionBorradorCard
              borrador={a}
              index={indiceReal}
              motivos={motivos}
              turnos={turnos}
              otrasAfectaciones={afectacionesVisibles.filter((x) => x.clientId !== a.clientId)}
              onChange={(siguiente) => actualizarAfectacion(a.clientId, { ...a, ...siguiente })}
              onResolver={() => quitarONoRetirar(a)}
              onDeshacer={() => deshacerRetiro(a)}
              resuelta={a.retirada}
              esNueva={a.origenId === null}
              modificada={a.origenId !== null && idsModificadas.has(a.origenId)}
              disabled={enviando}
            />
            {!a.retirada && tocadas.has(a.clientId) && esAfectacionParcial(a) && (
              <p className="reporte-inicial__error-campo" role="alert">
                {MENSAJE_AFECTACION_INCOMPLETA}
              </p>
            )}
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={agregarAfectacion} disabled={enviando}>
          Agregar otra situación
        </Button>
      </section>

      <section className="reporte-inicial__seccion">
        <h2>Clases</h2>
        <CampoVigente
          etiqueta="¿Cómo siguen las clases?"
          valorVigente={datos.servicio ? ETIQUETA_SERVICIO[datos.servicio.estadoGeneral] : 'Sin informar'}
          valorNuevo={
            servicioEstado === ''
              ? null
              : describirAlcanceServicio({
                  estado: servicioEstado,
                  alcanceTipo: servicioAlcanceTipo,
                  turnos: servicioTurnos,
                  secciones: servicioSecciones.length,
                })
          }
          onDejarComoEsta={() => {
            setServicioEstado('')
            setServicioAlcanceTipo('')
            setServicioTurnos([])
            setServicioSecciones([])
          }}
          disabled={enviando}
        >
          <fieldset className="afectacion-campos__grupo" disabled={enviando}>
            <legend className="afectacion-campos__legend">¿Cómo siguen las clases?</legend>
            <div className="afectacion-campos__opciones">
              {(['normal', 'suspendido'] as const).map((valorEstado) => (
                <label key={valorEstado} className="opcion-radio opcion-radio--compacta">
                  <input
                    type="radio"
                    name="servicio-educativo"
                    value={valorEstado}
                    checked={servicioEstado === valorEstado}
                    onChange={() => setServicioEstado(valorEstado)}
                    disabled={enviando}
                  />
                  <span className="opcion-radio__texto">
                    <span className="opcion-radio__titulo">{ETIQUETA_SERVICIO[valorEstado]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Antes el alcance se preguntaba también al elegir "Clases
              normales", y no quiere decir nada: el alcance describe a quiénes
              alcanza una SUSPENSIÓN. Mismo criterio que el reporte inicial. */}
          {servicioEstado === 'suspendido' && (
            <fieldset className="afectacion-campos__grupo" disabled={enviando}>
              <legend className="afectacion-campos__legend">¿A quiénes alcanza la suspensión?</legend>
              <div className="afectacion-campos__opciones">
                {ALCANCES_SERVICIO.map((opcion) => (
                  <label key={opcion.tipo} className="opcion-radio opcion-radio--compacta">
                    <input
                      type="radio"
                      name="alcance-servicio"
                      value={opcion.tipo}
                      checked={servicioAlcanceTipo === opcion.tipo}
                      onChange={() => setServicioAlcanceTipo(opcion.tipo)}
                      disabled={enviando}
                    />
                    <span className="opcion-radio__texto">
                      <span className="opcion-radio__titulo">{opcion.etiqueta}</span>
                    </span>
                  </label>
                ))}
              </div>

              {servicioAlcanceTipo === 'turno' && (
                <div className="afectacion-campos__anidado">
                  {nombresTurnos.map((turno) => (
                    <Checkbox
                      key={turno}
                      label={turno}
                      checked={servicioTurnos.includes(turno)}
                      onCheckedChange={() => alternarTurno(turno)}
                      disabled={enviando}
                    />
                  ))}
                </div>
              )}

              {servicioAlcanceTipo === 'seccion' && (
                <div className="afectacion-campos__anidado">
                  <SeccionesSelector
                    turnos={turnos}
                    seleccionadas={servicioSecciones}
                    alumnosSeleccionados={[]}
                    onCambiar={(secciones) => setServicioSecciones(secciones)}
                    disabled={enviando}
                    permiteAlumnos={false}
                  />
                </div>
              )}
            </fieldset>
          )}
        </CampoVigente>
      </section>

      <section className="reporte-inicial__seccion">
        <h2>Edificio</h2>
        <CampoVigente
          etiqueta="¿Cómo está el edificio?"
          valorVigente={ETIQUETA_ESTABLECIMIENTO[estadoEstablecimientoVigente]}
          valorNuevo={estadoEstablecimiento === '' ? null : ETIQUETA_ESTABLECIMIENTO[estadoEstablecimiento]}
          onDejarComoEsta={() => setEstadoEstablecimiento('')}
          disabled={enviando}
        >
          <fieldset className="afectacion-campos__grupo" disabled={enviando}>
            <legend className="afectacion-campos__legend">¿Cómo está el edificio?</legend>
            <div className="afectacion-campos__opciones">
              {Object.entries(ETIQUETA_ESTABLECIMIENTO).map(([valor, etiqueta]) => (
                <label key={valor} className="opcion-radio opcion-radio--compacta">
                  <input
                    type="radio"
                    name="estado-establecimiento"
                    value={valor}
                    checked={estadoEstablecimiento === valor}
                    onChange={() => setEstadoEstablecimiento(valor as EstadoEstablecimiento)}
                    disabled={enviando}
                  />
                  <span className="opcion-radio__texto">
                    <span className="opcion-radio__titulo">{etiqueta}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </CampoVigente>
      </section>

      {/* Sin <h2> propio: la leyenda del campo ya es la pregunta completa, y
          un título encima diciendo lo mismo se lee dos veces. */}
      <section className="reporte-inicial__seccion">
        <VigenciaField value={rigeDesde} onChange={setRigeDesde} disabled={enviando} />
      </section>

      {/* El director veía lo que había cambiado recién en la pantalla de
          confirmación. Mostrarlo mientras edita convierte una pantalla que
          "no se sabe en qué estado está" en una que se narra sola. */}
      <section className="actualizacion-pendientes" aria-live="polite">
        {diffVacio ? (
          <p className="actualizacion-pendientes__vacio" role="status">
            {MENSAJE_SIN_CAMBIOS}
          </p>
        ) : (
          <>
            <h2 className="actualizacion-pendientes__titulo">
              Sin guardar: {lineasResumen.length}{' '}
              {lineasResumen.length === 1 ? 'cambio' : 'cambios'}
            </h2>
            <ul className="actualizacion-resumen__lista">
              {lineasResumen.map((linea, indice) => (
                <li key={indice}>{linea}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {error && (
        <p className="reporte-inicial__error" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={diffVacio}>
        Revisar cambios
      </Button>
    </form>
  )
}