'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { MaterialesTrasReporte } from '@/components/infraestructura/materiales-tras-reporte'
import type { FormEvent, JSX } from 'react'
import {
  CamposAQuienAfecta,
  CamposQuePaso,
  aplanarSecciones,
  crearAfectacionVacia,
  esAfectacionLista,
  esAfectacionParcial,
  totalAlumnosDe,
  AvisosConsistencia,
  type AfectacionBorrador,
} from '@/components/infraestructura/afectacion-campos'
import {
  alcanceDeSecciones,
  evaluarConsistenciaParte,
  severidadSugeridaPorAlcance,
  type AlcanceSecciones,
  type CampoConsistencia,
  type RespuestasConsistencia,
} from '@/lib/infraestructura/consistencia-parte'
import { gravedadCompleta } from '@/components/infraestructura/campo-gravedad'
import { VigenciaChips } from '@/components/infraestructura/vigencia-chips'
import { ETIQUETA_ESTABLECIMIENTO } from '@/components/infraestructura/estado-actual-textos'
import { CamposClasesEdificio } from '@/components/infraestructura/campos-clases-edificio'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { armarResumen } from '@/components/infraestructura/reporte-inicial-resumen'
import { SelectorFotosFormulario } from '@/components/infraestructura/fotos/selector-fotos-formulario'
import { declararFotosFormulario, type FotoPreparada } from '@/lib/infraestructura/fotos/flujo-formulario'
import { limpiarVinculoVerificacion, leerVinculoVerificacion } from './verificacion-vinculo'
import { Button } from '@/components/ui/button'
import { EstadoEnvioAviso } from '@/components/infraestructura/estado-envio-aviso'
import { Opcion } from '@/components/ui/opcion'
import { MultiSelect } from '@/components/ui/multi-select'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import type { Severidad } from '@/lib/infraestructura/validacion'
import { JUSTIFICACIONES_CRITICA } from '@/lib/infraestructura/justificacion-critica'
import { requiereJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { esModalidadAsistenciaPedagogica, MODALIDADES_ASISTENCIA_PEDAGOGICA, type EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'
import {
  errorVigencia as obtenerErrorVigencia,
  etiquetaVigencia,
  esEleccionVigencia,
  resolverVigencia,
  VIGENCIA_AHORA,
  type EleccionVigencia,
} from '@/lib/infraestructura/vigencia-eleccion'
import { MENSAJE_FUERA_DE_RANGO_VIGENCIA, rangoVigencia } from '@/lib/infraestructura/vigencia-rango'
import { VERSION_BORRADOR_ACTUAL, migrarPasoBorrador } from '@/lib/infraestructura/parte/borrador-migracion'
import {
  colapsarHistorial,
  empujarPasoEnHistorial,
  leerPasoBaseHistorial,
} from '@/lib/infraestructura/parte/borrador-historial'
import {
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
import { confirmarFormulario, eliminarBorradorFormulario, guardarBorradorFormulario, guardarClaveEnvioFormulario, leerBorradorFormulario, leerConfirmacionFormulario, limpiarFormularioConfirmado, olvidarClaveEnvioFormulario, type BorradorFormulario } from '@/lib/infraestructura/parte/borrador-formulario'
import { alEnviarEnSegundoPlano, pedirSyncParte, registrarServiceWorkerParte } from '@/lib/infraestructura/parte/registrar-sync'

export interface ReporteInicialFormProps {
  cue: string
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
  onGuardadoChange?: (guardado: boolean) => void
}

const MENSAJE_ERROR_GUARDADO =
  'No pudimos guardar el parte. La información ingresada se mantiene para que pueda volver a intentar.'

const MENSAJE_GUARDADO =
  'Ya figura en el estado actual de su escuela.'

const MENSAJE_FALTA_QUE_PASO =
  'Elija el tipo de situación, el motivo y la gravedad para continuar.'

const MENSAJE_FALTA_ALCANCE_AFECTACION =
  'Elija al menos una sección para esta situación.'

const MENSAJE_FALTA_ESTADO_ESTABLECIMIENTO = 'Indique cómo está el edificio.'
const MENSAJE_FECHA_FUTURA = 'La fecha no puede ser posterior a hoy.'
const MENSAJE_FECHA_ANTIGUA = 'La fecha no puede ser anterior a hace 12 meses.'

export const MENSAJE_BORRADOR_PENDIENTE =
  'Tiene un parte sin enviar.'

function mensajeErrorVigencia(eleccion: EleccionVigencia): string | null {
  const mensaje = obtenerErrorVigencia(eleccion)
  if (!mensaje || eleccion.modo !== 'otro' || !eleccion.fecha || !eleccion.hora) return mensaje

  const [año, mes, dia] = eleccion.fecha.split('-').map(Number)
  const [hora, minuto] = eleccion.hora.split(':').map(Number)
  const momento = new Date(año, mes - 1, dia, hora, minuto)
  const { min, max } = rangoVigencia()
  if (momento.getTime() > max.getTime()) return MENSAJE_FECHA_FUTURA
  if (momento.getTime() < min.getTime()) return MENSAJE_FECHA_ANTIGUA
  return mensaje
}

const PASOS = ['¿Qué pasó?', '¿A quiénes afecta?', 'Clases y edificio', '¿Desde cuándo?', 'Confirmar'] as const

type Paso = 1 | 2 | 3 | 4 | 5

// Campos de consistencia que bloquean "Continuar" en cada paso del asistente.
const CAMPOS_CONSISTENCIA_POR_PASO: Partial<Record<Paso, CampoConsistencia[]>> = {
  1: ['motivo', 'severidad', 'justificacionCritica'],
  2: ['alcance', 'descripcion'],
  3: ['edificio', 'clases', 'asistencia'],
}

const MODALIDADES_ASISTENCIA = MODALIDADES_ASISTENCIA_PEDAGOGICA.map((m) => ({ value: m, label: m }))

// Respuestas del asistente en la forma que lee el módulo de consistencia.
function respuestasDeConsistencia(datos: {
  afectacion: AfectacionBorrador
  motivos: MotivoRow[]
  servicioEstado: '' | 'normal' | 'suspendido'
  estadoEstablecimiento: '' | EstadoEstablecimiento
  asistenciaBrinda: '' | 'si' | 'no'
  vigencia: EleccionVigencia
}): RespuestasConsistencia {
  const { afectacion, motivos, servicioEstado, estadoEstablecimiento, asistenciaBrinda, vigencia } = datos
  const alcance: AlcanceSecciones | null =
    afectacion.alcanceEstablecimiento === 'toda'
      ? { tipo: 'toda' }
      : afectacion.secciones.length > 0
        ? { tipo: 'algunas', secciones: afectacion.secciones.length }
        : null
  return {
    categoria: afectacion.categoria || null,
    motivoId: motivos.find((m) => m.nombre === afectacion.motivo)?.id ?? null,
    severidad: (afectacion.severidad || null) as Severidad | null,
    justificacionCritica: afectacion.justificacionCritica || null,
    descripcion: afectacion.descripcion.trim(),
    alcance,
    clases: servicioEstado || null,
    edificio: estadoEstablecimiento || null,
    asistenciaBrinda: asistenciaBrinda === '' ? null : asistenciaBrinda === 'si',
    vigencia,
  }
}

const PASO_DESDE_CUANDO: Paso = 4
const PASO_CONFIRMAR: Paso = 5

// Alumnos no pregunta por clases ni edificio, pero sí por la asistencia
// pedagógica: su paso 3 muestra sólo esa pregunta.
function pasosDe(_categoria: AfectacionBorrador['categoria']): Paso[] {
  return [1, 2, 3, 4, 5]
}

function tituloPaso(paso: Paso, categoria: AfectacionBorrador['categoria']): string {
  return paso === 3 && categoria === 'alumnos' ? 'Asistencia pedagógica' : PASOS[paso - 1]
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
  referenciasFotos?: string[]
  // Ausente en los borradores anteriores a la división del paso 3: ver
  // migrarPasoBorrador.
  version?: number
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
  if (b.referenciasFotos !== undefined && (!Array.isArray(b.referenciasFotos) || !b.referenciasFotos.every((id) => typeof id === 'string'))) return false
  if (b.vigencia !== undefined && !esEleccionVigencia(b.vigencia)) return false
  // `idempotencyKey` fue un campo vestigial del borrador de este asistente
  // (nunca lo usaba el POST: la idempotencyKey real la decide el motor de
  // envío por tipo+cue, ver lib/infraestructura/parte/envio-offline.ts). Ya
  // no se escribe, pero un borrador viejo puede seguir teniéndolo — se
  // acepta y se ignora, para no invalidar borradores existentes en el
  // dispositivo del director.
  if (b.idempotencyKey !== undefined && typeof b.idempotencyKey !== 'string') return false
  if (b.version !== undefined && typeof b.version !== 'number') return false
  if (b.paso !== 1 && b.paso !== 2 && b.paso !== 3 && b.paso !== 4 && b.paso !== 5) return false
  // Un borrador sin versión nunca tuvo el paso 5.
  if (b.paso === 5 && (b.version ?? 1) < VERSION_BORRADOR_ACTUAL) return false
  if (b.servicioEstado !== '' && b.servicioEstado !== 'normal' && b.servicioEstado !== 'suspendido') {
    return false
  }
  if (typeof b.estadoEstablecimiento !== 'string') return false
  if (b.asistenciaBrinda !== undefined && b.asistenciaBrinda !== '' && b.asistenciaBrinda !== 'si' && b.asistenciaBrinda !== 'no') return false
  if (b.modalidadesAsistencia !== undefined && (!Array.isArray(b.modalidadesAsistencia) || !b.modalidadesAsistencia.every(esModalidadAsistenciaPedagogica))) return false
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

const DRAFT_ID_PREFIX = 'parte-inicial:'

// El paso restaurado tiene que ser alcanzable con el botón "atrás" del
// navegador (#31): si la entrada actual es la inicial, empujamos las que
// faltan; si ya es el paso restaurado (recarga con F5 conserva el
// history.state), no hacemos nada para no duplicar entradas.
function sincronizarHistorialTrasRestaurar(
  pasoActual: Paso,
  generacion: string,
  pasos: Paso[],
  versionBorrador: number | undefined,
): void {
  // Las entradas del historial de una sesión anterior a la división del paso 3
  // guardan la numeración vieja.
  const base = migrarPasoBorrador(leerPasoBaseHistorial(generacion), versionBorrador)
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
  const [estadoAvisoEnvio, setEstadoAvisoEnvio] = useState<'pendiente-envio' | 'error-servidor' | 'sesion-vencida' | null>(null)
  const [intentosEnvio, setIntentosEnvio] = useState(0)
  const [motivoEnvio, setMotivoEnvio] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<{ movimientoId: string } | null>(null)
  const fotosPreparadasRef = useRef<readonly FotoPreparada[]>([])
  const [cantidadFotos, setCantidadFotos] = useState(0)
  const [fotosHabilitadas, setFotosHabilitadas] = useState(false)
  const movimientoFotosConfirmadoRef = useRef<string | null>(null)
  const claveEvidenciaRef = useRef(crypto.randomUUID())
  const [borradorPendiente, setBorradorPendiente] = useState<BorradorParteNuevo | null>(null)
  const [restauracionCompleta, setRestauracionCompleta] = useState(false)
  const [avisoAlmacen, setAvisoAlmacen] = useState<string | null>(null)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const enviandoRef = useRef(false)
  const reintentarRef = useRef<(deliberado?: boolean) => void>(() => {})
  // Identidad de las entradas de historial de ESTE asistente: un popstate de
  // una sesión ya reiniciada no debe revivir sus pasos.
  const generacionRef = useRef<string | null>(null)
  const generacionAlmacenRef = useRef(1)
  const borradorCompartidoRef = useRef<BorradorFormulario<BorradorParteNuevo> | null>(null)
  const interaccionRef = useRef(false)
  const borradorResueltoRef = useRef(false)
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
    const pasoGuardado = migrarPasoBorrador(borrador.paso, borrador.version) as Paso
    const pasoSolicitado = pasosBorrador.includes(pasoGuardado) ? pasoGuardado : PASO_CONFIRMAR
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
    sincronizarHistorialTrasRestaurar(pasoRestaurado, borrador.generacion, pasosBorrador, borrador.version)
  }

  // Restaura el borrador SOLO dentro de un efecto, nunca durante el render:
  // leer el almacén en el render produciría un desajuste de hidratación
  // entre servidor y cliente. Sin borrador (o ilegible) no hay nada que
  // restaurar y el asistente arranca limpio en el paso 1.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const confirmacion = await leerConfirmacionFormulario(`${DRAFT_ID_PREFIX}${cue}`)
        if (cancelado) return
        if (confirmacion) {
          setGuardado({ movimientoId: confirmacion.movimientoId })
          onGuardadoChange?.(true)
          setRestauracionCompleta(true)
          void limpiarFormularioConfirmado(`${DRAFT_ID_PREFIX}${cue}`, claveBorrador)
          return
        }
        // Read and migrate the legacy copy through the shared store before
        // exposing the resume prompt. Showing the prompt from localStorage
        // first allowed a quick click to race the IndexedDB migration below.
        const guardado = await leerBorradorFormulario(
          `${DRAFT_ID_PREFIX}${cue}`,
          claveBorrador,
          esBorradorParteNuevo,
        )
        if (cancelado) return
        if (guardado) {
          borradorCompartidoRef.current = guardado
          generacionAlmacenRef.current = guardado.registro.generacion
          const borrador = guardado.datos
          if (!borradorResueltoRef.current && (
            borrador.paso === 1 &&
            !esAfectacionParcial(borrador.afectacion) &&
            !esAfectacionLista(borrador.afectacion)
          )) {
            aplicarBorrador(borrador)
          } else if (!borradorResueltoRef.current) {
            setBorradorPendiente(borrador)
          }
        }
      } catch (error) {
        if (!cancelado) {
          setAvisoAlmacen(error instanceof Error ? error.message : 'No se pudo acceder al almacenamiento local. Puede enviar sus respuestas.')
          try {
            const anterior: unknown = JSON.parse(localStorage.getItem(claveBorrador) ?? 'null')
            if (esBorradorParteNuevo(anterior) && !borradorResueltoRef.current) {
              if (anterior.paso === 1 && !esAfectacionParcial(anterior.afectacion) && !esAfectacionLista(anterior.afectacion)) aplicarBorrador(anterior)
              else setBorradorPendiente(anterior)
            }
          } catch {
            // The legacy copy stays available; the storage notice explains that it was not recovered.
          }
        }
      } finally {
        if (!cancelado) setRestauracionCompleta(true)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [claveBorrador, cue, onGuardadoChange])

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
      if (colaPendiente.estado === 'pendiente-envio' || colaPendiente.estado === 'error-servidor' || colaPendiente.estado === 'sesion-vencida') setEstadoAvisoEnvio(colaPendiente.estado)
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
    if (paso !== PASO_CONFIRMAR) return
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
      setErrorVigencia(mensajeErrorVigencia(vigencia) ?? MENSAJE_FUERA_DE_RANGO_VIGENCIA)
      return
    }

    // El servidor rechaza una justificación que no corresponde: sólo se envía si
    // la sugerida efectiva (con el alcance elegido) deja Crítica sin respaldo.
    const justificacionRequerida = requiereJustificacionCritica(afectacion.severidad as Severidad, sugeridaDeAfectacion(afectacion))
    const datosEnvio = {
      cue,
      rigeDesde,
      afectacionesNuevas: [
        {
          motivo: afectacion.motivo,
          severidad: afectacion.severidad as Severidad,
          justificacionCritica: justificacionRequerida ? afectacion.justificacionCritica || undefined : undefined,
          justificacionCriticaDetalle: justificacionRequerida ? afectacion.justificacionCriticaDetalle || undefined : undefined,
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

    let exito = false
    try {
      const resultado = await intentarEnviar(datosEnvio, { ...opcionesEnvio(), almacen: await almacen() })
      if (resultado.ok) {
        const datos = resultado.respuesta as { ok?: boolean; movimientoId?: string; error?: string } | null
        if (datos && datos.ok === true && typeof datos.movimientoId === 'string') {
          exito = true
          alEnviarConExito(datos.movimientoId)
          return
        }
        setError(datos && typeof datos.error === 'string' ? datos.error : MENSAJE_ERROR_GUARDADO)
      }
      // 'pendiente-envio' no es un error: queda en cola y se reintenta solo al
      // volver la conexión, sin acción del director. El texto de estado ya lo
      // muestra onCambioEstado; acá no hay nada más que hacer.
    } catch {
      // Local storage or lock failure: never leave the button on "Guardando…".
      setEstadoEnvio((actual) => (actual === 'enviando' ? null : actual))
      setError(MENSAJE_ERROR_GUARDADO)
    } finally {
      if (!exito) {
        enviandoRef.current = false
        setEnviando(false)
      }
    }
  }

  function opcionesEnvio(): Omit<EnviarOpciones<Record<string, unknown>>, 'almacen'> {
    return {
      tipo: 'nuevo',
      cue,
      fetchImpl: async (input, init) => {
        const idempotencyKey = new Headers(init?.headers).get('Idempotency-Key')
        if (idempotencyKey) await guardarClaveEnvioFormulario(`${DRAFT_ID_PREFIX}${cue}`, idempotencyKey).catch(() => {})
        return fetch(input, init)
      },
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
        if (borrador.estado === 'pendiente-envio' || borrador.estado === 'error-servidor' || borrador.estado === 'sesion-vencida') setEstadoAvisoEnvio(borrador.estado)
        else if (borrador.estado !== 'enviando') setEstadoAvisoEnvio(null)
        if (borrador.estado !== 'enviando') setMotivoEnvio(borrador.motivoError ?? null)
        setIntentosEnvio(borrador.intentos)
        if (esEstadoReintentable(borrador.estado)) void pedirSyncParte()
      },
    }
  }

  function alEnviarConExito(movimientoId: string): void {
    movimientoFotosConfirmadoRef.current = movimientoId
    void confirmarFormulario(`${DRAFT_ID_PREFIX}${cue}`, movimientoId).catch(() => {})
    vincularFotosPreparadas(movimientoId)
    const borradorActual = borradorCompartidoRef.current
    if (borradorActual) {
      void eliminarBorradorFormulario(borradorActual).then(() => {
        borradorCompartidoRef.current = null
        localStorage.removeItem(claveBorrador)
      }).catch((error: unknown) => {
        setAvisoAlmacen(error instanceof Error ? error.message : MENSAJE_ERROR_GUARDADO)
      })
    }
    limpiarVinculoVerificacion()
    // indicePaso cuenta cuántas entradas de historial se empujaron (ver
    // pasos/indicePaso más arriba en el componente).
    colapsarHistorial(indicePaso)
    // The queue entry is gone after a successful send: drop its last known
    // state too, or the next report starts with the button stuck on "Guardando…".
    enviandoRef.current = false
    setEnviando(false)
    setEstadoEnvio(null)
    setEstadoAvisoEnvio(null)
    setMotivoEnvio(null)
    setIntentosEnvio(0)
    setGuardado({ movimientoId })
    onGuardadoChange?.(true)
  }

  function vincularFotosPreparadas(movimientoId: string): void {
    const fotos = fotosPreparadasRef.current
    if (fotos.length === 0) return
    void declararFotosFormulario({
      draftId: `${DRAFT_ID_PREFIX}${cue}`,
      movimientoBaseId: movimientoId,
      idempotencyKey: claveEvidenciaRef.current,
      fotos,
    }).catch((error: unknown) => {
      setAvisoAlmacen(error instanceof Error ? error.message : 'Las fotos quedaron guardadas en este dispositivo y se pueden reintentar.')
    })
  }

  const alEnviarConExitoRef = useRef(alEnviarConExito)
  useEffect(() => {
    alEnviarConExitoRef.current = alEnviarConExito
  })

  // Layout effect, not a passive one: the alert with "Reintentar ahora" is already on screen once
  // this render commits, and a click can land before passive effects flush. Refreshing the ref at
  // commit keeps the handler in sync with what the user sees, so that click is never dropped.
  useLayoutEffect(() => {
    reintentarRef.current = (deliberado = false) => {
      if (guardado) return
      const errorEnReintento = estadoAvisoEnvio === 'error-servidor' && (estadoEnvio === 'error-servidor' || estadoEnvio === 'enviando')
      const sesionVencidaEnReintento = estadoAvisoEnvio === 'sesion-vencida' && (estadoEnvio === 'sesion-vencida' || estadoEnvio === 'enviando')
      if (!esEstadoReintentable(estadoEnvio) && !(deliberado && (errorEnReintento || sesionVencidaEnReintento))) return
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
    if (!errorVigencia && !error) return
    const cuerpo = document.querySelector<HTMLElement>('.asistente__cuerpo')
    const formulario = cuerpo?.closest('form')
    let campo: HTMLInputElement | null | undefined
    if (errorVigencia) {
      campo = cuerpo?.querySelector<HTMLInputElement>(vigencia.modo === 'otro' ? 'input[type="date"]' : 'input[type="time"]')
    } else {
      const grupos = cuerpo?.querySelectorAll<HTMLFieldSetElement>('fieldset:not(.vigencia-chips)') ?? []
      const primerGrupoIncompleto = Array.from(grupos).find((grupo) => !grupo.querySelector('input[type="radio"]:checked'))
      campo = primerGrupoIncompleto?.querySelector<HTMLInputElement>('input[type="radio"]')
    }
    const mensaje = formulario?.querySelector<HTMLElement>(errorVigencia ? '.vigencia-field__error' : '.reporte-inicial__error')
    campo?.focus({ preventScroll: true })
    mensaje?.scrollIntoView?.({ block: window.matchMedia?.('(max-width: 480px)').matches ? 'end' : 'nearest' })
  }, [error, errorVigencia, vigencia.modo])
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
    if (!restauracionCompleta) return
    if (borradorPendiente) return
    if (omitirEscrituraRef.current && !interaccionRef.current) {
      omitirEscrituraRef.current = false
      return
    }
    omitirEscrituraRef.current = false
    const datos: BorradorParteNuevo = {
      generacion: generacionVigente(),
      referenciasFotos: borradorCompartidoRef.current?.datos.referenciasFotos ?? [],
      version: VERSION_BORRADOR_ACTUAL,
      paso,
      afectacion,
      servicioEstado,
      estadoEstablecimiento,
      asistenciaBrinda,
      modalidadesAsistencia,
      rigeDesde: resolverVigencia(vigencia) ?? new Date().toISOString(),
      vigencia,
    }
    const actual = borradorCompartidoRef.current ?? {
      registro: {
        draftId: `${DRAFT_ID_PREFIX}${cue}`,
        generacion: generacionAlmacenRef.current,
        version: 1 as const,
        datos,
        actualizadoEn: new Date().toISOString(),
      },
      datos,
    }
    void guardarBorradorFormulario(actual, datos).then((guardado) => {
      borradorCompartidoRef.current = guardado
      setAvisoAlmacen(null)
      try { localStorage.setItem(claveBorrador, JSON.stringify(datos)) } catch { /* IndexedDB sigue siendo el almacenamiento principal. */ }
    }).catch((error: unknown) => {
      setAvisoAlmacen(error instanceof Error ? error.message : 'No se pudo guardar el borrador local. Puede enviar sus respuestas.')
    })
  }, [
    restauracionCompleta,
    cue,
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

  const respuestasConsistencia = respuestasDeConsistencia({
    afectacion,
    motivos,
    servicioEstado,
    estadoEstablecimiento,
    asistenciaBrinda,
    vigencia,
  })
  const consistencia = evaluarConsistenciaParte(respuestasConsistencia)

  // Gravedad sugerida con el alcance real de las secciones elegidas: la misma que
  // usa el servidor para decidir si la justificación de Crítica hace falta.
  function sugeridaDeAfectacion(a: AfectacionBorrador): Severidad | null {
    const motivoId = motivos.find((m) => m.nombre === a.motivo)?.id ?? null
    return severidadSugeridaPorAlcance(motivoId, alcanceDeSecciones(a.secciones, aplanarSecciones(turnos).map((s) => s.geSectionId)))
  }

  // Qué le falta al paso actual para poder avanzar. `null` significa que el
  // paso está completo. Se evalúa en el momento de avanzar, no mientras
  // escribe: un error que aparece antes de que el director termine de
  // contestar es una acusación, no una ayuda.
  function faltanteDelPaso(actual: Paso): string | null {
    const bloqueosDelPaso = consistencia.bloqueos
      .filter((regla) => (CAMPOS_CONSISTENCIA_POR_PASO[actual] ?? []).includes(regla.campo))
      .map((regla) => regla.mensaje)
    if (bloqueosDelPaso.length > 0) return bloqueosDelPaso.join(' ')
    if (actual === 1) {
      const sugerida = sugeridaDeAfectacion(afectacion)
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
      return null
    }
    if (actual === 3) {
      const faltantes: string[] = []
      if (afectacion.categoria !== 'alumnos') {
        if (servicioEstado === '') faltantes.push('Indique si hay clases.')
        if (estadoEstablecimiento === '') faltantes.push(MENSAJE_FALTA_ESTADO_ESTABLECIMIENTO)
      }
      if (asistenciaBrinda === 'si' && modalidadesAsistencia.length === 0) {
        faltantes.push('Elija al menos una modalidad de asistencia pedagógica.')
      }
      return faltantes.length > 0 ? faltantes.join(' ') : null
    }
    if (actual === PASO_DESDE_CUANDO) {
      if (vigencia.modo !== 'ahora' && resolverVigencia(vigencia) === null) {
        setErrorVigencia(mensajeErrorVigencia(vigencia) ?? MENSAJE_FUERA_DE_RANGO_VIGENCIA)
        return MENSAJE_FUERA_DE_RANGO_VIGENCIA
      }
    }
    return null
  }

  function avanzar() {
    const faltante = faltanteDelPaso(paso)
    if (faltante) {
      if (faltante === MENSAJE_FUERA_DE_RANGO_VIGENCIA) {
        setError(null)
        setErrorVigencia(mensajeErrorVigencia(vigencia) ?? MENSAJE_FUERA_DE_RANGO_VIGENCIA)
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
    interaccionRef.current = false
    borradorResueltoRef.current = true
    const anterior = borradorCompartidoRef.current
    if (anterior) void eliminarBorradorFormulario(anterior).catch(() => {})
    void olvidarClaveEnvioFormulario(`${DRAFT_ID_PREFIX}${cue}`).catch(() => {})
    localStorage.removeItem(claveBorrador)
    generacionAlmacenRef.current += 1
    borradorCompartidoRef.current = null
    generacionRef.current = crypto.randomUUID()
    enviandoRef.current = false
    setPaso(1)
    setAfectacion(crearAfectacionVacia(crypto.randomUUID()))
    setServicioEstado('')
    setEstadoEstablecimiento('')
    setConfirmarInterrupcionTotal(false)
    setAsistenciaBrinda('')
    setModalidadesAsistencia([])
    setVigencia(VIGENCIA_AHORA)
    setErrorVigencia(null)
    setEnviando(false)
    setError(null)
    setGuardado(null)
  }

  if (guardado) {
    return (
      <div className="reporte-inicial__confirmacion" role="status">
        <div className="reporte-inicial__confirmacion-mensaje">
          <CircleCheck aria-hidden="true" size={20} />
          <div><h2>Situación guardada</h2><p>{MENSAJE_GUARDADO}</p></div>
        </div>
        <div className="reporte-inicial__confirmacion-acciones">
          <a className="ui-button ui-button--default" href={`/problematicas/parte?cue=${encodeURIComponent(cue)}`}>
            Ver estado actual
          </a>
          <Button type="button" variant="secondary" onClick={registrarOtra}>
            Cargar otra situación
          </Button>
        </div>
        <MaterialesTrasReporte />
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
    ...(asistenciaBrinda === ''
      ? {}
      : { asistenciaPedagogica: { brinda: asistenciaBrinda === 'si', modalidades: modalidadesAsistencia } }),
    fotosAdjuntas: cantidadFotos,
  })

  return (
    <form
      className="reporte-inicial reporte-inicial--asistente"
      onSubmit={manejarEnvio}
      onChangeCapture={() => { interaccionRef.current = true }}
    >
      {avisoAlmacen && <p role="status">{avisoAlmacen} Puede continuar y enviar las respuestas.</p>}
      <ConfirmSheet
        open={borradorPendiente !== null && !confirmarDescarte}
        titulo={MENSAJE_BORRADOR_PENDIENTE}
        confirmarLabel="Continuar donde lo dejé"
        cancelarLabel="Descartar"
        onConfirmar={() => {
          if (!borradorPendiente) return
          borradorResueltoRef.current = true
          aplicarBorrador(borradorPendiente)
          setBorradorPendiente(null)
        }}
        onCancelar={() => setConfirmarDescarte(true)}
        onCerrar={() => {
          if (!borradorPendiente || confirmarDescarte) return
          borradorResueltoRef.current = true
          aplicarBorrador(borradorPendiente)
          setBorradorPendiente(null)
        }}
      >
        <p>Puede seguir donde lo dejó o descartarlo y empezar de nuevo.</p>
      </ConfirmSheet>
      {borradorPendiente ? null : (
        <>
      <h3 id="asistente-paso-titulo" className="asistente__titulo asistente__titulo--paso">
        {tituloPaso(paso, afectacion.categoria)}
      </h3>
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
              <span className="asistente__paso-texto">{tituloPaso(numero, afectacion.categoria)}</span>
            </li>
          ))}
        </ol>
      </div>

      <section className="asistente__cuerpo" aria-labelledby="asistente-paso-titulo">
        {paso === 1 && (
          <CamposQuePaso
            borrador={afectacion}
            idPrefijo="reporte"
            motivos={motivos}
            otrasAfectaciones={[]}
            avisos={consistencia.advertencias}
            onChange={(siguiente) => {
              cambiarAfectacion(siguiente)
              const sugerida = sugeridaDeAfectacion(siguiente)
              if (error === MENSAJE_FALTA_QUE_PASO && siguiente.categoria !== '' && siguiente.motivo !== '' && gravedadCompleta(siguiente, sugerida)) {
                setError(null)
              }
            }}
            disabled={enviando}
          />
        )}

        {/*
          Siempre montado (sólo oculto fuera del paso 1) para que las fotos
          elegidas sobrevivan a cambiar de paso. Las fotos siguen siendo
          opcionales: la nota de Crítica es una recomendación.
        */}
        <div hidden={paso !== 1}>
          {fotosHabilitadas && afectacion.severidad === 'Crítica' ? (
            <p className="aviso-badge" role="note">
              <span className="aviso-badge__sello">Recomendado</span>
              <span className="aviso-badge__texto">Recomendamos adjuntar una foto: ayuda a evaluar situaciones críticas.</span>
            </p>
          ) : null}
          <SelectorFotosFormulario
            draftId={`${DRAFT_ID_PREFIX}${cue}`}
            onCountChange={setCantidadFotos}
            onHabilitadaChange={setFotosHabilitadas}
            onPreparadasChange={(fotos) => {
              fotosPreparadasRef.current = fotos
              if (movimientoFotosConfirmadoRef.current) vincularFotosPreparadas(movimientoFotosConfirmadoRef.current)
            }}
          />
        </div>

        {paso === 2 && (
          <CamposAQuienAfecta
            borrador={afectacion}
            idPrefijo="reporte"
            turnos={turnos}
            motivos={motivos}
            usaSelectorEstablecimiento
            ocultarPreguntaAlcance
            descripcionObligatoria={evaluarConsistenciaParte({ ...respuestasConsistencia, descripcion: '' }).bloqueos.some((r) => r.campo === 'descripcion')}
            avisos={consistencia.advertencias}
            onChange={cambiarAfectacion}
            disabled={enviando}
          />
        )}

        {paso === 3 && (
          <>
            {afectacion.categoria !== 'alumnos' && (
            <CamposClasesEdificio
              valor={{ servicioEstado, estadoEstablecimiento }}
              onCambiar={(x) => {
                setServicioEstado(x.servicioEstado)
                setEstadoEstablecimiento(x.estadoEstablecimiento)
              }}
              alcanceParcial={afectacion.alcanceEstablecimiento !== 'toda'}
              respuestas={respuestasConsistencia}
              advertencias={consistencia.advertencias}
              alcanceAlgunas={afectacion.alcanceEstablecimiento === 'algunas'}
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
            )}

            <fieldset className="afectacion-campos__grupo" disabled={enviando}>
              <legend className="afectacion-campos__legend">¿Se brinda asistencia pedagógica?</legend>
              {(['si', 'no'] as const).map((valor) => (
                <Opcion key={valor} tipo="radio" name="asistencia-pedagogica" checked={asistenciaBrinda === valor} onChange={() => { setAsistenciaBrinda(valor); if (valor === 'no') setModalidadesAsistencia([]) }} label={valor === 'si' ? 'Sí' : 'No'} compacta />
              ))}
              {asistenciaBrinda === 'si' && (
                <div className="afectacion-campos__anidado">
                  <p className="afectacion-campos__subtitulo">¿De qué tipo?</p>
                  <MultiSelect<string>
                    value={modalidadesAsistencia}
                    onChange={setModalidadesAsistencia}
                    options={MODALIDADES_ASISTENCIA}
                    placeholder="Seleccione una o más opciones"
                    ariaLabel="¿De qué tipo?"
                  />
                </div>
              )}
              <AvisosConsistencia reglas={consistencia.advertencias} campos={['asistencia']} />
            </fieldset>
          </>
        )}

        {paso === PASO_DESDE_CUANDO && (
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

        {paso === PASO_CONFIRMAR && (
          <>
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
          </>
        )}
      </section>
      {error && (
        <p className="reporte-inicial__error" role="alert">
          {error}
        </p>
      )}

      {estadoEnvio && (estadoEnvio !== 'enviando' || estadoAvisoEnvio !== null) && (
        estadoEnvio === 'pendiente-envio' || estadoEnvio === 'error-servidor' || estadoEnvio === 'sesion-vencida' || estadoEnvio === 'enviando'
          ? <EstadoEnvioAviso estado={estadoAvisoEnvio ?? (estadoEnvio === 'enviando' ? 'error-servidor' : estadoEnvio)} mensaje={motivoEnvio ?? undefined} onRetry={() => void reintentarRef.current(true)} disabled={estadoEnvio === 'enviando' && estadoAvisoEnvio !== 'error-servidor'} />
          : <p role="status" aria-live="polite">
              {estadoEnvio === 'error' && motivoEnvio
                ? `${MENSAJES_ESTADO.error}: ${motivoEnvio}`
                : MENSAJES_ESTADO[estadoEnvio]}
            </p>
      )}

      <div className="asistente__acciones asistente__acciones--pegada">
        {indicePaso > 0 && (
          <Button type="button" variant="secondary" onClick={retroceder}>
            Volver
          </Button>
        )}
        {/*
          Las dos `key` no son decorativas: sin ellas React reconcilia ambos
          botones como el MISMO nodo del DOM y sólo le cambia el `type`. El
          click que avanza al último paso corre el handler, React vuelve a
          renderizar con type="submit" y recién entonces el navegador ejecuta
          la acción por defecto del click — que ahora es enviar el formulario.
          Resultado: un solo toque en "Continuar" guardaba el reporte sin que
          el director llegara a ver el resumen. Con `key` distintas el botón
          anterior se desmonta y no queda ninguna acción por defecto que
          ejecutar.
        */}
        {paso < PASO_CONFIRMAR ? (
          <Button key="continuar" type="button" onClick={avanzar} disabled={enviando}>
            Continuar
          </Button>
        ) : (
          // Habilitado siempre: llegar a Confirmar ya exige los datos
          // obligatorios, así que no queda ningún botón gris sin explicación.
          <Button key="guardar" type="submit" disabled={enviando || estadoEnvio === 'enviando' || estadoEnvio === 'pendiente-envio' || estadoEnvio === 'error-servidor'}>
            {estadoAvisoEnvio === 'error-servidor' && (estadoEnvio === 'enviando' || estadoEnvio === 'error-servidor') ? 'Reintentando…' : enviando || estadoEnvio === 'enviando' ? 'Guardando…' : estadoEnvio === 'pendiente-envio' ? 'Envío pendiente' : 'Guardar situación'}
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
          const actual = borradorCompartidoRef.current
          void (async () => {
            try {
              if (actual && !(await eliminarBorradorFormulario(actual))) {
                setAvisoAlmacen('El borrador cambió en otra pestaña y se conservó. Puede enviar las respuestas.')
                setConfirmarDescarte(false)
                return
              }
              localStorage.removeItem(claveBorrador)
              borradorCompartidoRef.current = null
              interaccionRef.current = false
              borradorResueltoRef.current = true
              generacionAlmacenRef.current += 1
              generacionRef.current = crypto.randomUUID()
              omitirEscrituraRef.current = true
              setBorradorPendiente(null)
              setConfirmarDescarte(false)
            } catch (error) {
              setAvisoAlmacen(error instanceof Error ? error.message : 'No se pudo descartar el borrador local. Puede enviar las respuestas.')
            }
          })()
        }}
      >
        <p>Se pierde lo que cargó y no se envía nada.</p>
      </ConfirmSheet>
    </form>
  )
}
