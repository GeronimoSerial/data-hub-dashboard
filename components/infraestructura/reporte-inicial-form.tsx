'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import type { FormEvent, JSX } from 'react'
import {
  CamposAQuienAfecta,
  CamposQuePaso,
  aplanarSecciones,
  crearAfectacionVacia,
  esAfectacionLista,
  esAfectacionParcial,
  totalAlumnosDe,
  type AfectacionBorrador,
} from '@/components/infraestructura/afectacion-campos'
import { gravedadCompleta } from '@/components/infraestructura/campo-gravedad'
import { VigenciaChips } from '@/components/infraestructura/vigencia-chips'
import { ETIQUETA_ESTABLECIMIENTO } from '@/components/infraestructura/estado-actual-textos'
import { CamposClasesEdificio } from '@/components/infraestructura/campos-clases-edificio'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { armarResumen } from '@/components/infraestructura/reporte-inicial-resumen'
import { limpiarVinculoVerificacion, leerVinculoVerificacion } from './verificacion-vinculo'
import { Button } from '@/components/ui/button'
import { EstadoEnvioAviso } from '@/components/infraestructura/estado-envio-aviso'
import { Opcion } from '@/components/ui/opcion'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import type { Severidad } from '@/lib/infraestructura/validacion'
import { JUSTIFICACIONES_CRITICA } from '@/lib/infraestructura/justificacion-critica'
import { requiereJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'
import {
  errorVigencia as obtenerErrorVigencia,
  etiquetaVigencia,
  esEleccionVigencia,
  resolverVigencia,
  VIGENCIA_AHORA,
  type EleccionVigencia,
} from '@/lib/infraestructura/vigencia-eleccion'
import { MENSAJE_FUERA_DE_RANGO_VIGENCIA } from '@/lib/infraestructura/vigencia-rango'
import {
  colapsarHistorial,
  crearBorradorStore,
  empujarPasoEnHistorial,
  leerPasoBaseHistorial,
} from '@/lib/infraestructura/parte/borrador-historial'
import {
  crearAlmacenLocalStorage,
  claveBorrador as claveBorradorCola,
  esEstadoReintentable,
  intentarEnviar,
  reenviarCola,
  registrarAutoReintento,
  programarReintento,
  leerBorrador as leerColaEnvio,
  MENSAJES_ESTADO,
  type AlmacenClaveValor,
  type EnviarOpciones,
  type EstadoEnvio,
} from '@/lib/infraestructura/parte/envio-offline'
import { crearAlmacenParte } from '@/lib/infraestructura/parte/almacen-indexeddb'
import { alEnviarEnSegundoPlano, pedirSyncParte, registrarServiceWorkerParte } from '@/lib/infraestructura/parte/registrar-sync'

const almacenBorradores = crearAlmacenLocalStorage()

export interface ReporteInicialFormProps {
  cue: string
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
  onGuardadoChange?: (guardado: boolean) => void
}

const MENSAJE_ERROR_GUARDADO =
  'No pudimos guardar el parte. La información ingresada se mantiene para que pueda volver a intentar.'

const MENSAJE_GUARDADO =
  'Ya figura en el panel.'

const MENSAJE_FALTA_QUE_PASO =
  'Elija el tipo de situación, el motivo y la severidad para continuar.'

const MENSAJE_FALTA_ALCANCE_AFECTACION =
  'Elija al menos una sección para esta situación.'

const MENSAJE_FALTA_ESTADO_ESTABLECIMIENTO = 'Indique cómo está el edificio.'

export const MENSAJE_BORRADOR_PENDIENTE =
  'Tiene un parte sin enviar. Puede continuar donde lo dejó.'

const PASOS = ['¿Qué pasó?', '¿A quiénes afecta?', 'Clases y edificio', 'Confirmar'] as const

type Paso = 1 | 2 | 3 | 4

function pasosDe(categoria: AfectacionBorrador['categoria']): Paso[] {
  return categoria === 'alumnos' ? [1, 2, 4] : [1, 2, 3, 4]
}

// Borrador de sesión (#32): F5 no debería empezar el asistente de cero. La
// clave va por CUE para que dos establecimientos abiertos en la misma pestaña
// no se pisen, y todo acceso al almacén pasa por el módulo de envío offline,
// que ya tolera que el almacenamiento falte o lance (modo privado, cuota).
function claveBorradorDe(cue: string): string {
  return `parte-nuevo:draft:${cue}`
}

interface BorradorParteNuevo {
  generacion: string
  paso: Paso
  afectacion: AfectacionBorrador
  servicioEstado: '' | 'normal' | 'suspendido'
  estadoEstablecimiento: '' | EstadoEstablecimiento
  asistenciaBrinda: '' | 'si' | 'no'
  modalidadesAsistencia: string[]
  rigeDesde: string
  vigencia?: EleccionVigencia
  // Vestigial (ver esBorradorParteNuevo): sólo se lee por compatibilidad con
  // borradores viejos, ya no se escribe.
  idempotencyKey?: string
}

function esBorradorParteNuevo(valor: unknown): valor is BorradorParteNuevo {
  if (typeof valor !== 'object' || valor === null) return false
  const b = valor as Record<string, unknown>
  if (typeof b.generacion !== 'string' || typeof b.rigeDesde !== 'string') {
    return false
  }
  if (b.vigencia !== undefined && !esEleccionVigencia(b.vigencia)) return false
  // `idempotencyKey` fue un campo vestigial del borrador de este asistente
  // (nunca lo usaba el POST: la idempotencyKey real la decide el motor de
  // envío por tipo+cue, ver lib/infraestructura/parte/envio-offline.ts). Ya
  // no se escribe, pero un borrador viejo puede seguir teniéndolo — se
  // acepta y se ignora, para no invalidar borradores existentes en el
  // dispositivo del director.
  if (b.idempotencyKey !== undefined && typeof b.idempotencyKey !== 'string') return false
  if (b.paso !== 1 && b.paso !== 2 && b.paso !== 3 && b.paso !== 4) return false
  if (b.servicioEstado !== '' && b.servicioEstado !== 'normal' && b.servicioEstado !== 'suspendido') {
    return false
  }
  if (typeof b.estadoEstablecimiento !== 'string') return false
  if (b.asistenciaBrinda !== undefined && b.asistenciaBrinda !== '' && b.asistenciaBrinda !== 'si' && b.asistenciaBrinda !== 'no') return false
  if (b.modalidadesAsistencia !== undefined && (!Array.isArray(b.modalidadesAsistencia) || !b.modalidadesAsistencia.every((m) => m === 'Clase virtual' || m === 'Cuadernillo'))) return false
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
  if (a.justificacionCritica !== undefined && a.justificacionCritica !== '' && !JUSTIFICACIONES_CRITICA.includes(a.justificacionCritica as (typeof JUSTIFICACIONES_CRITICA)[number])) return false
  if (a.justificacionCriticaDetalle !== undefined && typeof a.justificacionCriticaDetalle !== 'string') return false
  if (a.alcanceEstablecimiento !== undefined && a.alcanceEstablecimiento !== '' && a.alcanceEstablecimiento !== 'toda' && a.alcanceEstablecimiento !== 'algunas') return false
  return true
}

const borradorStore = crearBorradorStore(esBorradorParteNuevo)
const leerBorrador = (clave: string) => borradorStore.leer(almacenBorradores, clave)
const guardarBorrador = (clave: string, borrador: BorradorParteNuevo) =>
  borradorStore.guardar(almacenBorradores, clave, borrador)
const limpiarBorrador = (clave: string) => borradorStore.limpiar(almacenBorradores, clave)

// El paso restaurado tiene que ser alcanzable con el botón "atrás" del
// navegador (#31): si la entrada actual es la inicial, empujamos las que
// faltan; si ya es el paso restaurado (recarga con F5 conserva el
// history.state), no hacemos nada para no duplicar entradas.
function sincronizarHistorialTrasRestaurar(pasoActual: Paso, generacion: string, pasos: Paso[]): void {
  const base = leerPasoBaseHistorial(generacion)
  const indiceBase = pasos.indexOf(base as Paso)
  const indiceActual = pasos.indexOf(pasoActual)
  for (let i = Math.max(0, indiceBase + 1); i <= indiceActual; i += 1) {
    empujarPasoEnHistorial(pasos[i], generacion)
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
export function ReporteInicialForm({ cue, turnos, motivos, onGuardadoChange }: ReporteInicialFormProps): JSX.Element {
  const almacenRef = useRef<Promise<AlmacenClaveValor> | null>(null)
  function almacen(): Promise<AlmacenClaveValor> {
    almacenRef.current ??= crearAlmacenParte()
    return almacenRef.current
  }
  const [paso, setPaso] = useState<Paso>(1)
  const [afectacion, setAfectacion] = useState<AfectacionBorrador>(() =>
    crearAfectacionVacia(crypto.randomUUID()),
  )
  const [servicioEstado, setServicioEstado] = useState<'' | 'normal' | 'suspendido'>('')
  const [estadoEstablecimiento, setEstadoEstablecimiento] = useState<'' | EstadoEstablecimiento>('')
  const [confirmarInterrupcionTotal, setConfirmarInterrupcionTotal] = useState(false)
  const [asistenciaBrinda, setAsistenciaBrinda] = useState<'' | 'si' | 'no'>('')
  const [modalidadesAsistencia, setModalidadesAsistencia] = useState<string[]>([])
  const [vigencia, setVigencia] = useState<EleccionVigencia>(VIGENCIA_AHORA)
  const [errorVigencia, setErrorVigencia] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [estadoEnvio, setEstadoEnvio] = useState<EstadoEnvio | null>(null)
  const [estadoAvisoEnvio, setEstadoAvisoEnvio] = useState<'pendiente-envio' | 'error-servidor' | null>(null)
  const [intentosEnvio, setIntentosEnvio] = useState(0)
  const [motivoEnvio, setMotivoEnvio] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<{ movimientoId: string } | null>(null)
  const [borradorPendiente, setBorradorPendiente] = useState<BorradorParteNuevo | null>(null)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const enviandoRef = useRef(false)
  const reintentarRef = useRef<(deliberado?: boolean) => void>(() => {})
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

  function cambiarAfectacion(siguiente: AfectacionBorrador) {
    if (siguiente.categoria !== afectacion.categoria) {
      setServicioEstado('')
      setEstadoEstablecimiento('')
    }
    if (paso === 2 && siguiente.categoria === 'establecimiento' && siguiente.motivo === '') {
      setPaso(1)
      setError('Elija el motivo de la situación del establecimiento.')
    }
    setAfectacion(siguiente)
  }

  function aplicarBorrador(borrador: BorradorParteNuevo): void {
    generacionRef.current = borrador.generacion
    const pasosBorrador = pasosDe(borrador.afectacion.categoria)
    const pasoSolicitado = pasosBorrador.includes(borrador.paso) ? borrador.paso : 4
    const faltaMotivoEstablecimiento =
      pasoSolicitado === 2 &&
      borrador.afectacion.categoria === 'establecimiento' &&
      borrador.afectacion.motivo === ''
    const pasoRestaurado = faltaMotivoEstablecimiento ? 1 : pasoSolicitado
    setPaso(pasoRestaurado)
    setAfectacion({ ...crearAfectacionVacia(borrador.afectacion.clientId), ...borrador.afectacion })
    setError(faltaMotivoEstablecimiento ? 'Elija el motivo de la situación del establecimiento.' : null)
    setServicioEstado(borrador.servicioEstado)
    setEstadoEstablecimiento(borrador.estadoEstablecimiento)
    setAsistenciaBrinda(borrador.asistenciaBrinda ?? '')
    setModalidadesAsistencia(borrador.modalidadesAsistencia ?? [])
    setVigencia(borrador.vigencia ?? VIGENCIA_AHORA)
    sincronizarHistorialTrasRestaurar(pasoRestaurado, borrador.generacion, pasosBorrador)
  }

  // Restaura el borrador SOLO dentro de un efecto, nunca durante el render:
  // leer el almacén en el render produciría un desajuste de hidratación
  // entre servidor y cliente. Sin borrador (o ilegible) no hay nada que
  // restaurar y el asistente arranca limpio en el paso 1.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const borrador = await leerBorrador(claveBorrador)
      if (cancelado || !borrador) return
      if (
        borrador.paso === 1 &&
        !esAfectacionParcial(borrador.afectacion) &&
        !esAfectacionLista(borrador.afectacion)
      ) {
        aplicarBorrador(borrador)
      } else {
        setBorradorPendiente(borrador)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [claveBorrador])

  // Restaura el estado del envío en cola SIEMPRE al montar, haya o no
  // borrador del asistente: sin esto, cerrar y reabrir la app con un envío
  // pendiente dejaba `estadoEnvio` en null y el reintento automático al
  // recuperar la conexión no se disparaba.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const colaPendiente = await leerColaEnvio(await almacen(), 'nuevo', cue)
      if (cancelado || !colaPendiente) return
      setEstadoEnvio(colaPendiente.estado)
      if (colaPendiente.estado === 'pendiente-envio' || colaPendiente.estado === 'error-servidor') setEstadoAvisoEnvio(colaPendiente.estado)
      setMotivoEnvio(colaPendiente.motivoError ?? null)
      setIntentosEnvio(colaPendiente.intentos)
    })()
    return () => {
      cancelado = true
    }
  }, [cue])

  // #31: el botón "atrás" del navegador camina el asistente un paso para
  // atrás en vez de salirse del flujo y tirar todo lo cargado. Sólo se sale
  // del flujo desde el paso 1, donde no quedan entradas empujadas.
  useEffect(() => {
    function alVolverAtras(evento: PopStateEvent): void {
      const estado = evento.state as { partePaso?: number; parteGeneracion?: string } | null
      if (estado && typeof estado.partePaso === 'number') {
        if (estado.parteGeneracion !== generacionRef.current) return
        if (pasosDe(afectacion.categoria).includes(estado.partePaso as Paso)) {
          setPaso(estado.partePaso as Paso)
          setError(null)
        }
        return
      }
      // Entrada inicial (sin estado): un paso atrás sin salir del asistente.
      setPaso((actual) => {
        const pasos = pasosDe(afectacion.categoria)
        return pasos[Math.max(0, pasos.indexOf(actual) - 1)]
      })
      setError(null)
    }
    window.addEventListener('popstate', alVolverAtras)
    return () => window.removeEventListener('popstate', alVolverAtras)
  }, [afectacion.categoria])

  const pasos = pasosDe(afectacion.categoria)
  const indicePaso = pasos.indexOf(paso)

  // Evacuating while only some sections are marked needs an explicit
  // confirmation; the sheet updates the declared scope before continuing.
  const evacuaEstablecimiento = estadoEstablecimiento === 'evacuado' || estadoEstablecimiento === 'centro_evacuados'

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (paso !== 4) return
    if (enviando || enviandoRef.current) return

    enviandoRef.current = true
    setEnviando(true)
    setError(null)
    setMotivoEnvio(null)

    const rigeDesde = resolverVigencia(vigencia)
    if (rigeDesde === null) {
      enviandoRef.current = false
      setEnviando(false)
      setError(null)
      setErrorVigencia(obtenerErrorVigencia(vigencia) ?? MENSAJE_FUERA_DE_RANGO_VIGENCIA)
      return
    }

    const datosEnvio = {
      cue,
      rigeDesde,
      afectacionesNuevas: [
        {
          motivo: afectacion.motivo,
          severidad: afectacion.severidad as Severidad,
          justificacionCritica: afectacion.justificacionCritica || undefined,
          justificacionCriticaDetalle: afectacion.justificacionCriticaDetalle || undefined,
          descripcion: afectacion.descripcion.trim() || undefined,
          secciones: afectacion.secciones,
          alumnos: afectacion.alumnos.length > 0 ? afectacion.alumnos : undefined,
        },
      ],
      afectacionesModificadas: [] as never[],
      afectacionesRetiradas: [] as never[],
      // El alcance de la interrupción ya fue elegido al marcar las secciones
      // afectadas en el paso 2 (ver commit 3a0a8fa): no hay una elección de
      // alcance aparte.
      servicioEducativo:
        afectacion.categoria === 'alumnos' || servicioEstado === ''
          ? undefined
          : {
              estado: servicioEstado,
              alcance: { tipo: 'seccion' as const, secciones: afectacion.secciones },
            },
      estadoEstablecimiento:
        afectacion.categoria === 'alumnos' || estadoEstablecimiento === ''
          ? undefined
          : { estado: estadoEstablecimiento },
      confirmarInterrupcionTotal: confirmarInterrupcionTotal || (evacuaEstablecimiento && afectacion.alcanceEstablecimiento === 'toda'),
      asistenciaPedagogica: asistenciaBrinda === '' ? undefined : { brinda: asistenciaBrinda === 'si', modalidades: asistenciaBrinda === 'si' ? modalidadesAsistencia : [] },
    }

    const resultado = await intentarEnviar(datosEnvio, { ...opcionesEnvio(), almacen: await almacen() })

    if (resultado.ok) {
      const datos = resultado.respuesta as { ok?: boolean; movimientoId?: string; error?: string } | null
      if (datos && datos.ok === true && typeof datos.movimientoId === 'string') {
        alEnviarConExito(datos.movimientoId)
        return
      }
      enviandoRef.current = false
      setEnviando(false)
      setError(datos && typeof datos.error === 'string' ? datos.error : MENSAJE_ERROR_GUARDADO)
      return
    }

    enviandoRef.current = false
    setEnviando(false)
    // 'pendiente-envio' no es un error: queda en cola y se reintenta solo al
    // volver la conexión, sin acción del director. El texto de estado ya lo
    // muestra onCambioEstado; acá no hay nada más que hacer.
  }

  function opcionesEnvio(): Omit<EnviarOpciones<Record<string, unknown>>, 'almacen'> {
    return {
      tipo: 'nuevo',
      cue,
      fetchImpl: (input, init) => fetch(input, init),
      url: '/api/problematicas/parte',
      construirCuerpo: (datos, idempotencyKey) => {
        const vinculo = leerVinculoVerificacion()
        return { ...datos, idempotencyKey, ...(vinculo ? { verificacion: vinculo } : {}) }
      },
      // Hallazgo #2 del gate N1: un 2xx sin `movimientoId` no es un éxito
      // real, aunque el transporte HTTP haya sido 2xx.
      validarExito: (respuesta) => {
        const cuerpo = respuesta as { ok?: boolean; movimientoId?: string } | null
        return !!cuerpo && cuerpo.ok === true && typeof cuerpo.movimientoId === 'string'
      },
      onCambioEstado: (borrador) => {
        setEstadoEnvio(borrador.estado)
        if (borrador.estado === 'pendiente-envio' || borrador.estado === 'error-servidor') setEstadoAvisoEnvio(borrador.estado)
        if (borrador.estado !== 'enviando') setMotivoEnvio(borrador.motivoError ?? null)
        setIntentosEnvio(borrador.intentos)
        if (esEstadoReintentable(borrador.estado)) void pedirSyncParte()
      },
    }
  }

  function alEnviarConExito(movimientoId: string): void {
    void limpiarBorrador(claveBorrador)
    limpiarVinculoVerificacion()
    // indicePaso, no paso - 1: con pasosDe([1,2,4]) para categoría
    // 'alumnos', paso puede ser 4 sin que exista un paso 3 real en el
    // historial — indicePaso ya cuenta correctamente cuántas entradas
    // de historial se empujaron (ver pasos/indicePaso más arriba en el
    // componente).
    colapsarHistorial(indicePaso)
    setGuardado({ movimientoId })
    onGuardadoChange?.(true)
  }

  const alEnviarConExitoRef = useRef(alEnviarConExito)
  useEffect(() => {
    alEnviarConExitoRef.current = alEnviarConExito
  })

  useEffect(() => {
    reintentarRef.current = (deliberado = false) => {
      if (guardado) return
      const errorEnReintento = estadoAvisoEnvio === 'error-servidor' && (estadoEnvio === 'error-servidor' || estadoEnvio === 'enviando')
      if (!esEstadoReintentable(estadoEnvio) && !(deliberado && errorEnReintento)) return
      void (async () => {
        const resultado = await reenviarCola({ ...opcionesEnvio(), almacen: await almacen() }, { deliberado })
        if (resultado?.ok) {
          const datos = resultado.respuesta as { movimientoId: string }
          alEnviarConExito(datos.movimientoId)
        }
      })()
    }
  })
  useEffect(() => {
    void registrarServiceWorkerParte()
  }, [])
  useEffect(() => alEnviarEnSegundoPlano((clave) => {
    if (clave === claveBorradorCola('nuevo', cue)) alEnviarConExitoRef.current('')
  }), [cue])
  useEffect(() => registrarAutoReintento(() => reintentarRef.current()), [])
  useEffect(() => {
    if (guardado || enviando) return
    if (!esEstadoReintentable(estadoEnvio)) return
    if (estadoEnvio === 'pendiente-envio' && typeof navigator !== 'undefined' && navigator.onLine === false) return
    return programarReintento(intentosEnvio, () => reintentarRef.current())
  }, [estadoEnvio, intentosEnvio, guardado, enviando])

  // Persiste el borrador y el paso en cada cambio relevante. El primer
  // run (montaje o "registrar otra") se salta para no reescribir la clave
  // recién limpia con el estado por defecto.
  useEffect(() => {
    if (borradorPendiente) return
    if (omitirEscrituraRef.current) {
      omitirEscrituraRef.current = false
      return
    }
    void guardarBorrador(claveBorrador, {
      generacion: generacionVigente(),
      paso,
      afectacion,
      servicioEstado,
      estadoEstablecimiento,
      asistenciaBrinda,
      modalidadesAsistencia,
      rigeDesde: resolverVigencia(vigencia) ?? new Date().toISOString(),
      vigencia,
    })
  }, [
    claveBorrador,
    paso,
    afectacion,
    servicioEstado,
    estadoEstablecimiento,
    asistenciaBrinda,
    modalidadesAsistencia,
    vigencia,
    borradorPendiente,
  ])

  // Qué le falta al paso actual para poder avanzar. `null` significa que el
  // paso está completo. Se evalúa en el momento de avanzar, no mientras
  // escribe: un error que aparece antes de que el director termine de
  // contestar es una acusación, no una ayuda.
  function faltanteDelPaso(actual: Paso): string | null {
    if (actual === 1) {
      const sugerida = motivos.find((m) => m.nombre === afectacion.motivo)?.severidadSugerida ?? null
      const completo = afectacion.categoria !== '' && afectacion.motivo !== '' && gravedadCompleta(afectacion, sugerida)
      if (
        !completo &&
        afectacion.categoria !== '' &&
        afectacion.motivo !== '' &&
        afectacion.severidad !== '' &&
        requiereJustificacionCritica(afectacion.severidad, sugerida)
      ) {
        return 'Indique por qué la situación es crítica.'
      }
      return completo ? null : MENSAJE_FALTA_QUE_PASO
    }
    if (actual === 2) {
      if (afectacion.categoria === 'establecimiento' && afectacion.alcanceEstablecimiento === '') {
        return MENSAJE_FALTA_ALCANCE_AFECTACION
      }
      if (afectacion.secciones.length === 0) return MENSAJE_FALTA_ALCANCE_AFECTACION
      if (afectacion.categoria === 'alumnos' && vigencia.modo !== 'ahora' && resolverVigencia(vigencia) === null) {
        return MENSAJE_FUERA_DE_RANGO_VIGENCIA
      }
      return null
    }
    if (actual === 3) {
      const faltantes: string[] = []
      if (servicioEstado === '') faltantes.push('Indique si hay clases.')
      if (estadoEstablecimiento === '') faltantes.push(MENSAJE_FALTA_ESTADO_ESTABLECIMIENTO)
      if (asistenciaBrinda === 'si' && modalidadesAsistencia.length === 0) {
        faltantes.push('Elija al menos una modalidad de asistencia pedagógica.')
      }
      const vigenciaInvalida = vigencia.modo !== 'ahora' && resolverVigencia(vigencia) === null
      if (vigenciaInvalida) {
        setErrorVigencia(obtenerErrorVigencia(vigencia) ?? MENSAJE_FUERA_DE_RANGO_VIGENCIA)
      }
      if (faltantes.length > 0) return faltantes.join(' ')
      if (vigenciaInvalida) return MENSAJE_FUERA_DE_RANGO_VIGENCIA
      return null
    }
    return null
  }

  function avanzar() {
    const faltante = faltanteDelPaso(paso)
    if (faltante) {
      if (faltante === MENSAJE_FUERA_DE_RANGO_VIGENCIA) {
        setError(null)
        setErrorVigencia(obtenerErrorVigencia(vigencia) ?? MENSAJE_FUERA_DE_RANGO_VIGENCIA)
      } else setError(faltante)
      return
    }
    setError(null)
    if (indicePaso >= pasos.length - 1) return
    const siguiente = pasos[indicePaso + 1]
    setPaso(siguiente)
    // Una entrada por paso: así "atrás" del navegador camina N → N-1.
    empujarPasoEnHistorial(siguiente, generacionVigente())
  }

  function retroceder() {
    setError(null)
    if (paso <= 1) return
    setPaso(pasos[Math.max(0, indicePaso - 1)])
    // El historial tiene que seguir al asistente: sin este back(), la próxima
    // pulsación de "atrás" del navegador llegaría desfasada a un paso.
    try {
      window.history.back()
    } catch {
      // Sin historial navegable el paso anterior se muestra igual.
    }
  }

  // Deja el asistente listo para un hecho nuevo, no para reintentar el que ya
  // se guardó. La idempotencyKey real la decide el motor de envío por
  // tipo+cue (ver envio-offline.ts) y ya quedó limpia sola: un envío exitoso
  // borra esa cola antes de mostrar la confirmación, así que el próximo
  // "guardar parte" acuña una clave nueva sin que este formulario tenga que
  // gestionar ninguna.
  function registrarOtra() {
    onGuardadoChange?.(false)
    omitirEscrituraRef.current = true
    void limpiarBorrador(claveBorrador)
    enviandoRef.current = false
    setPaso(1)
    setAfectacion(crearAfectacionVacia(crypto.randomUUID()))
    setServicioEstado('')
    setEstadoEstablecimiento('')
    setVigencia(VIGENCIA_AHORA)
    setErrorVigencia(null)
    setEnviando(false)
    setError(null)
    setGuardado(null)
  }

  if (guardado) {
    return (
      <div className="reporte-inicial__confirmacion" role="status">
        <p className="reporte-inicial__confirmacion-mensaje"><CircleCheck aria-hidden="true" size={20} />{MENSAJE_GUARDADO}</p>
        <div className="reporte-inicial__confirmacion-acciones">
          <a className="ui-button ui-button--default" href={`/problematicas/parte?cue=${encodeURIComponent(cue)}`}>
            Volver al panel
          </a>
          <Button type="button" variant="secondary" onClick={registrarOtra}>
            Cargar otra situación
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
      afectacion.categoria === 'alumnos' || servicioEstado === ''
        ? null
        : {
            estado: servicioEstado,
            alcanceTipo: 'seccion',
            turnos: [],
            secciones: afectacion.secciones.length,
          },
    estadoEstablecimiento: afectacion.categoria === 'alumnos' ? '' : estadoEstablecimiento,
    rigeDesde: resolverVigencia(vigencia) ?? new Date().toISOString(),
    ...(afectacion.categoria === 'alumnos' || asistenciaBrinda === ''
      ? {}
      : { asistenciaPedagogica: { brinda: asistenciaBrinda === 'si', modalidades: modalidadesAsistencia } }),
  })

  return (
    <form className="reporte-inicial" onSubmit={manejarEnvio}>
      {borradorPendiente ? (
        <div className="aviso-retoma" role="status">
          <p>{MENSAJE_BORRADOR_PENDIENTE}</p>
          <div className="asistente__acciones">
            <Button type="button" variant="secondary" onClick={() => setConfirmarDescarte(true)}>
              Descartar
            </Button>
            <Button
              type="button"
              onClick={() => {
                aplicarBorrador(borradorPendiente)
                setBorradorPendiente(null)
              }}
            >
              Continuar donde lo dejé
            </Button>
          </div>
        </div>
      ) : (
        <>
      <div className="asistente__progreso">
        <p className="asistente__contador">
          Paso {indicePaso + 1} de {pasos.length}
        </p>
        <ol className="asistente__pasos">
          {pasos.map((numero, i) => (
            <li
              key={numero}
              className={`asistente__paso${numero === paso ? ' asistente__paso--actual' : ''}${
                i < indicePaso ? ' asistente__paso--hecho' : ''
              }`}
              aria-current={numero === paso ? 'step' : undefined}
            >
              <span className="asistente__paso-texto">{PASOS[numero - 1]}</span>
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
            onChange={(siguiente) => {
              cambiarAfectacion(siguiente)
              const sugerida = motivos.find((motivo) => motivo.nombre === siguiente.motivo)?.severidadSugerida ?? null
              if (error === MENSAJE_FALTA_QUE_PASO && siguiente.categoria !== '' && siguiente.motivo !== '' && gravedadCompleta(siguiente, sugerida)) {
                setError(null)
              }
            }}
            disabled={enviando}
          />
        )}

        {paso === 2 && (
          <>
            <CamposAQuienAfecta
              borrador={afectacion}
              idPrefijo="reporte"
              turnos={turnos}
              usaSelectorEstablecimiento
              onChange={cambiarAfectacion}
              disabled={enviando}
            />
            {afectacion.categoria === 'alumnos' && (
              <div className="afectacion-campos__grupo">
                <VigenciaChips
                  value={vigencia}
                  onChange={(valor) => { setVigencia(valor); setErrorVigencia(null) }}
                  label={etiquetaVigencia(afectacion.categoria)}
                  disabled={enviando}
                  error={errorVigencia}
                />
              </div>
            )}
          </>
        )}

        {paso === 3 && (
          <>
            <CamposClasesEdificio
              valor={{ servicioEstado, estadoEstablecimiento }}
              onCambiar={(x) => {
                setServicioEstado(x.servicioEstado)
                setEstadoEstablecimiento(x.estadoEstablecimiento)
              }}
              alcanceParcial={afectacion.alcanceEstablecimiento !== 'toda'}
              onInterrumpirTodaLaEscuela={() => {
                setAfectacion((a) => ({
                  ...a,
                  alcanceEstablecimiento: 'toda',
                  secciones: aplanarSecciones(turnos).map((s) => s.geSectionId),
                }))
                setConfirmarInterrupcionTotal(true)
              }}
              disabled={enviando}
            />

            <fieldset className="afectacion-campos__grupo" disabled={enviando}>
              <legend className="afectacion-campos__legend">¿Se brinda asistencia pedagógica?</legend>
              {(['si', 'no'] as const).map((valor) => (
                <Opcion key={valor} tipo="radio" name="asistencia-pedagogica" checked={asistenciaBrinda === valor} onChange={() => { setAsistenciaBrinda(valor); if (valor === 'no') setModalidadesAsistencia([]) }} label={valor === 'si' ? 'Sí' : 'No'} compacta />
              ))}
              {asistenciaBrinda === 'si' && (['Clase virtual', 'Cuadernillo'] as const).map((modalidad) => (
                <Opcion key={modalidad} tipo="checkbox" checked={modalidadesAsistencia.includes(modalidad)} onChange={(e) => {
                  const marcada = e.currentTarget.checked
                  setModalidadesAsistencia((actuales) => marcada ? [...actuales, modalidad] : actuales.filter((m) => m !== modalidad))
                }} label={modalidad} compacta />
              ))}
            </fieldset>

            <div className="afectacion-campos__grupo">
              <VigenciaChips
                value={vigencia}
                onChange={(valor) => { setVigencia(valor); setErrorVigencia(null) }}
                label={etiquetaVigencia(afectacion.categoria)}
                disabled={enviando}
                error={errorVigencia}
              />
            </div>
          </>
        )}

        {paso === 4 && (
          <div className="asistente__resumen">
            <p className="asistente__resumen-intro">
              Esto es lo que va a quedar informado. Revíselo antes de guardar.
            </p>
            <dl className="asistente__resumen-lista">
              {lineasResumen.map((fila) => (
                <div className="asistente__resumen-fila" key={fila.etiqueta}>
                  <dt>{fila.etiqueta}</dt>
                  <dd>
                    {fila.valor}
                    {fila.severidad ? <> · <EstadoActualSeveridad severidad={fila.severidad as Severidad} prefijo={false} /></> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      {error && (
        <p className="reporte-inicial__error" role="alert">
          {error}
        </p>
      )}

      {estadoEnvio && (estadoEnvio !== 'enviando' || estadoAvisoEnvio !== null) && (
        estadoEnvio === 'pendiente-envio' || estadoEnvio === 'error-servidor' || estadoEnvio === 'enviando'
          ? <EstadoEnvioAviso estado={estadoAvisoEnvio ?? (estadoEnvio === 'enviando' ? 'error-servidor' : estadoEnvio)} mensaje={motivoEnvio ?? undefined} onRetry={() => void reintentarRef.current(true)} disabled={estadoEnvio === 'enviando' && estadoAvisoEnvio !== 'error-servidor'} />
          : <p role="status" aria-live="polite">
              {estadoEnvio === 'error' && motivoEnvio
                ? `${MENSAJES_ESTADO.error}: ${motivoEnvio}`
                : MENSAJES_ESTADO[estadoEnvio]}
            </p>
      )}

      <div className="asistente__acciones">
        {indicePaso > 0 && (
          <Button type="button" variant="secondary" onClick={retroceder}>
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
          <Button key="guardar" type="submit" disabled={enviando || estadoEnvio === 'enviando' || estadoEnvio === 'pendiente-envio' || estadoEnvio === 'error-servidor'}>
            {estadoAvisoEnvio === 'error-servidor' && (estadoEnvio === 'enviando' || estadoEnvio === 'error-servidor') ? 'Reintentando…' : enviando || estadoEnvio === 'enviando' ? 'Guardando…' : estadoEnvio === 'pendiente-envio' ? 'Envío pendiente' : 'Guardar parte'}
          </Button>
        )}
      </div>
        </>
      )}
      <ConfirmSheet
        open={confirmarDescarte}
        titulo="¿Descartar el parte sin enviar?"
        confirmarLabel="Sí, descartar"
        onCancelar={() => setConfirmarDescarte(false)}
        onConfirmar={() => {
          omitirEscrituraRef.current = true
          void limpiarBorrador(claveBorrador)
          setBorradorPendiente(null)
          setConfirmarDescarte(false)
        }}
      >
        <p>Se pierde lo que cargó y no se envía nada.</p>
      </ConfirmSheet>
    </form>
  )
}
