'use client'

import { useEffect, useRef, useState } from 'react'
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

const MENSAJE_FALTA_ESTADO_ESTABLECIMIENTO = 'Indique cómo está el edificio.'

const ALCANCES_SERVICIO: { tipo: 'establecimiento' | 'turno' | 'seccion'; etiqueta: string }[] = [
  { tipo: 'establecimiento', etiqueta: 'Todo el establecimiento' },
  { tipo: 'turno', etiqueta: 'Uno o más turnos' },
  { tipo: 'seccion', etiqueta: 'Una o más secciones' },
]

const PASOS = ['¿Qué pasó?', '¿A quiénes afecta?', '¿Cómo sigue el servicio?', 'Confirmar'] as const

type Paso = 1 | 2 | 3 | 4

// Borrador de sesión (#32): F5 no debería empezar el asistente de cero. La
// clave va por CUE para que dos establecimientos abiertos en la misma pestaña
// no se pisen, y TODO acceso a sessionStorage está envuelto en try/catch: en
// modo privado (o cuota llena) puede lanzar o directamente no estar.
function claveBorradorDe(cue: string): string {
  return `parte-nuevo:draft:${cue}`
}

interface BorradorParteNuevo {
  generacion: string
  paso: Paso
  afectacion: AfectacionBorrador
  servicioEstado: '' | 'normal' | 'suspendido'
  servicioAlcanceTipo: '' | 'establecimiento' | 'turno' | 'seccion'
  servicioTurnos: string[]
  servicioSecciones: number[]
  estadoEstablecimiento: '' | EstadoEstablecimiento
  rigeDesde: string
  idempotencyKey: string
}

function esBorradorParteNuevo(valor: unknown): valor is BorradorParteNuevo {
  if (typeof valor !== 'object' || valor === null) return false
  const b = valor as Record<string, unknown>
  if (
    typeof b.generacion !== 'string' ||
    typeof b.rigeDesde !== 'string' ||
    typeof b.idempotencyKey !== 'string'
  ) {
    return false
  }
  if (b.paso !== 1 && b.paso !== 2 && b.paso !== 3 && b.paso !== 4) return false
  if (b.servicioEstado !== '' && b.servicioEstado !== 'normal' && b.servicioEstado !== 'suspendido') {
    return false
  }
  if (
    b.servicioAlcanceTipo !== '' &&
    b.servicioAlcanceTipo !== 'establecimiento' &&
    b.servicioAlcanceTipo !== 'turno' &&
    b.servicioAlcanceTipo !== 'seccion'
  ) {
    return false
  }
  if (!Array.isArray(b.servicioTurnos) || !b.servicioTurnos.every((t) => typeof t === 'string')) {
    return false
  }
  if (
    !Array.isArray(b.servicioSecciones) ||
    !b.servicioSecciones.every((n) => typeof n === 'number')
  ) {
    return false
  }
  if (typeof b.estadoEstablecimiento !== 'string') return false
  if (
    b.estadoEstablecimiento !== '' &&
    !Object.prototype.hasOwnProperty.call(ETIQUETA_ESTABLECIMIENTO, b.estadoEstablecimiento)
  ) {
    return false
  }
  const a = b.afectacion as Record<string, unknown> | null
  if (typeof a !== 'object' || a === null) return false
  if (
    typeof a.clientId !== 'string' ||
    typeof a.categoria !== 'string' ||
    typeof a.motivo !== 'string' ||
    typeof a.severidad !== 'string' ||
    typeof a.descripcion !== 'string'
  ) {
    return false
  }
  if (!Array.isArray(a.secciones) || !a.secciones.every((n) => typeof n === 'number')) return false
  if (!Array.isArray(a.alumnos) || !a.alumnos.every((n) => typeof n === 'number')) return false
  return true
}

function leerBorrador(clave: string): BorradorParteNuevo | null {
  try {
    const crudo = window.sessionStorage.getItem(clave)
    if (!crudo) return null
    const dato: unknown = JSON.parse(crudo)
    if (esBorradorParteNuevo(dato)) return dato
    // Un borrador de otra versión del formulario no se restaura a medias.
    window.sessionStorage.removeItem(clave)
    return null
  } catch {
    return null
  }
}

function guardarBorrador(clave: string, borrador: BorradorParteNuevo): void {
  try {
    window.sessionStorage.setItem(clave, JSON.stringify(borrador))
  } catch {
    // Sin almacenamiento disponible el asistente sigue funcionando en memoria.
  }
}

function limpiarBorrador(clave: string): void {
  try {
    window.sessionStorage.removeItem(clave)
  } catch {
    // Idem: no poder limpiar no debe romper el guardado ni el reinicio.
  }
}

function empujarPasoEnHistorial(paso: number, generacion: string): void {
  try {
    window.history.pushState({ partePaso: paso, parteGeneracion: generacion }, '')
  } catch {
    // Sin historial navegable el asistente avanza igual, sólo pierde "atrás".
  }
}

function colapsarHistorial(profundidad: number): void {
  if (profundidad <= 0) return
  try {
    window.history.go(-profundidad)
  } catch {
    // Idem: el borrador ya quedó limpio aunque no se pueda recorrer atrás.
  }
}

// El paso restaurado tiene que ser alcanzable con el botón "atrás" del
// navegador (#31): si la entrada actual es la inicial, empujamos las que
// faltan; si ya es el paso restaurado (recarga con F5 conserva el
// history.state), no hacemos nada para no duplicar entradas.
function sincronizarHistorialTrasRestaurar(pasoActual: number, generacion: string): void {
  let base = 1
  try {
    const estado = window.history.state as { partePaso?: number; parteGeneracion?: string } | null
    if (estado && typeof estado.partePaso === 'number' && estado.parteGeneracion === generacion) {
      base = estado.partePaso
    }
  } catch {
    // Sin historial utilizable se empuja desde el paso 1, que es lo correcto.
  }
  if (base >= pasoActual) return
  for (let p = base + 1; p <= pasoActual; p += 1) {
    empujarPasoEnHistorial(p, generacion)
  }
}

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
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const enviandoRef = useRef(false)
  // Identidad de las entradas de historial de ESTE asistente: un popstate de
  // una sesión ya reiniciada no debe revivir sus pasos.
  const generacionRef = useRef<string | null>(null)
  // La primera ejecución del efecto de escritura es el montaje (o el tras
  // "registrar otra"): en ambos casos hay que dejar el storage como está.
  const omitirEscrituraRef = useRef(true)
  const claveBorrador = claveBorradorDe(cue)

  function generacionVigente(): string {
    if (generacionRef.current === null) generacionRef.current = crypto.randomUUID()
    return generacionRef.current
  }

  // Restaura el borrador SOLO dentro de un efecto, nunca durante el render:
  // leer sessionStorage en el render produciría un desajuste de hidratación
  // entre servidor y cliente. Sin borrador (o ilegible) no hay nada que
  // restaurar y el asistente arranca limpio en el paso 1.
  /* eslint-disable react-hooks/set-state-in-effect -- restauración única al
     montar de un borrador de sesión: no hay suscripción que haga (el storage
     no emite eventos) y el render no puede leerlo, así que el efecto aplica lo
     leído una sola vez. La regla aplica a efectos reactivos a cambios de
     estado, no a esta hidratación inicial. */
  useEffect(() => {
    const borrador = leerBorrador(claveBorrador)
    if (!borrador) return
    generacionRef.current = borrador.generacion
    setPaso(borrador.paso)
    setAfectacion(borrador.afectacion)
    setServicioEstado(borrador.servicioEstado)
    setServicioAlcanceTipo(borrador.servicioAlcanceTipo)
    setServicioTurnos(borrador.servicioTurnos)
    setServicioSecciones(borrador.servicioSecciones)
    setEstadoEstablecimiento(borrador.estadoEstablecimiento)
    setRigeDesde(borrador.rigeDesde)
    setIdempotencyKey(borrador.idempotencyKey)
    sincronizarHistorialTrasRestaurar(borrador.paso, borrador.generacion)
  }, [claveBorrador])
  /* eslint-enable react-hooks/set-state-in-effect */

  // #31: el botón "atrás" del navegador camina el asistente un paso para
  // atrás en vez de salirse del flujo y tirar todo lo cargado. Sólo se sale
  // del flujo desde el paso 1, donde no quedan entradas empujadas.
  useEffect(() => {
    function alVolverAtras(evento: PopStateEvent): void {
      const estado = evento.state as { partePaso?: number; parteGeneracion?: string } | null
      if (estado && typeof estado.partePaso === 'number') {
        if (estado.parteGeneracion !== generacionRef.current) return
        if (estado.partePaso >= 1 && estado.partePaso <= PASOS.length) {
          setPaso(estado.partePaso as Paso)
          setError(null)
        }
        return
      }
      // Entrada inicial (sin estado): un paso atrás sin salir del asistente.
      setPaso((actual) => (actual > 1 ? ((actual - 1) as Paso) : actual))
      setError(null)
    }
    window.addEventListener('popstate', alVolverAtras)
    return () => window.removeEventListener('popstate', alVolverAtras)
  }, [])

  // Persiste el borrador y el paso en cada cambio relevante. El primer
  // run (montaje o "registrar otra") se salta para no reescribir la clave
  // recién limpia con el estado por defecto.
  useEffect(() => {
    if (omitirEscrituraRef.current) {
      omitirEscrituraRef.current = false
      return
    }
    guardarBorrador(claveBorrador, {
      generacion: generacionVigente(),
      paso,
      afectacion,
      servicioEstado,
      servicioAlcanceTipo,
      servicioTurnos,
      servicioSecciones,
      estadoEstablecimiento,
      rigeDesde,
      idempotencyKey,
    })
  }, [
    claveBorrador,
    paso,
    afectacion,
    servicioEstado,
    servicioAlcanceTipo,
    servicioTurnos,
    servicioSecciones,
    estadoEstablecimiento,
    rigeDesde,
    idempotencyKey,
  ])

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
      if (servicioEstado === 'suspendido') {
        if (servicioAlcanceTipo === '') return MENSAJE_ALCANCE_FALTANTE
        if (servicioAlcanceTipo === 'turno' && servicioTurnos.length === 0)
          return MENSAJE_ALCANCE_TURNOS_VACIO
        if (servicioAlcanceTipo === 'seccion' && servicioSecciones.length === 0)
          return MENSAJE_ALCANCE_SECCIONES_VACIO
      }
      if (estadoEstablecimiento === '') return MENSAJE_FALTA_ESTADO_ESTABLECIMIENTO
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
    if (paso >= PASOS.length) return
    const siguiente = (paso + 1) as Paso
    setPaso(siguiente)
    // Una entrada por paso: así "atrás" del navegador camina N → N-1.
    empujarPasoEnHistorial(siguiente, generacionVigente())
  }

  function retroceder() {
    setError(null)
    if (paso <= 1) return
    setPaso((actual) => (actual > 1 ? ((actual - 1) as Paso) : actual))
    // El historial tiene que seguir al asistente: sin este back(), la próxima
    // pulsación de "atrás" del navegador llegaría desfasada a un paso.
    try {
      window.history.back()
    } catch {
      // Sin historial navegable el paso anterior se muestra igual.
    }
  }

  // Deja el asistente listo para un hecho nuevo, no para reintentar el que ya
  // se guardó: por eso también cambia el idempotencyKey, no sólo limpia los
  // campos.
  function registrarOtra() {
    omitirEscrituraRef.current = true
    limpiarBorrador(claveBorrador)
    enviandoRef.current = false
    setPaso(1)
    setAfectacion(crearAfectacionVacia(crypto.randomUUID()))
    setServicioEstado('')
    setServicioAlcanceTipo('')
    setServicioTurnos([])
    setServicioSecciones([])
    setEstadoEstablecimiento('')
    setRigeDesde(new Date().toISOString())
    setEnviando(false)
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
    setGuardado(null)
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
        // El reporte quedó guardado: el borrador de sesión ya no representa
        // nada pendiente, y el historial se colapsa para que "atrás" desde la
        // confirmación salga del asistente en vez de revivir sus pasos.
        limpiarBorrador(claveBorrador)
        colapsarHistorial(paso - 1)
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
        <div className="reporte-inicial__confirmacion-acciones">
          <Button render={<a href={`/problematicas/parte?cue=${encodeURIComponent(cue)}`} />}>
            Volver al panel
          </Button>
          <Button type="button" variant="secondary" onClick={registrarOtra}>
            Registrar otra incidencia
          </Button>
        </div>
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
