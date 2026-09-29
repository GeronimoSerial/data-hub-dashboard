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
import { contarCambios, diffParte, esDiffVacio } from '@/lib/infraestructura/movimiento-diff'
import { describirMovimiento } from '@/lib/infraestructura/movimiento-descripcion'
import {
  crearAlmacenNavegador,
  intentarEnviar,
  registrarAutoReintento,
  leerBorrador as leerColaEnvio,
  MENSAJES_ESTADO,
  type EstadoEnvio,
} from '@/lib/infraestructura/parte/envio-offline'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'
import {
  colapsarHistorial,
  crearBorradorStore,
  empujarPasoEnHistorial,
  leerPasoBaseHistorial,
} from '@/lib/infraestructura/parte/borrador-historial'

const almacenParte = crearAlmacenNavegador()

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

// Borrador de sesión (#32): F5 no debería perder lo escrito en la pantalla de
// actualización. Clave por CUE para que dos establecimientos en la misma
// pestaña no se pisen. El almacén intenta IndexedDB y cae a localStorage si no
// está disponible (modo privado, navegadores viejos).
function claveBorradorDe(cue: string): string {
  return `parte-actualizacion:draft:${cue}`
}

type PasoActualizacion = 'formulario' | 'resumen'

function pasoANumero(paso: PasoActualizacion): number {
  return paso === 'resumen' ? 2 : 1
}

function numeroAPaso(numero: number): PasoActualizacion {
  return numero === 2 ? 'resumen' : 'formulario'
}

interface BorradorParteActualizacion {
  generacion: string
  paso: PasoActualizacion
  afectaciones: AfectacionActualizable[]
  servicioEstado: '' | 'normal' | 'suspendido'
  servicioAlcanceTipo: '' | 'establecimiento' | 'turno' | 'seccion'
  servicioTurnos: string[]
  servicioSecciones: number[]
  estadoEstablecimiento: '' | EstadoEstablecimiento
  rigeDesde: string
  // Vestigial (ver esBorradorParteActualizacion): sólo se lee por
  // compatibilidad con borradores viejos, ya no se escribe.
  idempotencyKey?: string
  tocadas: string[]
}

function esAfectacionActualizable(valor: unknown): valor is AfectacionActualizable {
  if (typeof valor !== 'object' || valor === null) return false
  const a = valor as Record<string, unknown>
  if (typeof a.clientId !== 'string' || typeof a.categoria !== 'string') return false
  if (typeof a.motivo !== 'string' || typeof a.severidad !== 'string') return false
  if (typeof a.descripcion !== 'string') return false
  if (a.origenId !== null && typeof a.origenId !== 'string') return false
  if (typeof a.retirada !== 'boolean') return false
  if (!Array.isArray(a.secciones) || !a.secciones.every((n) => typeof n === 'number')) return false
  if (!Array.isArray(a.alumnos) || !a.alumnos.every((n) => typeof n === 'number')) return false
  return true
}

function esBorradorParteActualizacion(valor: unknown): valor is BorradorParteActualizacion {
  if (typeof valor !== 'object' || valor === null) return false
  const b = valor as Record<string, unknown>
  if (typeof b.generacion !== 'string' || typeof b.rigeDesde !== 'string') {
    return false
  }
  if (b.idempotencyKey !== undefined && typeof b.idempotencyKey !== 'string') return false
  if (b.paso !== 'formulario' && b.paso !== 'resumen') return false
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
  if (!Array.isArray(b.afectaciones) || !b.afectaciones.every(esAfectacionActualizable)) {
    return false
  }
  if (!Array.isArray(b.tocadas) || !b.tocadas.every((t) => typeof t === 'string')) return false
  return true
}

const borradorStore = crearBorradorStore(esBorradorParteActualizacion)
const leerBorrador = (clave: string) => borradorStore.leer(almacenParte, clave)
const guardarBorrador = (clave: string, borrador: BorradorParteActualizacion) =>
  borradorStore.guardar(almacenParte, clave, borrador)
const limpiarBorrador = (clave: string) => borradorStore.limpiar(almacenParte, clave)

// La pantalla restaurada tiene que ser alcanzable con el botón "atrás" del
// navegador (#31): si la entrada actual es la inicial, empujamos la que falta;
// si ya es la restaurada (recarga con F5 conserva el history.state), no
// hacemos nada para no duplicar entradas.
function sincronizarHistorialTrasRestaurar(pasoActual: PasoActualizacion, generacion: string): void {
  const base = leerPasoBaseHistorial(generacion)
  const destino = pasoANumero(pasoActual)
  if (base >= destino) return
  for (let p = base + 1; p <= destino; p += 1) {
    empujarPasoEnHistorial(p, generacion)
  }
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

  // "Registrar otra" vuelve a buscar el estado vigente en vez de sólo limpiar
  // campos: lo que se acaba de guardar ya es el nuevo vigente, y el formulario
  // de abajo se remonta con `datos` frescos porque deja de existir mientras
  // `estado.fase` está en 'cargando'.
  function registrarOtra() {
    // El borrador de sesión ya no representa nada pendiente (#32).
    void limpiarBorrador(claveBorradorDe(cue))
    setEstado({ fase: 'cargando' })
    void obtenerEstado(cue).then(setEstado)
  }

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
      onRegistrarOtra={registrarOtra}
    />
  )
}

function ActualizacionFormCargado({
  cue,
  turnos,
  motivos,
  datos,
  onRegistrarOtra,
}: ActualizacionFormProps & { datos: EstadoActualRespuesta; onRegistrarOtra: () => void }): JSX.Element {
  const vigentes = datos.afectaciones ?? []
  const estadoEstablecimientoVigente: EstadoEstablecimiento = datos.parte?.estadoEstablecimiento ?? 'habitual'

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
  const [estadoEnvio, setEstadoEnvio] = useState<EstadoEnvio | null>(null)
  const [motivoEnvio, setMotivoEnvio] = useState<string | null>(null)
  const enviandoRef = useRef(false)
  const reintentarRef = useRef<() => void>(() => {})
  // Identidad de las entradas de historial de ESTE formulario: un popstate de
  // una sesión ya reiniciada no debe revivir sus pantallas.
  const generacionRef = useRef<string | null>(null)
  // La primera ejecución del efecto de escritura es el montaje (el formulario
  // se remonta después de "registrar otra"): hay que dejar el storage como está.
  const omitirEscrituraRef = useRef(true)
  const claveBorrador = claveBorradorDe(cue)

  function generacionVigente(): string {
    if (generacionRef.current === null) generacionRef.current = crypto.randomUUID()
    return generacionRef.current
  }

  // Restaura el borrador SOLO dentro de un efecto, nunca durante el render:
  // leer el almacén local en el render produciría un desajuste de hidratación.
  // Sin borrador (o ilegible) el formulario conserva el estado que arma la
  // carga del parte vigente.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const borrador = await leerBorrador(claveBorrador)
      if (cancelado || !borrador) return
      generacionRef.current = borrador.generacion
      setPaso(borrador.paso)
      setAfectaciones(borrador.afectaciones)
      setServicioEstado(borrador.servicioEstado)
      setServicioAlcanceTipo(borrador.servicioAlcanceTipo)
      setServicioTurnos(borrador.servicioTurnos)
      setServicioSecciones(borrador.servicioSecciones)
      setEstadoEstablecimiento(borrador.estadoEstablecimiento)
      setRigeDesde(borrador.rigeDesde)
      setTocadas(new Set(borrador.tocadas))
      sincronizarHistorialTrasRestaurar(borrador.paso, borrador.generacion)
    })()
    return () => {
      cancelado = true
    }
  }, [claveBorrador])

  // Restaura el estado del envío en cola SIEMPRE al montar, haya o no
  // borrador del formulario: sin esto, cerrar y reabrir la app con un envío
  // pendiente dejaba `estadoEnvio` en null y el reintento automático al
  // recuperar la conexión no se disparaba.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const colaPendiente = await leerColaEnvio(almacenParte, 'actualizar', cue)
      if (cancelado || !colaPendiente) return
      setEstadoEnvio(colaPendiente.estado)
      setMotivoEnvio(colaPendiente.motivoError ?? null)
    })()
    return () => {
      cancelado = true
    }
  }, [cue])

  // #31: el botón "atrás" del navegador vuelve del resumen al formulario en
  // vez de salirse del flujo y tirar lo cargado. Sólo se sale del flujo desde
  // la pantalla 1, donde no quedan entradas empujadas.
  useEffect(() => {
    function alVolverAtras(evento: PopStateEvent): void {
      const estado = evento.state as { partePaso?: number; parteGeneracion?: string } | null
      if (estado && typeof estado.partePaso === 'number') {
        if (estado.parteGeneracion !== generacionRef.current) return
        if (estado.partePaso === 1 || estado.partePaso === 2) {
          setPaso(numeroAPaso(estado.partePaso))
          setError(null)
        }
        return
      }
      // Entrada inicial (sin estado): un paso atrás sin salir del formulario.
      setPaso((actual) => (actual === 'resumen' ? 'formulario' : actual))
      setError(null)
    }
    window.addEventListener('popstate', alVolverAtras)
    return () => window.removeEventListener('popstate', alVolverAtras)
  }, [])

  // Persiste el borrador y la pantalla activa en cada cambio relevante. El
  // primer run (montaje) se salta para no reescribir la clave recién limpia
  // con el estado por defecto.
  useEffect(() => {
    if (omitirEscrituraRef.current) {
      omitirEscrituraRef.current = false
      return
    }
    void guardarBorrador(claveBorrador, {
      generacion: generacionVigente(),
      paso,
      afectaciones,
      servicioEstado,
      servicioAlcanceTipo,
      servicioTurnos,
      servicioSecciones,
      estadoEstablecimiento,
      rigeDesde,
      tocadas: Array.from(tocadas),
    })
  }, [
    claveBorrador,
    paso,
    afectaciones,
    servicioEstado,
    servicioAlcanceTipo,
    servicioTurnos,
    servicioSecciones,
    estadoEstablecimiento,
    rigeDesde,
    tocadas,
  ])

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
        servicioAlcanceVigente: datos.servicio?.alcanceVigente ?? [],
        servicioSeleccionado,
        afectaciones,
        turnos,
      }),
    [estadoEstablecimientoVigente, estadoEstablecimiento, datos, servicioSeleccionado, afectaciones, turnos],
  )

  const diff = useMemo(() => diffParte(snapshotAntes, snapshotDespues), [snapshotAntes, snapshotDespues])
  const diffVacio = esDiffVacio(diff)
  // Cantidad de cambios, no de renglones: agregar una afectación se narra en
  // dos líneas y sigue siendo un solo cambio.
  const cantidadCambios = contarCambios(diff)
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
    // Una entrada por pantalla: así "atrás" del navegador camina
    // resumen → formulario sin salir del flujo.
    empujarPasoEnHistorial(2, generacionVigente())
  }

  function volverAFormulario() {
    setPaso('formulario')
    // El historial tiene que seguir al formulario: sin este back(), la próxima
    // pulsación de "atrás" del navegador llegaría desfasada de pantalla.
    try {
      window.history.back()
    } catch {
      // Sin historial navegable la pantalla anterior se muestra igual.
    }
  }

  async function confirmarGuardado() {
    if (enviando || enviandoRef.current) return
    enviandoRef.current = true
    setEnviando(true)
    setError(null)
    setMotivoEnvio(null)

    const datosEnvio = construirPayloadActualizacion({
      cue,
      // `construirPayloadActualizacion` pide una idempotencyKey por firma,
      // pero nunca es la que viaja al servidor: `construirCuerpo` de abajo
      // siempre la pisa con la que decide el motor de envío por tipo+cue
      // (ver envio-offline.ts). Este valor es puramente de relleno.
      idempotencyKey: crypto.randomUUID(),
      rigeDesde,
      afectaciones,
      vigentes,
      servicioSeleccionado,
      estadoEstablecimientoSeleccionado: estadoEstablecimiento,
    })

    const resultado = await intentarEnviar(datosEnvio, {
      almacen: almacenParte,
      tipo: 'actualizar',
      cue,
      fetchImpl: fetch,
      url: '/api/problematicas/parte',
      construirCuerpo: (datos, idempotencyKeyReal) => ({ ...datos, idempotencyKey: idempotencyKeyReal }),
      // Hallazgo #2 del gate N1: un 2xx sin `movimientoId` no es un éxito
      // real, aunque el transporte HTTP haya sido 2xx.
      validarExito: (respuesta) => {
        const cuerpo = respuesta as { ok?: boolean; movimientoId?: string } | null
        return !!cuerpo && cuerpo.ok === true && typeof cuerpo.movimientoId === 'string'
      },
      onCambioEstado: (borrador) => {
        setEstadoEnvio(borrador.estado)
        setMotivoEnvio(borrador.motivoError ?? null)
      },
    })

    if (resultado.ok) {
      const cuerpo = resultado.respuesta as { ok?: boolean; movimientoId?: string; error?: string } | null
      if (cuerpo && cuerpo.ok === true && typeof cuerpo.movimientoId === 'string') {
        // La actualización quedó guardada: el borrador de sesión ya no
        // representa nada pendiente, y el historial se colapsa para que "atrás"
        // desde la confirmación salga del formulario en vez de revivir la
        // pantalla de resumen.
        void limpiarBorrador(claveBorrador)
        colapsarHistorial(pasoANumero(paso) - 1)
        setGuardado({ movimientoId: cuerpo.movimientoId })
        return
      }
      enviandoRef.current = false
      setEnviando(false)
      setError(cuerpo && typeof cuerpo.error === 'string' ? cuerpo.error : MENSAJE_ERROR_GUARDADO)
      return
    }

    enviandoRef.current = false
    setEnviando(false)
    // 'pendiente-envio' no es un error: queda en cola y se reintenta solo al
    // volver la conexión. onCambioEstado ya actualizó el texto de estado.
    // Para 'error' (4xx no reintentable o sesión vencida) el borrador se
    // conserva y el motivo viaja en motivoEnvio.
  }

  useEffect(() => {
    reintentarRef.current = () => {
      if (guardado) return
      if (estadoEnvio !== 'pendiente-envio') return
      void confirmarGuardado()
    }
  })

  useEffect(() => {
    return registrarAutoReintento(() => reintentarRef.current())
  }, [])

  if (guardado) {
    return (
      <div className="reporte-inicial__confirmacion" role="status">
        <p>{MENSAJE_GUARDADO}</p>
        <div className="reporte-inicial__confirmacion-acciones">
          <Button render={<a href={`/problematicas/parte?cue=${encodeURIComponent(cue)}`} />}>
            Volver al panel
          </Button>
          <Button type="button" variant="secondary" onClick={onRegistrarOtra}>
            Registrar otra incidencia
          </Button>
        </div>
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

        {estadoEnvio && (
          <p role="status" aria-live="polite">
            {estadoEnvio === 'error' && motivoEnvio
              ? `${MENSAJES_ESTADO.error}: ${motivoEnvio}`
              : MENSAJES_ESTADO[estadoEnvio]}
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
    <form className="reporte-inicial reporte-inicial--con-panel" onSubmit={irAResumen}>
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
        <h2>Funcionamiento escolar</h2>
        <CampoVigente
          etiqueta="¿Cómo funciona la escuela?"
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
            <legend className="afectacion-campos__legend">¿Cómo funciona la escuela?</legend>
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

          {servicioEstado === 'suspendido' && (
            <fieldset className="afectacion-campos__grupo" disabled={enviando}>
              <legend className="afectacion-campos__legend">¿Dónde se interrumpió el funcionamiento?</legend>
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
          "no se sabe en qué estado está" en una que se narra sola. En
          teléfono cae acá, entre el último campo y el botón; en escritorio
          el CSS lo sienta al costado, donde se lee sin bajar. */}
      <section className="actualizacion-pendientes" aria-live="polite">
        {diffVacio ? (
          <p className="actualizacion-pendientes__vacio" role="status">
            {MENSAJE_SIN_CAMBIOS}
          </p>
        ) : (
          <>
            <h2 className="actualizacion-pendientes__titulo">
              Sin guardar: {cantidadCambios} {cantidadCambios === 1 ? 'cambio' : 'cambios'}
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
