'use client'

import { useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import {
  CamposAQuienAfecta,
  CamposQuePaso,
  crearAfectacionVacia,
  totalAlumnosDe,
  type AfectacionBorrador,
} from '@/components/infraestructura/afectacion-campos'
import { VigenciaField } from '@/components/infraestructura/vigencia-field'
import {
  ETIQUETA_ESTABLECIMIENTO,
  ETIQUETA_SERVICIO,
} from '@/components/infraestructura/estado-actual-textos'
import { armarResumen } from '@/components/infraestructura/reporte-inicial-resumen'
import { SeccionesSelector } from '@/components/infraestructura/secciones-selector'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import type { Severidad } from '@/lib/infraestructura/validacion'
import type { CategoriaProblematica } from '@/lib/infraestructura/categorias'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'

export interface ReporteInicialFormProps {
  cue: string
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
}

const MENSAJE_ERROR_GUARDADO =
  'No pudimos guardar el reporte. La información ingresada se mantiene para que pueda volver a intentar.'

const MENSAJE_GUARDADO =
  'El reporte fue registrado. El estado actual y el historial ya reflejan lo informado.'

const MENSAJE_FALTA_QUE_PASO =
  'Elija el tipo de problema, el motivo y la severidad para continuar.'

const MENSAJE_FALTA_ALCANCE_AFECTACION =
  'Elija al menos una sección afectada para continuar.'

const MENSAJE_ALCANCE_FALTANTE = 'Indique el alcance de la suspensión.'

const MENSAJE_ALCANCE_TURNOS_VACIO = 'Indique a qué turnos alcanza la suspensión.'

const MENSAJE_ALCANCE_SECCIONES_VACIO = 'Indique a qué secciones alcanza la suspensión.'

const ALCANCES_SERVICIO: { tipo: 'establecimiento' | 'turno' | 'seccion'; etiqueta: string }[] = [
  { tipo: 'establecimiento', etiqueta: 'Todo el establecimiento' },
  { tipo: 'turno', etiqueta: 'Uno o más turnos' },
  { tipo: 'seccion', etiqueta: 'Una o más secciones' },
]

const PASOS = ['¿Qué pasó?', '¿A quiénes afecta?', '¿Cómo sigue el servicio?', 'Confirmar'] as const

type Paso = 1 | 2 | 3 | 4

/**
 * Asistente de reporte inicial (spec §7).
 *
 * Por qué un asistente y no el formulario completo en una sola pantalla: el
 * primer reporte de un establecimiento declara UN hecho. No hay inventario que
 * recorrer, así que no hay nada que el director pierda de vista al avanzar de
 * paso, y sí hay mucho que gana: la versión anterior abría con las cuatro
 * secciones del dominio desplegadas a la vez y un botón "Agregar afectación"
 * bajo un título vacío, que se leía como una invitación a encadenar problemas.
 *
 * Por eso este formulario NO tiene botón de agregar y su estado es UNA
 * afectación, no una lista. Cargar varias es la tarea de la pantalla de
 * actualización, que sí muestra un inventario.
 *
 * El envío conserva el contrato de POST /api/problematicas/parte tal cual: la
 * única afectación viaja en `afectacionesNuevas` y las otras dos listas van
 * vacías, igual que antes.
 */
export function ReporteInicialForm({ cue, turnos, motivos }: ReporteInicialFormProps): JSX.Element {
  const [paso, setPaso] = useState<Paso>(1)
  const [afectacion, setAfectacion] = useState<AfectacionBorrador>(() =>
    crearAfectacionVacia(crypto.randomUUID()),
  )
  const [servicioEstado, setServicioEstado] = useState<'' | 'normal' | 'suspendido'>('')
  const [servicioAlcanceTipo, setServicioAlcanceTipo] = useState<
    '' | 'establecimiento' | 'turno' | 'seccion'
  >('')
  const [servicioTurnos, setServicioTurnos] = useState<string[]>([])
  const [servicioSecciones, setServicioSecciones] = useState<number[]>([])
  const [estadoEstablecimiento, setEstadoEstablecimiento] = useState<'' | EstadoEstablecimiento>('')
  const [rigeDesde, setRigeDesde] = useState(() => new Date().toISOString())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<{ movimientoId: string } | null>(null)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const enviandoRef = useRef(false)

  const nombresTurnos = Array.from(new Set(turnos.map((t) => t.turno)))

  // Qué le falta al paso actual para poder avanzar. `null` significa que el
  // paso está completo. Se evalúa en el momento de avanzar, no mientras
  // escribe: un error que aparece antes de que el director termine de
  // contestar es una acusación, no una ayuda.
  function faltanteDelPaso(actual: Paso): string | null {
    if (actual === 1) {
      const completo =
        afectacion.categoria !== '' && afectacion.motivo !== '' && afectacion.severidad !== ''
      return completo ? null : MENSAJE_FALTA_QUE_PASO
    }
    if (actual === 2) {
      return afectacion.secciones.length > 0 ? null : MENSAJE_FALTA_ALCANCE_AFECTACION
    }
    if (actual === 3) {
      if (servicioEstado !== 'suspendido') return null
      if (servicioAlcanceTipo === '') return MENSAJE_ALCANCE_FALTANTE
      if (servicioAlcanceTipo === 'turno' && servicioTurnos.length === 0)
        return MENSAJE_ALCANCE_TURNOS_VACIO
      if (servicioAlcanceTipo === 'seccion' && servicioSecciones.length === 0)
        return MENSAJE_ALCANCE_SECCIONES_VACIO
      return null
    }
    return null
  }

  function avanzar() {
    const faltante = faltanteDelPaso(paso)
    if (faltante) {
      setError(faltante)
      return
    }
    setError(null)
    setPaso((actual) => (actual < 4 ? ((actual + 1) as Paso) : actual))
  }

  function retroceder() {
    setError(null)
    setPaso((actual) => (actual > 1 ? ((actual - 1) as Paso) : actual))
  }

  function alternarTurno(turno: string) {
    setServicioTurnos((actuales) =>
      actuales.includes(turno) ? actuales.filter((t) => t !== turno) : [...actuales, turno],
    )
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (paso !== 4) return
    if (enviando || enviandoRef.current) return

    enviandoRef.current = true
    setEnviando(true)
    setError(null)

    const alcance =
      servicioAlcanceTipo === 'turno'
        ? { tipo: 'turno' as const, turnos: servicioTurnos }
        : servicioAlcanceTipo === 'seccion'
          ? { tipo: 'seccion' as const, secciones: servicioSecciones }
          : { tipo: 'establecimiento' as const }

    try {
      const respuesta = await fetch('/api/problematicas/parte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cue,
          idempotencyKey,
          rigeDesde,
          afectacionesNuevas: [
            {
              motivo: afectacion.motivo,
              severidad: afectacion.severidad as Severidad,
              descripcion: afectacion.descripcion.trim() || undefined,
              secciones: afectacion.secciones,
              alumnos: afectacion.alumnos.length > 0 ? afectacion.alumnos : undefined,
            },
          ],
          afectacionesModificadas: [],
          afectacionesRetiradas: [],
          servicioEducativo:
            servicioEstado === '' ? undefined : { estado: servicioEstado, alcance },
          estadoEstablecimiento:
            estadoEstablecimiento === '' ? undefined : { estado: estadoEstablecimiento },
        }),
      })

      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => null)
        enviandoRef.current = false
        setEnviando(false)
        setError(cuerpo && typeof cuerpo.error === 'string' ? cuerpo.error : MENSAJE_ERROR_GUARDADO)
        return
      }

      const datos = await respuesta.json()
      if (datos?.ok === true) {
        // Un reporte guardado no se reenvía desde la misma instancia del
        // formulario: el ref queda clavado en true a propósito.
        setGuardado({ movimientoId: datos.movimientoId })
        return
      }

      enviandoRef.current = false
      setEnviando(false)
      setError(datos && typeof datos.error === 'string' ? datos.error : MENSAJE_ERROR_GUARDADO)
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

  const lineasResumen = armarResumen({
    afectacion: {
      motivo: afectacion.motivo,
      severidad: afectacion.severidad,
      secciones: afectacion.secciones.length,
      alumnos: totalAlumnosDe(afectacion, turnos),
      descripcion: afectacion.descripcion,
    },
    servicio:
      servicioEstado === ''
        ? null
        : {
            estado: servicioEstado,
            alcanceTipo: servicioAlcanceTipo,
            turnos: servicioTurnos,
            secciones: servicioSecciones.length,
          },
    estadoEstablecimiento,
    rigeDesde,
  })

  return (
    <form className="reporte-inicial" onSubmit={manejarEnvio}>
      <div className="asistente__progreso">
        <p className="asistente__contador">
          Paso {paso} de {PASOS.length}
        </p>
        <ol className="asistente__pasos">
          {PASOS.map((titulo, i) => (
            <li
              key={titulo}
              className={`asistente__paso${i + 1 === paso ? ' asistente__paso--actual' : ''}${
                i + 1 < paso ? ' asistente__paso--hecho' : ''
              }`}
              aria-current={i + 1 === paso ? 'step' : undefined}
            >
              <span className="asistente__paso-texto">{titulo}</span>
            </li>
          ))}
        </ol>
      </div>

      <section className="asistente__cuerpo" aria-labelledby="asistente-paso-titulo">
        <h3 id="asistente-paso-titulo" className="asistente__titulo">
          {PASOS[paso - 1]}
        </h3>

        {paso === 1 && (
          <CamposQuePaso
            borrador={afectacion}
            idPrefijo="reporte"
            motivos={motivos}
            otrasAfectaciones={[]}
            onChange={setAfectacion}
            disabled={enviando}
          />
        )}

        {paso === 2 && (
          <CamposAQuienAfecta
            borrador={afectacion}
            idPrefijo="reporte"
            turnos={turnos}
            onChange={setAfectacion}
            disabled={enviando}
          />
        )}

        {paso === 3 && (
          <>
            <fieldset className="afectacion-campos__grupo" disabled={enviando}>
              <legend className="afectacion-campos__legend">¿Cómo siguen las clases?</legend>
              <div className="afectacion-campos__opciones">
                {(['normal', 'suspendido'] as const).map((estado) => (
                  <label key={estado} className="opcion-radio opcion-radio--compacta">
                    <input
                      type="radio"
                      name="servicio-educativo"
                      value={estado}
                      checked={servicioEstado === estado}
                      onChange={() => setServicioEstado(estado)}
                      disabled={enviando}
                    />
                    <span className="opcion-radio__texto">
                      <span className="opcion-radio__titulo">{ETIQUETA_SERVICIO[estado]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* El alcance sólo tiene sentido si hay suspensión: preguntarlo
                siempre obligaría al director a leer y descartar tres opciones
                que no le aplican. */}
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

            <div className="afectacion-campos__grupo">
              <VigenciaField value={rigeDesde} onChange={setRigeDesde} disabled={enviando} />
            </div>
          </>
        )}

        {paso === 4 && (
          <div className="asistente__resumen">
            <p className="asistente__resumen-intro">
              Esto es lo que va a quedar informado. Revíselo antes de guardar.
            </p>
            <ul className="asistente__resumen-lista">
              {lineasResumen.map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
          </div>
        )}
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

      <div className="asistente__acciones">
        {paso > 1 && (
          <Button type="button" variant="secondary" onClick={retroceder} disabled={enviando}>
            Volver
          </Button>
        )}
        {/*
          Las dos `key` no son decorativas: sin ellas React reconcilia ambos
          botones como el MISMO nodo del DOM y sólo le cambia el `type`. El
          click que avanza del paso 3 al 4 corre el handler, React vuelve a
          renderizar con type="submit" y recién entonces el navegador ejecuta
          la acción por defecto del click — que ahora es enviar el formulario.
          Resultado: un solo toque en "Continuar" guardaba el reporte sin que
          el director llegara a ver el resumen. Con `key` distintas el botón
          anterior se desmonta y no queda ninguna acción por defecto que
          ejecutar.
        */}
        {paso < 4 ? (
          <Button key="continuar" type="button" onClick={avanzar} disabled={enviando}>
            Continuar
          </Button>
        ) : (
          // Habilitado siempre: llegar al paso 4 ya exige los datos
          // obligatorios, así que no queda ningún botón gris sin explicación.
          <Button key="guardar" type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar reporte'}
          </Button>
        )}
      </div>
    </form>
  )
}
