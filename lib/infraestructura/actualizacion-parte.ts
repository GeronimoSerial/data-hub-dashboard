// Puente entre el estado de edición del formulario de actualización
// (spec §8) y el motor de diffing puro del batch 2 (movimiento-diff.ts).
// Arma la fotografía "después" a partir del estado en pantalla para poder
// mostrar el resumen de cambios (spec §13) ANTES de guardar, sin esperar la
// respuesta del servidor — el servidor vuelve a calcular el mismo diff de
// forma independiente al persistir (route.ts), así que esta capa es sólo
// una previsualización, nunca la fuente de verdad.
//
// Framework-free: no React, no fetch. Los componentes
// (actualizacion-form.tsx) son los únicos que le pasan estado de React.
import type { AfectacionBorrador } from '@/components/infraestructura/afectacion-borrador'
import type { AfectacionVigente } from '@/components/infraestructura/estado-actual-textos'
import type { TurnoContexto } from './contexto'
import type {
  Afectacion,
  AfectacionAlcanceSeccion,
  EstadoEstablecimiento,
  ParteSnapshot,
  ServicioAlcance,
  ServicioAlcanceTipo,
  ServicioEstado,
} from './trayectoria-tipos'

// Una afectación en el formulario de actualización: puede venir de una fila
// vigente (origenId !== null) o ser nueva (origenId === null, igual que en
// el reporte inicial). `retirada` marca una afectación vigente que el
// director decidió sacar del parte (spec §8 "retirar una afectación
// existente"): se mantiene en el estado de React para poder deshacer, pero
// no entra en el snapshot "después" ni se envía como nueva/modificada.
export interface AfectacionActualizable extends AfectacionBorrador {
  origenId: string | null
  retirada: boolean
}

export function afectacionVigenteABorrador(vigente: AfectacionVigente): AfectacionActualizable {
  return {
    clientId: vigente.id,
    origenId: vigente.id,
    retirada: false,
    categoria: vigente.categoria,
    motivo: vigente.motivo,
    severidad: vigente.severidad,
    secciones: vigente.secciones.map((s) => s.geSectionId),
    alumnos: vigente.secciones.flatMap((s) =>
      s.seccionCompleta ? [] : s.alumnos.map((a) => a.gePersonId),
    ),
    descripcion: vigente.descripcion ?? '',
  }
}

// Snapshot "antes" (spec §13, §15) directamente desde la respuesta de
// GET /api/problematicas/parte, sin pasar por el formulario: usa
// seccionCompleta/alumnos tal cual los entrega la API, así que es una
// fotografía exacta del estado vigente, no una reconstrucción.
export function snapshotAntesDeVigente(datos: {
  parte: { estadoEstablecimiento: EstadoEstablecimiento } | null
  afectaciones?: AfectacionVigente[]
  servicio?: { alcanceVigente: ServicioAlcance[] }
}): ParteSnapshot {
  return {
    estadoEstablecimiento: datos.parte?.estadoEstablecimiento ?? 'habitual',
    afectaciones: (datos.afectaciones ?? []).map(
      (v): Afectacion => ({
        id: v.id,
        parteId: '',
        motivo: v.motivo,
        categoria: v.categoria,
        severidad: v.severidad,
        descripcion: v.descripcion,
        rigeDesde: v.rigeDesde,
        creadaEn: '',
        retiradaEn: null,
        secciones: v.secciones.map((s) => ({
          geSectionId: s.geSectionId,
          seccionCompleta: s.seccionCompleta,
          alumnos: s.alumnos.map((a) => a.gePersonId),
        })),
      }),
    ),
    servicioAlcance: datos.servicio?.alcanceVigente ?? [],
  }
}

// Misma resolución "sección seleccionada sin alumnos explícitos = sección
// completa" que secciones-selector.tsx (ver efectivoDeSeccion ahí): una
// sección completa lleva el roster entero (contra `turnos`, el mismo
// contexto del corte vigente que ya usa el resto del formulario) para que
// el diff cuente los mismos alumnos que va a contar el servidor al releer
// la matrícula real.
function alumnosEfectivosDeSeccion(
  geSectionId: number,
  alumnosExplicitos: number[],
  turnos: TurnoContexto[],
): { seccionCompleta: boolean; alumnos: number[] } {
  const seccion = turnos
    .flatMap((t) => t.niveles.flatMap((n) => n.secciones))
    .find((s) => s.geSectionId === geSectionId)
  const idsSeccion = seccion ? seccion.alumnos.map((a) => a.gePersonId) : []
  const explicitos = idsSeccion.filter((id) => alumnosExplicitos.includes(id))
  if (explicitos.length > 0) return { seccionCompleta: false, alumnos: explicitos }
  return { seccionCompleta: true, alumnos: idsSeccion }
}

function seccionesDeAfectacion(
  borrador: AfectacionBorrador,
  turnos: TurnoContexto[],
): AfectacionAlcanceSeccion[] {
  return borrador.secciones.map((geSectionId) => {
    const { seccionCompleta, alumnos } = alumnosEfectivosDeSeccion(geSectionId, borrador.alumnos, turnos)
    return { geSectionId, seccionCompleta, alumnos }
  })
}

// Afectación "después" a partir de un borrador en pantalla. Los campos que
// diffParte no inspecciona (parteId, creadaEn, rigeDesde, retiradaEn) llevan
// valores de relleno: esta función nunca persiste nada, es sólo el insumo
// de diffParte para la previsualización.
function borradorAAfectacion(borrador: AfectacionActualizable, turnos: TurnoContexto[]): Afectacion {
  return {
    id: borrador.origenId ?? borrador.clientId,
    parteId: '',
    motivo: borrador.motivo,
    categoria: borrador.categoria || 'establecimiento',
    severidad: borrador.severidad || 'Baja',
    descripcion: borrador.descripcion.trim() || null,
    rigeDesde: '',
    creadaEn: '',
    retiradaEn: null,
    secciones: seccionesDeAfectacion(borrador, turnos),
  }
}

export interface ServicioSeleccionado {
  estado: ServicioEstado
  alcance:
    | { tipo: 'establecimiento' }
    | { tipo: 'turno'; turnos: string[] }
    | { tipo: 'seccion'; secciones: number[] }
}

// Alcance vigente + la selección en pantalla combinados en un solo conjunto
// de filas "vigentes" para el snapshot "después": misma clave que
// claveServicioAlcance (tipo + referenciaId, ver vigencia-alcance.ts). La
// selección del director reemplaza cualquier fila vigente de la misma clave
// y agrega una fila nueva por cada turno/sección elegido — mismo criterio
// que aplica el route handler al escribir infra_servicio_alcance. Cuando no
// hay selección (el director no tocó el servicio en este envío), el alcance
// vigente se devuelve intacto y no genera diff.
function servicioAlcanceDespues(
  vigente: ServicioAlcance[],
  seleccion: ServicioSeleccionado | null,
): ServicioAlcance[] {
  if (!seleccion) return vigente

  const claves: Array<{ tipo: ServicioAlcanceTipo; referenciaId: string | null; etiqueta?: string }> = []
  if (seleccion.alcance.tipo === 'establecimiento') {
    claves.push({ tipo: 'establecimiento', referenciaId: null })
  } else if (seleccion.alcance.tipo === 'turno') {
    for (const turno of seleccion.alcance.turnos) {
      claves.push({ tipo: 'turno', referenciaId: turno, etiqueta: turno })
    }
  } else {
    for (const geSectionId of seleccion.alcance.secciones) {
      claves.push({ tipo: 'seccion', referenciaId: String(geSectionId) })
    }
  }

  const clavesTocadas = new Set(claves.map((c) => `${c.tipo}:${c.referenciaId ?? ''}`))
  const sinTocar = vigente.filter((fila) => !clavesTocadas.has(`${fila.tipo}:${fila.referenciaId ?? ''}`))

  const nuevas: ServicioAlcance[] = claves.map((clave) => ({
    id: `${clave.tipo}:${clave.referenciaId ?? ''}`,
    parteId: '',
    tipo: clave.tipo,
    referenciaId: clave.referenciaId,
    estado: seleccion.estado,
    creadaEn: '',
    rigeDesde: '',
    retiradaEn: null,
    etiqueta: clave.etiqueta,
  }))

  return [...sinTocar, ...nuevas]
}

export interface SnapshotDespuesParams {
  estadoEstablecimientoVigente: EstadoEstablecimiento
  estadoEstablecimientoSeleccionado: EstadoEstablecimiento | ''
  servicioAlcanceVigente: ServicioAlcance[]
  servicioSeleccionado: ServicioSeleccionado | null
  afectaciones: AfectacionActualizable[]
  turnos: TurnoContexto[]
}

// Snapshot "después" (spec §13): las afectaciones vigentes que no se
// retiraron, con los cambios en pantalla aplicados, más las nuevas; el
// servicio educativo y la situación del establecimiento reflejan la
// selección del director si la tocó, o se conservan si no.
export function snapshotDespuesDeFormulario(params: SnapshotDespuesParams): ParteSnapshot {
  return {
    estadoEstablecimiento: params.estadoEstablecimientoSeleccionado || params.estadoEstablecimientoVigente,
    afectaciones: params.afectaciones.filter((a) => !a.retirada).map((a) => borradorAAfectacion(a, params.turnos)),
    servicioAlcance: servicioAlcanceDespues(params.servicioAlcanceVigente, params.servicioSeleccionado),
  }
}

function listasIguales(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const ordenadoA = [...a].sort((x, y) => x - y)
  const ordenadoB = [...b].sort((x, y) => x - y)
  return ordenadoA.every((v, i) => v === ordenadoB[i])
}

export interface AfectacionModificacionPayload {
  id: string
  severidad?: string
  descripcion?: string
  secciones?: number[]
  alumnos?: number[]
}

export interface PayloadActualizacion {
  cue: string
  idempotencyKey: string
  rigeDesde: string
  afectacionesNuevas: Array<{
    motivo: string
    severidad: string
    descripcion?: string
    secciones: number[]
    alumnos?: number[]
  }>
  afectacionesModificadas: AfectacionModificacionPayload[]
  afectacionesRetiradas: string[]
  servicioEducativo?: { estado: ServicioEstado; alcance: ServicioSeleccionado['alcance'] }
  estadoEstablecimiento?: { estado: EstadoEstablecimiento }
}

// Arma el body de POST /api/problematicas/parte (mismo contrato que
// parteActualizacionInputSchema en validacion-trayectoria.ts) a partir del
// estado en pantalla. Sólo incluye una afectación en `afectacionesModificadas`
// cuando realmente cambió algo respecto de la fila vigente (`vigentes`):
// evita reescribir secciones/alumnos de afectaciones que el director no
// tocó, y hace que el resumen que arma movimiento-diff en el servidor
// coincida con lo que se le mostró al director en la pantalla de
// confirmación (spec §13).
export function construirPayloadActualizacion(params: {
  cue: string
  idempotencyKey: string
  rigeDesde: string
  afectaciones: AfectacionActualizable[]
  vigentes: AfectacionVigente[]
  servicioSeleccionado: ServicioSeleccionado | null
  estadoEstablecimientoSeleccionado: EstadoEstablecimiento | ''
}): PayloadActualizacion {
  const vigentesPorId = new Map(params.vigentes.map((v) => [v.id, v]))

  const nuevas = params.afectaciones.filter((a) => a.origenId === null && !a.retirada)
  const retiradas = params.afectaciones
    .filter((a) => a.origenId !== null && a.retirada)
    .map((a) => a.origenId as string)

  const modificadas: AfectacionModificacionPayload[] = []

  for (const a of params.afectaciones) {
    if (a.origenId === null || a.retirada) continue
    const original = vigentesPorId.get(a.origenId)
    if (!original) continue

    const cambios: AfectacionModificacionPayload = { id: a.origenId }
    let huboCambio = false

    if (a.severidad && a.severidad !== original.severidad) {
      cambios.severidad = a.severidad
      huboCambio = true
    }

    const descripcionOriginal = original.descripcion ?? ''
    if (a.descripcion.trim() !== descripcionOriginal) {
      cambios.descripcion = a.descripcion.trim()
      huboCambio = true
    }

    const seccionesOriginales = original.secciones.map((s) => s.geSectionId)
    const alumnosOriginales = original.secciones.flatMap((s) =>
      s.seccionCompleta ? [] : s.alumnos.map((al) => al.gePersonId),
    )
    const alcanceCambio =
      !listasIguales(a.secciones, seccionesOriginales) || !listasIguales(a.alumnos, alumnosOriginales)
    if (alcanceCambio) {
      cambios.secciones = a.secciones
      cambios.alumnos = a.alumnos
      huboCambio = true
    }

    if (huboCambio) modificadas.push(cambios)
  }

  return {
    cue: params.cue,
    idempotencyKey: params.idempotencyKey,
    rigeDesde: params.rigeDesde,
    afectacionesNuevas: nuevas.map((a) => ({
      motivo: a.motivo,
      severidad: a.severidad as string,
      descripcion: a.descripcion.trim() || undefined,
      secciones: a.secciones,
      alumnos: a.alumnos.length > 0 ? a.alumnos : undefined,
    })),
    afectacionesModificadas: modificadas,
    afectacionesRetiradas: retiradas,
    servicioEducativo:
      params.servicioSeleccionado === null
        ? undefined
        : { estado: params.servicioSeleccionado.estado, alcance: params.servicioSeleccionado.alcance },
    estadoEstablecimiento:
      params.estadoEstablecimientoSeleccionado === ''
        ? undefined
        : { estado: params.estadoEstablecimientoSeleccionado },
  }
}