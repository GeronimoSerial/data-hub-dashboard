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
import type { MovimientoHistorial } from '@/components/infraestructura/historial-movimiento'
import { limpiarVinculoVerificacion, leerVinculoVerificacion } from '@/components/infraestructura/verificacion-vinculo'
import { crearAlmacenParte } from '@/lib/infraestructura/parte/almacen-indexeddb'
import { crearBorradorStore } from '@/lib/infraestructura/parte/borrador-historial'
import { alEnviarEnSegundoPlano, pedirSyncParte, registrarServiceWorkerParte } from '@/lib/infraestructura/parte/registrar-sync'
import { crearAlmacenLocalStorage, claveBorrador as claveBorradorCola, esEstadoReintentable, intentarEnviar, leerBorrador as leerColaEnvio, MENSAJES_ESTADO, programarReintento, reenviarCola, registrarAutoReintento, type AlmacenClaveValor, type EnviarOpciones, type EstadoEnvio } from '@/lib/infraestructura/parte/envio-offline'
import { construirEnvio, consecuenciasActivas, ordenarSituaciones, RECORRIDO_INICIAL, responder, situacionesSinRespuesta, type EstadoRecorrido, type SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import { asistenciaCoincide, coincidenIdsSituaciones, crearAsistenciaSeleccionada, esBorradorRecorridoActualizacion, type AsistenciaSeleccionada, type BorradorRecorridoActualizacion, type EtapaActualizacion } from '@/lib/infraestructura/parte/recorrido-actualizacion-borrador'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'

export interface RecorridoActualizacionProps {
  cue: string
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
}

const MENSAJE_GUARDADO = 'Parte actualizado.'
const MENSAJE_ERROR_GUARDADO = 'No pudimos guardar el parte. La información ingresada se mantiene para que pueda volver a intentar.'
const MENSAJE_BORRADOR_INVALIDO = 'No se pudo recuperar la actualización guardada. Empezará una nueva.'
type Carga = { fase: 'cargando' } | { fase: 'error'; mensaje: string } | { fase: 'listo'; datos: EstadoActualRespuesta; historial: MovimientoHistorial[] }
type Etapa = EtapaActualizacion | 'enviado'
type PayloadActualizacion = ReturnType<typeof construirEnvio> & { cue: string; rigeDesde: string; asistenciaPedagogica?: { brinda: boolean; modalidades: Array<'Clase virtual' | 'Cuadernillo'> } }
type SituacionConAlcance = SituacionRecorrido & { secciones: number[]; alumnos: number[] }

const almacenBorradores = crearAlmacenLocalStorage()
const borradorStore = crearBorradorStore(esBorradorRecorridoActualizacion)

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

function crearLineasResumen(situaciones: SituacionRecorrido[], recorrido: EstadoRecorrido): string[] {
  const lineas: string[] = []
  for (const situacion of situaciones) {
    const respuesta = recorrido.respuestas[situacion.id]
    if (!respuesta) continue
    if (respuesta.tipo === 'sigue') lineas.push(`${situacion.motivo}: sin cambios`)
    else if (respuesta.tipo === 'solucionada') lineas.push(`${situacion.motivo}: se solucionó (${respuesta.solucionadaEn})`)
    else {
      const datos: string[] = []
      if (respuesta.cambio.severidad) datos.push(`gravedad ${respuesta.cambio.severidad}`)
      if (respuesta.cambio.secciones) datos.push(`alcance actualizado`)
      if (respuesta.cambio.aspectos.includes('clases-edificio')) datos.push('cambiaron las clases o el edificio')
      lineas.push(`${situacion.motivo}: ${datos.join(', ')}`)
    }
  }
  if (recorrido.nueva) {
    const causa = recorrido.nueva.causadaPorId ? situaciones.find((s) => s.id === recorrido.nueva?.causadaPorId)?.motivo : null
    lineas.push(`Situación nueva: ${recorrido.nueva.motivo}${causa ? ` (causada por ${causa})` : ''}`)
  }
  return lineas
}

function fechaCorta(iso: string): string {
  const fecha = new Date(iso)
  if (!Number.isFinite(fecha.getTime())) return iso
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(fecha)
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
  const [recorrido, setRecorrido] = useState<EstadoRecorrido>(RECORRIDO_INICIAL)
  const [asistenciaPedagogica, setAsistenciaPedagogica] = useState<AsistenciaSeleccionada>(() => ({
    brinda: asistenciaVigente.brinda ? 'si' : 'no',
    modalidades: asistenciaVigente.modalidades,
  }))
  const [borradorPendiente, setBorradorPendiente] = useState<BorradorRecorridoActualizacion | null>(null)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const [avisoBorrador, setAvisoBorrador] = useState<string | null>(null)
  const [borradorLeido, setBorradorLeido] = useState(false)
  const [interaccionIniciada, setInteraccionIniciada] = useState(false)
  const generacionRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [situacionConError, setSituacionConError] = useState<string | null>(null)
  const [colaCascada, setColaCascada] = useState<Array<{ situacion: SituacionRecorrido; solucionadaEn: string }>>([])
  const [guardado, setGuardado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [estadoEnvio, setEstadoEnvio] = useState<EstadoEnvio | null>(null)
  const [intentosEnvio, setIntentosEnvio] = useState(0)
  const [motivoEnvio, setMotivoEnvio] = useState<string | null>(null)
  const enviandoRef = useRef(false)
  const reintentarRef = useRef<() => void>(() => {})
  const exitoRef = useRef<() => void>(() => {})
  const candidatasCausa = useMemo(() => [
    ...situaciones.filter((s) => recorrido.respuestas[s.id]?.tipo !== 'solucionada').map((s) => ({ id: s.id, motivo: s.motivo, fecha: fechaCorta(s.rigeDesde), activa: true })),
    ...(datos.recientes ?? []).map((s) => ({ id: s.id, motivo: s.motivo, fecha: fechaCorta(s.retiradaEn), activa: false })),
  ], [situaciones, recorrido.respuestas, datos.recientes])
  const asistenciaSeleccionada = crearAsistenciaSeleccionada(asistenciaPedagogica.brinda, asistenciaPedagogica.modalidades)
  const asistenciaCambiada = !asistenciaCoincide(asistenciaVigente, asistenciaSeleccionada)
  const lineasResumen = useMemo(() => {
    return crearLineasResumen(situaciones, recorrido)
  }, [situaciones, recorrido])

  function moverEtapa(siguiente: EtapaActualizacion): void {
    setEtapa(siguiente)
    setInteraccionIniciada(true)
    try { window.history.pushState({ recorridoActualizacion: true }, '') } catch { /* El recorrido sigue disponible sin historial. */ }
  }

  useEffect(() => {
    let cancelado = false
    void (async () => {
      const crudo = await almacenBorradores.obtener(claveBorrador)
      if (cancelado) return
      if (crudo) {
        let dato: unknown
        try { dato = JSON.parse(crudo) } catch { dato = null }
        if (!esBorradorRecorridoActualizacion(dato)) {
          await borradorStore.limpiar(almacenBorradores, claveBorrador)
          setAvisoBorrador(MENSAJE_BORRADOR_INVALIDO)
        } else if (!coincidenIdsSituaciones(dato.idsSituaciones, situaciones.map((situacion) => situacion.id))) {
          await borradorStore.limpiar(almacenBorradores, claveBorrador)
          setAvisoBorrador('La situación cambió desde que empezó; vuelva a revisarla.')
        } else {
          const borrador = await borradorStore.leer(almacenBorradores, claveBorrador)
          if (!cancelado && borrador) setBorradorPendiente(borrador)
        }
      }
      if (!cancelado) setBorradorLeido(true)
    })()
    return () => { cancelado = true }
  }, [claveBorrador, situaciones])

  useEffect(() => {
    if (!borradorLeido || !interaccionIniciada) return
    const generacion = generacionRef.current ??= crypto.randomUUID()
    void borradorStore.guardar(almacenBorradores, claveBorrador, {
      generacion,
      etapa: etapa === 'enviado' ? 'resumen' : etapa,
      recorrido,
      asistenciaPedagogica,
      idsSituaciones: situaciones.map((situacion) => situacion.id),
    })
  }, [borradorLeido, interaccionIniciada, claveBorrador, etapa, recorrido, asistenciaPedagogica, situaciones])

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
      fetchImpl: (input, init) => fetch(input, init),
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
        setMotivoEnvio(borrador.motivoError ?? null)
        setIntentosEnvio(borrador.intentos)
        if (esEstadoReintentable(borrador.estado)) void pedirSyncParte()
      },
    }
  }, [cue])

  const alEnviarConExito = useCallback(() => {
    void borradorStore.limpiar(almacenBorradores, claveBorrador)
    limpiarVinculoVerificacion()
    setBorradorPendiente(null)
    setGuardado(true)
    setEnviando(false)
    enviandoRef.current = false
  }, [claveBorrador])

  useEffect(() => {
    let cancelado = false
    void (async () => {
      const cola = await leerColaEnvio<PayloadActualizacion>(await almacen(), 'actualizacion', cue)
      if (!cancelado && cola) {
        setEstadoEnvio(cola.estado)
        setMotivoEnvio(cola.motivoError ?? null)
        setIntentosEnvio(cola.intentos)
        if (esEstadoReintentable(cola.estado) && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
          const resultado = await reenviarCola({ ...opcionesEnvio(), almacen: await almacen() })
          if (!cancelado && resultado?.ok) alEnviarConExito()
        }
      }
    })()
    return () => { cancelado = true }
  }, [almacen, cue, opcionesEnvio, alEnviarConExito])

  useEffect(() => { exitoRef.current = alEnviarConExito })

  useEffect(() => {
    reintentarRef.current = () => {
      if (guardado || !esEstadoReintentable(estadoEnvio)) return
      void (async () => {
        const resultado = await reenviarCola({ ...opcionesEnvio(), almacen: await almacen() })
        if (resultado?.ok) alEnviarConExito()
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

  async function enviar(): Promise<void> {
    if (enviando || enviandoRef.current) return
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
      if (cuerpo?.ok && typeof cuerpo.movimientoId === 'string') { alEnviarConExito(); return }
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

  if (guardado || etapa === 'enviado') {
    return <ConfirmacionEnviado cue={cue} onRecargar={() => {
      void borradorStore.limpiar(almacenBorradores, claveBorrador)
      setBorradorPendiente(null)
      onRecargar()
    }} />
  }

  return (
    <div className="reporte-inicial reporte-inicial--con-panel recorrido-actualizacion">
      {borradorPendiente ? (
        <aside className="actualizacion-borrador" aria-label="Actualización guardada">
          <p>Tiene una carga sin enviar.</p>
          <div className="actualizacion-borrador__acciones">
            <Button type="button" onClick={() => {
              generacionRef.current = borradorPendiente.generacion
              setEtapa(borradorPendiente.etapa)
              setRecorrido(borradorPendiente.recorrido)
              setAsistenciaPedagogica(borradorPendiente.asistenciaPedagogica)
              setInteraccionIniciada(true)
              setBorradorPendiente(null)
            }}>Continuar</Button>
            <Button type="button" variant="secondary" onClick={() => setConfirmarDescarte(true)}>Descartar</Button>
          </div>
        </aside>
      ) : null}
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

      {avisoBorrador ? <p className="estado-actual-aviso__texto" role="alert">{avisoBorrador}</p> : null}
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
              disabled={etapa.revisar === 0}
              onClick={() => {
                setError(null)
                moverEtapa({ revisar: Math.max(0, etapa.revisar - 1) })
              }}
            >
              Atrás
            </Button>
            <Button type="button" onClick={siguiente}>Siguiente</Button>
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
          <div className="asistente__acciones">
            <Button
              type="button"
              variant="secondary"
              onClick={() => moverEtapa(ordenadas.length ? { revisar: ordenadas.length - 1 } : 'entrada')}
            >
              Atrás
            </Button>
          </div>
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
          motivoEnvio={motivoEnvio}
          onRetry={() => reintentarRef.current()}
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
        titulo="¿Descartar la actualización guardada?"
        confirmarLabel="Descartar actualización"
        cancelarLabel="Cancelar"
        onCancelar={() => setConfirmarDescarte(false)}
        onConfirmar={() => {
          void borradorStore.limpiar(almacenBorradores, claveBorrador)
          setBorradorPendiente(null)
          setRecorrido(RECORRIDO_INICIAL)
          setEtapa('entrada')
          setInteraccionIniciada(false)
          setError(null)
          setAvisoBorrador(null)
          setConfirmarDescarte(false)
        }}
      >
        <p>Se borrarán las respuestas que había guardado.</p>
      </ConfirmSheet>
    </div>
  )
}

function ConfirmacionEnviado({ cue, onRecargar }: { cue: string; onRecargar: () => void }): JSX.Element {
  return (
    <div className="reporte-inicial__confirmacion" role="status">
      <p className="reporte-inicial__confirmacion-mensaje"><CircleCheck aria-hidden="true" size={20} />{MENSAJE_GUARDADO}</p>
      <div className="reporte-inicial__confirmacion-acciones">
        <a className="ui-button ui-button--default" href={`/problematicas/parte?cue=${encodeURIComponent(cue)}`}>
          Volver al panel
        </a>
        <Button type="button" variant="secondary" onClick={onRecargar}>
          Cargar otra situación
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
  motivoEnvio,
  onRetry,
  error,
  onVolver,
  onEnviar,
}: {
  lineasResumen: string[]
  asistenciaVigente: 'Sí' | 'No'
  asistenciaPedagogica: AsistenciaSeleccionada
  enviando: boolean
  onCambiarAsistencia: (seleccion: AsistenciaSeleccionada) => void
  estadoEnvio: EstadoEnvio | null
  motivoEnvio: string | null
  onRetry: () => void
  error: string | null
  onVolver: () => void
  onEnviar: () => void
}): JSX.Element {
  return (
    <section className="reporte-inicial__seccion actualizacion-resumen">
      <h2>Resumen</h2>
      <div className="actualizacion-resumen__lista">
        {lineasResumen.map((linea, indice) => <p key={indice}>{linea}</p>)}
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
        <p className="actualizacion-resumen__vigente">Vigente: {asistenciaVigente}</p>
      </fieldset>
      {estadoEnvio ? (
        estadoEnvio === 'pendiente-envio' || estadoEnvio === 'error-servidor'
          ? <EstadoEnvioAviso estado={estadoEnvio} onRetry={onRetry} />
          : <p role="status" aria-live="polite">
              {estadoEnvio === 'error' && motivoEnvio
                ? `${MENSAJES_ESTADO.error}: ${motivoEnvio}`
                : MENSAJES_ESTADO[estadoEnvio]}
            </p>
      ) : null}
      {error ? <p className="reporte-inicial__error" role="alert">{error}</p> : null}
      <div className="actualizacion-resumen__acciones">
        <Button type="button" variant="secondary" onClick={onVolver} disabled={enviando}>
          Volver y corregir
        </Button>
        <Button type="button" onClick={onEnviar} disabled={enviando || estadoEnvio === 'enviando' || estadoEnvio === 'pendiente-envio' || estadoEnvio === 'error-servidor'}>
          {enviando || estadoEnvio === 'enviando' ? 'Enviando…' : estadoEnvio === 'pendiente-envio' || estadoEnvio === 'error-servidor' ? 'Envío pendiente' : 'Enviar'}
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
