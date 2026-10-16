'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EstadoEnvioAviso } from '@/components/infraestructura/estado-envio-aviso'
import { Opcion } from '@/components/ui/opcion'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { EntradaActualizar } from '@/components/infraestructura/actualizar/entrada-actualizar'
import { RevisarSituacion } from '@/components/infraestructura/actualizar/revisar-situacion'
import { AlgoNuevo } from '@/components/infraestructura/actualizar/algo-nuevo'
import { MENSAJE_ACCESO_VENCIDO, MENSAJE_ERROR_LECTURA, MENSAJE_SIN_CORTE, MENSAJE_SIN_SITUACION, type EstadoActualRespuesta } from '@/components/infraestructura/estado-actual-textos'
import { formatearMomento, resumirAlcance } from '@/components/infraestructura/estado-actual-textos'
import type { MovimientoHistorial } from '@/components/infraestructura/historial-movimiento'
import { limpiarVinculoVerificacion, leerVinculoVerificacion } from '@/components/infraestructura/verificacion-vinculo'
import { crearAlmacenParte } from '@/lib/infraestructura/parte/almacen-indexeddb'
import { confirmarFormulario, eliminarBorradorFormulario, guardarBorradorFormulario, guardarClaveEnvioFormulario, leerBorradorFormulario, leerConfirmacionFormulario, limpiarFormularioConfirmado, olvidarClaveEnvioFormulario, type BorradorFormulario } from '@/lib/infraestructura/parte/borrador-formulario'
import { alEnviarEnSegundoPlano, pedirSyncParte, registrarServiceWorkerParte } from '@/lib/infraestructura/parte/registrar-sync'
import { claveBorrador as claveBorradorCola, esEstadoReintentable, intentarEnviar, leerBorrador as leerColaEnvio, MENSAJES_ESTADO, programarReintento, reenviarCola, registrarAutoReintento, type AlmacenClaveValor, type EnviarOpciones, type EstadoEnvio } from '@/lib/infraestructura/parte/envio-offline'
import { construirEnvio, consecuenciasActivas, ordenarSituaciones, RECORRIDO_INICIAL, responder, situacionesSinRespuesta, type EstadoRecorrido, type SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import { asistenciaCoincide, coincidenIdsSituaciones, crearAsistenciaSeleccionada, esBorradorRecorridoActualizacion, type AsistenciaSeleccionada, type BorradorRecorridoActualizacion, type EtapaActualizacion } from '@/lib/infraestructura/parte/recorrido-actualizacion-borrador'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'
import type { MotivoRow } from '@/lib/infraestructura/motivos'

export interface RecorridoActualizacionProps {
  cue: string
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
}

const TITULO_GUARDADO = 'Parte actualizado'
const MENSAJE_GUARDADO = 'Ya figura en el estado actual de su escuela.'
const MENSAJE_ERROR_GUARDADO = 'No pudimos guardar el parte. La información ingresada se mantiene para que pueda volver a intentar.'
const MENSAJE_BORRADOR_INVALIDO = 'No se pudo recuperar la actualización guardada. Empezará una nueva.'
type Carga = { fase: 'cargando' } | { fase: 'error'; mensaje: string } | { fase: 'listo'; datos: EstadoActualRespuesta; historial: MovimientoHistorial[] }
type Etapa = EtapaActualizacion | 'enviado'
type PayloadActualizacion = ReturnType<typeof construirEnvio> & { cue: string; rigeDesde: string; asistenciaPedagogica?: { brinda: boolean; modalidades: Array<'Clase virtual' | 'Cuadernillo'> } }
type SituacionConAlcance = SituacionRecorrido & { secciones: number[]; alumnos: number[] }

const DRAFT_ID_PREFIX = 'parte-actualizacion:'
type BorradorActualizacionConFotos = BorradorRecorridoActualizacion & { referenciasFotos?: string[] }

function esBorradorActualizacionConFotos(valor: unknown): valor is BorradorActualizacionConFotos {
  if (!esBorradorRecorridoActualizacion(valor)) return false
  const referencias = (valor as { referenciasFotos?: unknown }).referenciasFotos
  return referencias === undefined || (Array.isArray(referencias) && referencias.every((id) => typeof id === 'string'))
}

async function obtenerCarga(cue: string): Promise<Carga> {
  try {
    const [respuesta, respuestaHistorial] = await Promise.all([
      fetch(`/api/problematicas/parte?cue=${encodeURIComponent(cue)}`),
      fetch(`/api/problematicas/parte/historial?cue=${encodeURIComponent(cue)}`),
    ])
    if (!respuesta.ok) {
      if (respuesta.status === 401) return { fase: 'error', mensaje: MENSAJE_ACCESO_VENCIDO }
      if (respuesta.status === 503) return { fase: 'error', mensaje: MENSAJE_SIN_CORTE }
      return { fase: 'error', mensaje: MENSAJE_ERROR_LECTURA }
    }
    if (!respuestaHistorial.ok) {
      if (respuestaHistorial.status === 401) return { fase: 'error', mensaje: MENSAJE_ACCESO_VENCIDO }
      if (respuestaHistorial.status === 503) return { fase: 'error', mensaje: MENSAJE_SIN_CORTE }
      return { fase: 'error', mensaje: MENSAJE_ERROR_LECTURA }
    }
    const [datos, historial] = await Promise.all([
      respuesta.json() as Promise<EstadoActualRespuesta>,
      respuestaHistorial.json() as Promise<{ movimientos?: MovimientoHistorial[] }>,
    ])
    return { fase: 'listo', datos, historial: historial.movimientos ?? [] }
  } catch {
    return { fase: 'error', mensaje: MENSAJE_ERROR_LECTURA }
  }
}

function mapearSituaciones(datos: EstadoActualRespuesta): SituacionConAlcance[] {
  return (datos.afectaciones ?? []).map((a) => ({
    id: a.id,
    motivo: a.motivo,
    categoria: a.categoria,
    severidad: a.severidad,
    rigeDesde: a.rigeDesde,
    creadaEn: a.creadaEn,
    causadaPorId: a.causadaPorId,
    secciones: a.secciones.map((s) => s.geSectionId),
    alumnos: a.secciones.filter((s) => !s.seccionCompleta).flatMap((s) => s.alumnos.map((alumno) => alumno.gePersonId)),
  }))
}

interface FilaResumenActualizacion { etiqueta: string; valor: string }
interface BloqueResumenActualizacion { titulo: string; filas: FilaResumenActualizacion[] }

function contarAlumnos(secciones: number[], turnos: TurnoContexto[]): number {
  const seleccionadas = new Set(secciones)
  return turnos.flatMap((turno) => turno.niveles.flatMap((nivel) => nivel.secciones))
    .filter((seccion) => seleccionadas.has(seccion.geSectionId))
    .reduce((total, seccion) => total + seccion.matricula, 0)
}

function etiquetaServicio(estado: EstadoServicioGeneral | 'normal' | 'suspendido'): string {
  if (estado === 'normal') return 'habitual'
  if (estado === 'parcial') return 'parcial'
  return 'interrumpido'
}

function detalleAlcance(secciones: number[], alumnos: number): string {
  return resumirAlcance({ secciones: secciones.length, alumnos })
}

function crearLineasResumen(
  situaciones: SituacionConAlcance[],
  recorrido: EstadoRecorrido,
  turnos: TurnoContexto[],
  estadoServicio: EstadoServicioGeneral,
): BloqueResumenActualizacion[] {
  const bloques: BloqueResumenActualizacion[] = []
  const sinCambios: string[] = []
  for (const situacion of situaciones) {
    const respuesta = recorrido.respuestas[situacion.id]
    if (!respuesta) continue
    if (respuesta.tipo === 'sigue') {
      sinCambios.push(situacion.motivo)
      continue
    }
    if (respuesta.tipo === 'solucionada') {
      const momento = formatearMomento(respuesta.solucionadaEn)
      const fecha = momento && momento !== respuesta.solucionadaEn ? momento : 'fecha no disponible'
      bloques.push({ titulo: situacion.motivo, filas: [{ etiqueta: 'Estado', valor: `Se solucionó · ${fecha}` }] })
      continue
    }

    const filas: FilaResumenActualizacion[] = []
    if (respuesta.cambio.severidad) filas.push({ etiqueta: 'Gravedad', valor: respuesta.cambio.severidad === situacion.severidad ? `${situacion.severidad} (sin cambios)` : `${situacion.severidad} → ${respuesta.cambio.severidad}` })
    if (respuesta.cambio.secciones) {
      const alumnos = respuesta.cambio.alumnos?.length ?? contarAlumnos(respuesta.cambio.secciones, turnos)
      filas.push({ etiqueta: 'Alcance', valor: detalleAlcance(respuesta.cambio.secciones, alumnos) })
    }
    if (respuesta.cambio.aspectos.includes('clases-edificio') && recorrido.clasesEdificio) {
      filas.push({ etiqueta: 'Clases', valor: etiquetaServicio(estadoServicio) === etiquetaServicio(recorrido.clasesEdificio.servicioEstado) ? `${etiquetaServicio(estadoServicio)} (sin cambios)` : `${etiquetaServicio(estadoServicio)} → ${etiquetaServicio(recorrido.clasesEdificio.servicioEstado)}` })
    }
    if (filas.length) bloques.push({ titulo: situacion.motivo, filas })
  }
  if (sinCambios.length) bloques.push({ titulo: 'Sin cambios', filas: [{ etiqueta: 'Situaciones', valor: sinCambios.join(', ') }] })
  if (recorrido.nueva) {
    const nueva = recorrido.nueva
    const todasLasSecciones = turnos.flatMap((turno) => turno.niveles.flatMap((nivel) => nivel.secciones))
    const cantidadAlumnos = nueva.alumnos?.length ?? contarAlumnos(nueva.secciones, turnos)
    const alcance = detalleAlcance(nueva.secciones, cantidadAlumnos)
    const todaLaEscuela = !nueva.alumnos && todasLasSecciones.length > 0 && nueva.secciones.length === todasLasSecciones.length
    const prefijoAlcance = nueva.alumnos ? 'Algunos alumnos' : todaLaEscuela ? 'Toda la escuela' : ''
    const valor = `${nueva.motivo} · ${nueva.severidad} · ${prefijoAlcance ? `${prefijoAlcance} (${alcance})` : alcance}`
    const causa = nueva.causadaPorId ? situaciones.find((situacion) => situacion.id === nueva.causadaPorId)?.motivo : null
    bloques.push({
      titulo: 'Situación nueva',
      filas: [
        { etiqueta: 'Detalle', valor: causa ? `${valor} · Consecuencia de ${causa}` : valor },
        ...(nueva.descripcion ? [{ etiqueta: 'Descripción', valor: nueva.descripcion }] : []),
      ],
    })
  }
  return bloques
}

export function RecorridoActualizacion({ cue, turnos, motivos }: RecorridoActualizacionProps): JSX.Element {
  const [carga, setCarga] = useState<{ cue: string; resultado: Carga }>(() => ({ cue, resultado: { fase: 'cargando' } }))
  const solicitudRef = useRef(0)

  const recargar = useCallback(() => {
    const solicitud = ++solicitudRef.current
    setCarga({ cue, resultado: { fase: 'cargando' } })
    void obtenerCarga(cue).then((resultado) => {
      if (solicitud === solicitudRef.current) setCarga({ cue, resultado })
    })
  }, [cue])

  useEffect(() => {
    let vigente = true
    const solicitud = ++solicitudRef.current
    void obtenerCarga(cue).then((resultado) => {
      if (vigente && solicitud === solicitudRef.current) setCarga({ cue, resultado })
    })
    return () => {
      vigente = false
      solicitudRef.current += 1
    }
  }, [cue])

  useEffect(() => { void registrarServiceWorkerParte() }, [])

  const resultado = carga.cue === cue ? carga.resultado : { fase: 'cargando' as const }
  if (resultado.fase === 'cargando') return <p className="estado-actual-aviso" role="status">Buscando el estado actual del establecimiento…</p>
  if (resultado.fase === 'error') return <p className="estado-actual-aviso__texto" role="alert">{resultado.mensaje}</p>
  if (!resultado.datos.parte) return <p className="estado-actual-aviso__texto" role="alert">{MENSAJE_SIN_SITUACION}</p>

  return <RecorridoCargado key={`${cue}:${resultado.datos.parte.id}`} cue={cue} turnos={turnos} motivos={motivos} datos={resultado.datos} historial={resultado.historial} onRecargar={recargar} />
}

function RecorridoCargado({ cue, turnos, motivos, datos, historial, onRecargar }: RecorridoActualizacionProps & { datos: EstadoActualRespuesta; historial: MovimientoHistorial[]; onRecargar: () => void }): JSX.Element {
  const almacenRef = useRef<Promise<AlmacenClaveValor> | null>(null)
  const almacen = useCallback(() => (almacenRef.current ??= crearAlmacenParte()), [])
  const situaciones = useMemo(() => mapearSituaciones(datos), [datos])
  const ordenadas = useMemo(() => ordenarSituaciones(situaciones, datos.parte?.estadoEstablecimiento ?? 'habitual'), [situaciones, datos.parte?.estadoEstablecimiento])
  const claveBorrador = `parte-actualizar:draft:${cue}`
  const asistenciaVigente = datos.parte?.asistenciaPedagogica ?? { brinda: false, modalidades: [] }
  const [etapa, setEtapa] = useState<Etapa>('entrada')
  const [etapaAlgoNuevo, setEtapaAlgoNuevo] = useState<'pregunta' | 'datos' | 'causa'>('pregunta')
  const [recorrido, setRecorrido] = useState<EstadoRecorrido>(RECORRIDO_INICIAL)
  // Llega sin nada marcado: el director responde siempre, aunque ya haya un
  // valor vigente. Si coincide con el vigente, no se envía.
  const [asistenciaPedagogica, setAsistenciaPedagogica] = useState<AsistenciaSeleccionada>({ brinda: '', modalidades: [] })
  const [borradorPendiente, setBorradorPendiente] = useState<BorradorRecorridoActualizacion | null>(null)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const [avisoBorrador, setAvisoBorrador] = useState<string | null>(null)
  const [avisoAlmacen, setAvisoAlmacen] = useState<string | null>(null)
  const [borradorLeido, setBorradorLeido] = useState(false)
  const [interaccionIniciada, setInteraccionIniciada] = useState(false)
  const generacionRef = useRef<string | null>(null)
  const generacionAlmacenRef = useRef(1)
  const borradorCompartidoRef = useRef<BorradorFormulario<BorradorActualizacionConFotos> | null>(null)
  const persistenciaBloqueadaRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [situacionConError, setSituacionConError] = useState<string | null>(null)
  const [colaCascada, setColaCascada] = useState<Array<{ situacion: SituacionRecorrido; solucionadaEn: string }>>([])
  const [guardado, setGuardado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [estadoEnvio, setEstadoEnvio] = useState<EstadoEnvio | null>(null)
  const [estadoAvisoEnvio, setEstadoAvisoEnvio] = useState<'pendiente-envio' | 'error-servidor' | 'sesion-vencida' | null>(null)
  const [intentosEnvio, setIntentosEnvio] = useState(0)
  const [motivoEnvio, setMotivoEnvio] = useState<string | null>(null)
  const enviandoRef = useRef(false)
  const reintentarRef = useRef<(deliberado?: boolean) => void>(() => {})
  const exitoRef = useRef<() => void>(() => {})
  const candidatasCausa = useMemo(() => [
    ...situaciones.filter((s) => recorrido.respuestas[s.id]?.tipo !== 'solucionada').map((s) => ({
      id: s.id,
      motivo: s.motivo,
      fecha: s.rigeDesde,
      activa: true,
      severidad: s.severidad,
      secciones: s.secciones.length,
      alumnos: s.categoria === 'alumnos' ? s.alumnos.length : contarAlumnos(s.secciones, turnos),
    })),
    ...(datos.recientes ?? []).map((s) => ({ id: s.id, motivo: s.motivo, fecha: s.retiradaEn, activa: false, severidad: s.severidad })),
  ], [situaciones, recorrido.respuestas, datos.recientes, turnos])
  const asistenciaSeleccionada = crearAsistenciaSeleccionada(asistenciaPedagogica.brinda, asistenciaPedagogica.modalidades)
  const asistenciaCambiada = !asistenciaCoincide(asistenciaVigente, asistenciaSeleccionada)
  const lineasResumen = useMemo(() => {
    return crearLineasResumen(situaciones, recorrido, turnos, datos.servicio?.estadoGeneral ?? 'normal')
  }, [situaciones, recorrido, turnos, datos.servicio?.estadoGeneral])

  function moverEtapa(siguiente: EtapaActualizacion): void {
    setEtapa(siguiente)
    setInteraccionIniciada(true)
    try { window.history.pushState({ recorridoActualizacion: true }, '') } catch { /* El recorrido sigue disponible sin historial. */ }
  }

  useEffect(() => {
    let cancelado = false
    void (async () => {
      try {
        const confirmacion = await leerConfirmacionFormulario(`${DRAFT_ID_PREFIX}${cue}`)
        if (cancelado) return
        if (confirmacion) {
          setGuardado(true)
          void limpiarFormularioConfirmado(`${DRAFT_ID_PREFIX}${cue}`, claveBorrador)
          return
        }
        const guardado = await leerBorradorFormulario(
          `${DRAFT_ID_PREFIX}${cue}`,
          claveBorrador,
          esBorradorActualizacionConFotos,
        )
        if (cancelado) return
        if (guardado) {
          borradorCompartidoRef.current = guardado
          generacionAlmacenRef.current = guardado.registro.generacion
          const dato = guardado.datos
          if (!coincidenIdsSituaciones(dato.idsSituaciones, situaciones.map((situacion) => situacion.id))) {
            persistenciaBloqueadaRef.current = true
            setAvisoBorrador('La situación cambió desde que empezó. El borrador anterior se conservó en este dispositivo y no se aplicó a esta actualización.')
          } else {
            setBorradorPendiente(dato)
          }
        }
      } catch (error) {
        if (!cancelado) {
          persistenciaBloqueadaRef.current = true
          const mensaje = error instanceof Error ? error.message : 'No se pudo acceder al almacenamiento local.'
          if (mensaje.includes('IndexedDB')) {
            setAvisoAlmacen(`${mensaje} Puede enviar las respuestas.`)
          } else {
            setAvisoBorrador(`${MENSAJE_BORRADOR_INVALIDO} ${mensaje} Puede enviar las respuestas.`)
          }
          try {
            const anterior: unknown = JSON.parse(localStorage.getItem(claveBorrador) ?? 'null')
            if (esBorradorActualizacionConFotos(anterior)) {
              const borrador: BorradorFormulario<BorradorActualizacionConFotos> = {
                registro: { draftId: `${DRAFT_ID_PREFIX}${cue}`, generacion: 1, version: 1, datos: anterior, actualizadoEn: new Date().toISOString() },
                datos: anterior,
              }
              borradorCompartidoRef.current = borrador
              if (coincidenIdsSituaciones(anterior.idsSituaciones, situaciones.map((situacion) => situacion.id))) setBorradorPendiente(anterior)
            }
          } catch {
            // Keep the legacy value untouched and continue with an explicit notice.
          }
        }
      } finally {
        if (!cancelado) setBorradorLeido(true)
      }
    })()
    return () => { cancelado = true }
  }, [claveBorrador, cue, situaciones])

  useEffect(() => {
    if (!borradorLeido || !interaccionIniciada || borradorPendiente || persistenciaBloqueadaRef.current) return
    const generacion = generacionRef.current ??= crypto.randomUUID()
    const datos: BorradorActualizacionConFotos = {
      generacion,
      referenciasFotos: borradorCompartidoRef.current?.datos.referenciasFotos ?? [],
      etapa: etapa === 'enviado' ? 'resumen' : etapa,
      recorrido,
      asistenciaPedagogica,
      idsSituaciones: situaciones.map((situacion) => situacion.id),
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
      setAvisoBorrador(null)
      try { localStorage.setItem(claveBorrador, JSON.stringify(datos)) } catch { /* IndexedDB sigue siendo el almacenamiento principal. */ }
    }).catch((error: unknown) => {
      setAvisoAlmacen(error instanceof Error ? `${error.message} Puede enviar las respuestas.` : 'No se pudo guardar el borrador local. Puede enviar las respuestas.')
    })
  }, [borradorLeido, interaccionIniciada, borradorPendiente, claveBorrador, cue, etapa, recorrido, asistenciaPedagogica, situaciones])

  useEffect(() => {
    function alVolverAtras(): void {
      if (etapa === 'resumen') setEtapa('nuevo')
      else if (etapa === 'nuevo') setEtapa(ordenadas.length ? { revisar: ordenadas.length - 1 } : 'entrada')
      else if (typeof etapa === 'object') setEtapa(etapa.revisar > 0 ? { revisar: etapa.revisar - 1 } : 'entrada')
      setError(null)
    }
    window.addEventListener('popstate', alVolverAtras)
    return () => window.removeEventListener('popstate', alVolverAtras)
  }, [etapa, ordenadas.length])

  const opcionesEnvio = useCallback((): Omit<EnviarOpciones<PayloadActualizacion>, 'almacen'> => {
    return {
      tipo: 'actualizacion',
      cue,
      fetchImpl: async (input, init) => {
        const idempotencyKey = new Headers(init?.headers).get('Idempotency-Key')
        if (idempotencyKey) await guardarClaveEnvioFormulario(`${DRAFT_ID_PREFIX}${cue}`, idempotencyKey).catch(() => {})
        return fetch(input, init)
      },
      url: '/api/problematicas/parte',
      construirCuerpo: (datosEnvio, idempotencyKey) => {
        const vinculo = leerVinculoVerificacion()
        return { ...datosEnvio, idempotencyKey, ...(vinculo ? { verificacion: vinculo } : {}) }
      },
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
  }, [cue])

  const alEnviarConExito = useCallback((movimientoId?: string) => {
    if (movimientoId) void confirmarFormulario(`${DRAFT_ID_PREFIX}${cue}`, movimientoId).catch(() => {})
    const actual = borradorCompartidoRef.current
    if (actual) {
      void eliminarBorradorFormulario(actual).then(() => {
        borradorCompartidoRef.current = null
        localStorage.removeItem(claveBorrador)
      }).catch((error: unknown) => {
        setAvisoBorrador(error instanceof Error ? `${error.message} Puede enviar las respuestas.` : 'No se pudo limpiar el borrador local.')
      })
    }
    limpiarVinculoVerificacion()
    setBorradorPendiente(null)
    setGuardado(true)
    setEnviando(false)
    enviandoRef.current = false
  }, [claveBorrador, cue])

  useEffect(() => {
    let cancelado = false
    void (async () => {
      const cola = await leerColaEnvio<PayloadActualizacion>(await almacen(), 'actualizacion', cue)
      if (!cancelado && cola) {
        setEstadoEnvio(cola.estado)
        if (cola.estado === 'pendiente-envio' || cola.estado === 'error-servidor' || cola.estado === 'sesion-vencida') setEstadoAvisoEnvio(cola.estado)
        setMotivoEnvio(cola.motivoError ?? null)
        setIntentosEnvio(cola.intentos)
        if (esEstadoReintentable(cola.estado) && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
          const resultado = await reenviarCola({ ...opcionesEnvio(), almacen: await almacen() })
          if (!cancelado && resultado?.ok) {
            const cuerpo = resultado.respuesta as { movimientoId?: string } | null
            alEnviarConExito(cuerpo?.movimientoId)
          }
        }
      }
    })()
    return () => { cancelado = true }
  }, [almacen, cue, opcionesEnvio, alEnviarConExito])

  useEffect(() => { exitoRef.current = alEnviarConExito })

  useEffect(() => {
    reintentarRef.current = (deliberado = false) => {
      const errorEnReintento = estadoAvisoEnvio === 'error-servidor' && (estadoEnvio === 'error-servidor' || estadoEnvio === 'enviando')
      const sesionVencidaEnReintento = estadoAvisoEnvio === 'sesion-vencida' && (estadoEnvio === 'sesion-vencida' || estadoEnvio === 'enviando')
      if (guardado || (!esEstadoReintentable(estadoEnvio) && !(deliberado && (errorEnReintento || sesionVencidaEnReintento)))) return
      void (async () => {
        const resultado = await reenviarCola({ ...opcionesEnvio(), almacen: await almacen() }, { deliberado })
        if (resultado?.ok) {
          const cuerpo = resultado.respuesta as { movimientoId?: string } | null
          alEnviarConExito(cuerpo?.movimientoId)
        }
      })()
    }
  })
  useEffect(() => { return alEnviarEnSegundoPlano((clave) => { if (clave === claveBorradorCola('actualizacion', cue)) exitoRef.current() }) }, [cue])
  useEffect(() => registrarAutoReintento(() => reintentarRef.current()), [])
  useEffect(() => {
    if (guardado || enviando || !esEstadoReintentable(estadoEnvio)) return
    if (estadoEnvio === 'pendiente-envio' && typeof navigator !== 'undefined' && navigator.onLine === false) return
    return programarReintento(intentosEnvio, () => reintentarRef.current())
  }, [estadoEnvio, intentosEnvio, guardado, enviando])

  function retomarBorrador(): void {
    if (!borradorPendiente) return
    generacionRef.current = borradorPendiente.generacion
    setEtapa(borradorPendiente.etapa)
    setRecorrido(borradorPendiente.recorrido)
    setAsistenciaPedagogica(borradorPendiente.asistenciaPedagogica)
    setInteraccionIniciada(true)
    setBorradorPendiente(null)
  }

  async function enviar(): Promise<void> {
    if (enviando || enviandoRef.current) return
    if (asistenciaPedagogica.brinda === '') {
      setError('Indique si se brinda asistencia pedagógica.')
      return
    }
    if (asistenciaPedagogica.brinda === 'si' && asistenciaPedagogica.modalidades.length === 0) {
      setError('Elija al menos una modalidad de asistencia pedagógica.')
      return
    }
    if (situacionesSinRespuesta(situaciones, recorrido).length > 0) {
      setError('Indique cómo sigue cada situación antes de enviar.')
      return
    }
    enviandoRef.current = true
    setEnviando(true)
    setError(null)
    setMotivoEnvio(null)
    const payload: PayloadActualizacion = {
      cue,
      rigeDesde: new Date().toISOString(),
      ...construirEnvio(situaciones, recorrido),
      ...(asistenciaCambiada && asistenciaSeleccionada ? { asistenciaPedagogica: asistenciaSeleccionada } : {}),
    }
    const resultado = await intentarEnviar(payload, { ...opcionesEnvio(), almacen: await almacen() })
    if (resultado.ok) {
      const cuerpo = resultado.respuesta as { ok?: boolean; movimientoId?: string } | null
      if (cuerpo?.ok && typeof cuerpo.movimientoId === 'string') { alEnviarConExito(cuerpo.movimientoId); return }
      enviandoRef.current = false
      setEnviando(false)
      setError(MENSAJE_ERROR_GUARDADO)
      return
    }
    enviandoRef.current = false
    setEnviando(false)
    // El resumen ya anuncia el error persistido junto al estado del envío.
  }

  function siguiente(): void {
    const pasoActual = typeof etapa === 'object' ? etapa.revisar : -1
    const situacionActual = ordenadas[pasoActual]
    if (situacionActual && !recorrido.respuestas[situacionActual.id]) {
      setError(null)
      setSituacionConError(situacionActual.id)
      return
    }
    setError(null)
    setSituacionConError(null)
    let indice = pasoActual + 1
    while (indice < ordenadas.length && recorrido.respuestas[ordenadas[indice].id]) indice += 1
    if (indice < ordenadas.length) {
      moverEtapa({ revisar: indice })
      return
    }
    if (situacionesSinRespuesta(situaciones, recorrido).length > 0) {
      const faltante = ordenadas.find((situacion) => !recorrido.respuestas[situacion.id])
      setSituacionConError(faltante?.id ?? null)
      return
    }
    moverEtapa('nuevo')
  }

  function encolarCascada(id: string, iso: string): void {
    const descendientes = consecuenciasActivas(situaciones, id, recorrido)
    setColaCascada((actuales) => [...actuales, ...descendientes.map((situacion) => ({ situacion, solucionadaEn: iso }))])
  }

  const pendiente = colaCascada[0]
  const actualOrdenada = typeof etapa === 'object' ? ordenadas[etapa.revisar] : null
  const actual = actualOrdenada ? situaciones.find((situacion) => situacion.id === actualOrdenada.id) ?? null : null
  const estadoEstablecimiento = datos.parte?.estadoEstablecimiento ?? 'habitual'
  const estadoServicio = datos.servicio?.estadoGeneral ?? 'normal'
  const clasesEdificio = recorrido.clasesEdificio ?? { servicioEstado: estadoServicio === 'suspendido' ? 'suspendido' as const : 'normal' as const, estadoEstablecimiento, confirmarInterrupcionTotal: false }
  const pasoProgreso = typeof etapa === 'object' ? etapa.revisar + 1 : etapa === 'nuevo' ? ordenadas.length + 1 : ordenadas.length + 2
  const totalPasos = ordenadas.length + 2

  if (guardado || etapa === 'enviado') {
    return <ConfirmacionEnviado cue={cue} onRecargar={() => {
      void (async () => {
        await olvidarClaveEnvioFormulario(`${DRAFT_ID_PREFIX}${cue}`)
        const actual = borradorCompartidoRef.current
        if (actual) {
          await eliminarBorradorFormulario(actual)
          borradorCompartidoRef.current = null
          localStorage.removeItem(claveBorrador)
        }
        setBorradorPendiente(null)
        setGuardado(false)
        setEtapa('entrada')
        setRecorrido(RECORRIDO_INICIAL)
        setAsistenciaPedagogica({ brinda: '', modalidades: [] })
        setEstadoEnvio(null)
        setEstadoAvisoEnvio(null)
        setMotivoEnvio(null)
        setIntentosEnvio(0)
        setInteraccionIniciada(false)
        persistenciaBloqueadaRef.current = false
        onRecargar()
      })().catch(() => {})
    }} />
  }

  return (
    <div className="reporte-inicial reporte-inicial--con-panel recorrido-actualizacion">
      <p className="asistente__titulo asistente__titulo--paso" aria-hidden="true">Actualizar</p>
      <ConfirmSheet
        open={borradorPendiente !== null && !confirmarDescarte}
        titulo="Tiene un parte sin enviar."
        confirmarLabel="Continuar donde lo dejé"
        cancelarLabel="Descartar"
        onConfirmar={retomarBorrador}
        onCancelar={() => setConfirmarDescarte(true)}
        onCerrar={retomarBorrador}
      >
        <p>Puede seguir donde lo dejó o descartarlo y empezar de nuevo.</p>
      </ConfirmSheet>
      {avisoBorrador ? <p className="recorrido-actualizacion__aviso" role="alert">{avisoBorrador}</p> : null}
      {avisoAlmacen && !estadoAvisoEnvio ? <p className="recorrido-actualizacion__aviso" role="status">{avisoAlmacen}</p> : null}
      {etapa === 'entrada' ? (
        <EntradaActualizar
          situaciones={situaciones}
          estadoEstablecimiento={estadoEstablecimiento}
          estadoServicio={estadoServicio}
          ultimaCarga={datos.ultimaCarga ?? null}
          historial={historial}
          onActualizar={() => {
            setError(null)
            moverEtapa(ordenadas.length ? { revisar: 0 } : 'nuevo')
          }}
        />
      ) : null}

      {etapa !== 'entrada' ? <ProgresoActualizacion paso={pasoProgreso} total={totalPasos} /> : null}
      {actual && typeof etapa === 'object' ? (
        <section>
          <p className="recorrido-actualizacion__descripcion">Revise lo informado hasta ahora y agregue o corrija lo que cambió.</p>
          <RevisarSituacion
            key={actual.id}
            situacion={actual}
            turnos={turnos}
            sugerida={motivos.find((motivo) => motivo.nombre === actual.motivo)?.severidadSugerida ?? null}
            respuesta={recorrido.respuestas[actual.id]}
            faltaRespuesta={situacionConError === actual.id}
            onInteractuar={() => setSituacionConError(null)}
            consecuencias={consecuenciasActivas(situaciones, actual.id, recorrido)}
            clasesEdificio={clasesEdificio}
            onResponder={(respuesta) => {
              setRecorrido((r) => {
                if (respuesta) return responder(r, actual.id, respuesta)
                const respuestas = { ...r.respuestas }
                delete respuestas[actual.id]
                return { ...r, respuestas }
              })
              setSituacionConError(null)
              setInteraccionIniciada(true)
              setError(null)
            }}
            onCambiarClasesEdificio={(valor) => setRecorrido((r) => (
              valor.servicioEstado === '' || valor.estadoEstablecimiento === ''
                ? r
                : {
                    ...r,
                    clasesEdificio: {
                      servicioEstado: valor.servicioEstado,
                      estadoEstablecimiento: valor.estadoEstablecimiento,
                      confirmarInterrupcionTotal: valor.confirmarInterrupcionTotal,
                    },
                  }
            ))}
            onCascada={(id, iso) => {
              setRecorrido((r) => responder(r, id, { tipo: 'solucionada', solucionadaEn: iso }))
              encolarCascada(id, iso)
            }}
            posicion={{ actual: etapa.revisar + 1, total: ordenadas.length }}
          />
          <div className="asistente__acciones">
            <Button
              type="button"
              variant="secondary"
              hidden={etapa.revisar === 0}
              onClick={() => {
                setError(null)
                moverEtapa({ revisar: Math.max(0, etapa.revisar - 1) })
              }}
            >
              Volver
            </Button>
            <Button type="button" onClick={siguiente}>Continuar</Button>
          </div>
        </section>
      ) : null}

      {etapa === 'nuevo' ? (
        <>
          <AlgoNuevo
            candidatasCausa={candidatasCausa}
            situacionesActivas={situaciones}
            estado={recorrido}
            turnos={turnos}
            motivos={motivos}
            onEtapaChange={setEtapaAlgoNuevo}
            onTerminar={(nueva) => {
              setRecorrido((r) => ({ ...r, nueva }))
              setInteraccionIniciada(true)
              moverEtapa('resumen')
            }}
            onActualizarExistente={(id) => {
              setRecorrido((r) => {
                const respuestas = { ...r.respuestas }
                delete respuestas[id]
                return { ...r, respuestas, nueva: null }
              })
              moverEtapa({ revisar: ordenadas.findIndex((situacion) => situacion.id === id) })
            }}
            onSolucionarExistente={(id, solucionadaEn) => {
              setRecorrido((r) => responder(r, id, { tipo: 'solucionada', solucionadaEn }))
              encolarCascada(id, solucionadaEn)
            }}
          />
          {etapaAlgoNuevo === 'pregunta' ? <div className="asistente__acciones">
            <Button
              type="button"
              variant="secondary"
              onClick={() => moverEtapa(ordenadas.length ? { revisar: ordenadas.length - 1 } : 'entrada')}
            >
              Volver
            </Button>
          </div> : null}
        </>
      ) : null}

      {etapa === 'resumen' ? (
        <ResumenEnvio
          lineasResumen={lineasResumen}
          asistenciaVigente={asistenciaVigente.brinda ? 'Sí' : 'No'}
          asistenciaPedagogica={asistenciaPedagogica}
          enviando={enviando}
          onCambiarAsistencia={(seleccion) => {
            setAsistenciaPedagogica(seleccion)
            setInteraccionIniciada(true)
            setError(null)
          }}
          estadoEnvio={estadoEnvio}
          estadoAvisoEnvio={estadoAvisoEnvio}
          motivoEnvio={motivoEnvio}
          onRetry={() => reintentarRef.current(true)}
          error={error}
          onVolver={() => moverEtapa('nuevo')}
          onEnviar={() => void enviar()}
        />
      ) : null}
      {error && etapa !== 'resumen' ? <p role="alert">{error}</p> : null}
      <CascadaPendiente
        pendiente={pendiente}
        onCancelar={() => setColaCascada((actuales) => actuales.slice(1))}
        onConfirmar={() => {
          if (pendiente) {
            setRecorrido((r) => responder(r, pendiente.situacion.id, {
              tipo: 'solucionada',
              solucionadaEn: pendiente.solucionadaEn,
            }))
          }
          setColaCascada((actuales) => actuales.slice(1))
        }}
      />
      <ConfirmSheet
        open={confirmarDescarte}
        titulo="¿Descartar el parte sin enviar?"
        confirmarLabel="Sí, descartar"
        cancelarLabel="Cancelar"
        onCancelar={() => setConfirmarDescarte(false)}
        onConfirmar={() => {
          const actual = borradorCompartidoRef.current
          void (async () => {
            try {
              if (actual && !(await eliminarBorradorFormulario(actual))) {
                setAvisoBorrador('El borrador cambió en otra pestaña y se conservó. Puede enviar las respuestas.')
                setConfirmarDescarte(false)
                return
              }
              localStorage.removeItem(claveBorrador)
              borradorCompartidoRef.current = null
              generacionAlmacenRef.current += 1
              generacionRef.current = crypto.randomUUID()
              persistenciaBloqueadaRef.current = false
              setBorradorPendiente(null)
              setRecorrido(RECORRIDO_INICIAL)
              setEtapa('entrada')
              setInteraccionIniciada(false)
              setError(null)
              setAvisoBorrador(null)
              setConfirmarDescarte(false)
            } catch (error) {
              setAvisoBorrador(error instanceof Error ? `${error.message} El borrador se conservó; puede enviar las respuestas.` : 'No se pudo descartar el borrador local. Puede enviar las respuestas.')
            }
          })()
        }}
      >
        <p>Se pierde lo que cargó y no se envía nada.</p>
      </ConfirmSheet>
    </div>
  )
}

function ProgresoActualizacion({ paso, total }: { paso: number; total: number }): JSX.Element {
  return (
    <div className="asistente__progreso" aria-label={`Paso ${paso} de ${total}`}>
      <p className="asistente__contador">Paso {paso} de {total}</p>
      <ol className="asistente__pasos" aria-hidden="true">
        {Array.from({ length: total }, (_, indice) => (
          <li key={indice} className={`asistente__paso${indice < paso ? ' asistente__paso--hecho' : ''}${indice === paso - 1 ? ' asistente__paso--actual' : ''}`} />
        ))}
      </ol>
    </div>
  )
}

function ConfirmacionEnviado({ cue, onRecargar }: { cue: string; onRecargar: () => void }): JSX.Element {
  return (
    <div className="reporte-inicial__confirmacion" role="status">
      <div className="reporte-inicial__confirmacion-mensaje">
        <CircleCheck aria-hidden="true" size={20} />
        <div><h2>{TITULO_GUARDADO}</h2><p>{MENSAJE_GUARDADO}</p></div>
      </div>
      <div className="reporte-inicial__confirmacion-acciones">
        <a className="ui-button ui-button--default" href={`/problematicas/parte?cue=${encodeURIComponent(cue)}`}>
          Ver estado actual
        </a>
        <Button type="button" variant="secondary" onClick={onRecargar}>
          Actualizar de nuevo
        </Button>
      </div>
    </div>
  )
}

function ResumenEnvio({
  lineasResumen,
  asistenciaVigente,
  asistenciaPedagogica,
  enviando,
  onCambiarAsistencia,
  estadoEnvio,
  estadoAvisoEnvio,
  motivoEnvio,
  onRetry,
  error,
  onVolver,
  onEnviar,
}: {
  lineasResumen: BloqueResumenActualizacion[]
  asistenciaVigente: 'Sí' | 'No'
  asistenciaPedagogica: AsistenciaSeleccionada
  enviando: boolean
  onCambiarAsistencia: (seleccion: AsistenciaSeleccionada) => void
  estadoEnvio: EstadoEnvio | null
  estadoAvisoEnvio: 'pendiente-envio' | 'error-servidor' | 'sesion-vencida' | null
  motivoEnvio: string | null
  onRetry: () => void
  error: string | null
  onVolver: () => void
  onEnviar: () => void
}): JSX.Element {
  return (
    <section className="reporte-inicial__seccion actualizacion-resumen">
      <h2>Confirmar</h2>
      <p className="asistente__resumen-intro">Esto es lo que va a quedar informado. Revíselo antes de guardar.</p>
      <div className="actualizacion-resumen__lista">
        {lineasResumen.map((bloque) => (
          <section key={bloque.titulo} className="actualizacion-resumen__bloque">
            <h3>{bloque.titulo}</h3>
            <dl>
              {bloque.filas.map((fila) => (
                <div key={`${fila.etiqueta}-${fila.valor}`} className="actualizacion-resumen__fila">
                  <dt>{fila.etiqueta}</dt>
                  <dd>{fila.valor}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <fieldset className="afectacion-campos__grupo" disabled={enviando}>
        <legend className="afectacion-campos__legend">¿Se brinda asistencia pedagógica?</legend>
        {(['si', 'no'] as const).map((valor) => (
          <Opcion
              key={valor}
              tipo="radio"
              name="actualizacion-asistencia-pedagogica"
              checked={asistenciaPedagogica.brinda === valor}
              onChange={() => onCambiarAsistencia({
                brinda: valor,
                modalidades: valor === 'si' ? asistenciaPedagogica.modalidades : [],
              })}
              label={valor === 'si' ? 'Sí' : 'No'}
              compacta
          />
        ))}
        {asistenciaPedagogica.brinda === 'si' && (['Clase virtual', 'Cuadernillo'] as const).map((modalidad) => (
          <Opcion
              key={modalidad}
              tipo="checkbox"
              checked={asistenciaPedagogica.modalidades.includes(modalidad)}
              onChange={(evento) => {
                const marcada = evento.currentTarget.checked
                onCambiarAsistencia({
                brinda: 'si',
                modalidades: marcada
                  ? [...asistenciaPedagogica.modalidades, modalidad]
                  : asistenciaPedagogica.modalidades.filter((actual) => actual !== modalidad),
                })
              }}
              label={modalidad}
              compacta
            />
        ))}
      {asistenciaPedagogica.brinda !== (asistenciaVigente === 'Sí' ? 'si' : 'no') ? (
        <p className="actualizacion-resumen__vigente">Actualmente: {asistenciaVigente}</p>
      ) : null}
      </fieldset>
      {estadoEnvio && (estadoEnvio !== 'enviando' || estadoAvisoEnvio !== null) ? (
        estadoEnvio === 'pendiente-envio' || estadoEnvio === 'error-servidor' || estadoEnvio === 'sesion-vencida' || estadoEnvio === 'enviando'
          ? <EstadoEnvioAviso estado={estadoAvisoEnvio ?? (estadoEnvio === 'enviando' ? 'error-servidor' : estadoEnvio)} mensaje={motivoEnvio ?? undefined} onRetry={onRetry} disabled={estadoEnvio === 'enviando' && estadoAvisoEnvio !== 'error-servidor'} />
          : <p role="status" aria-live="polite">
              {estadoEnvio === 'error' && motivoEnvio
                ? `${MENSAJES_ESTADO.error}: ${motivoEnvio}`
                : MENSAJES_ESTADO[estadoEnvio]}
            </p>
      ) : null}
      {error ? <p className="reporte-inicial__error" role="alert">{error}</p> : null}
      <div className="asistente__acciones">
        <Button type="button" variant="secondary" onClick={onVolver}>
          Volver
        </Button>
        <Button type="button" onClick={onEnviar} disabled={enviando || estadoEnvio === 'enviando' || estadoEnvio === 'pendiente-envio' || estadoEnvio === 'error-servidor'}>
          {estadoAvisoEnvio === 'error-servidor' && (estadoEnvio === 'enviando' || estadoEnvio === 'error-servidor') ? 'Reintentando…' : enviando || estadoEnvio === 'enviando' ? 'Guardando…' : estadoEnvio === 'pendiente-envio' ? 'Envío pendiente' : 'Guardar actualización'}
        </Button>
      </div>
    </section>
  )
}

function CascadaPendiente({
  pendiente,
  onCancelar,
  onConfirmar,
}: {
  pendiente: { situacion: SituacionRecorrido; solucionadaEn: string } | undefined
  onCancelar: () => void
  onConfirmar: () => void
}): JSX.Element {
  return (
    <ConfirmSheet
      open={pendiente !== undefined}
      titulo={pendiente ? `${pendiente.situacion.motivo} se solucionó` : ''}
      confirmarLabel="Sí, también se solucionó"
      cancelarLabel="No, sigue activo"
      onCancelar={onCancelar}
      onConfirmar={onConfirmar}
    >
      {pendiente ? <p>{`${pendiente.situacion.motivo} (consecuencia), ¿también se solucionó?`}</p> : null}
    </ConfirmSheet>
  )
}
