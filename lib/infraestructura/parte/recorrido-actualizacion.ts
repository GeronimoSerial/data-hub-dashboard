import type { CategoriaAfectacion } from '../categorias'
import type { AlumnoElegido } from './instituto-ui'
import type { JustificacionCritica } from '../justificacion-critica'
import { compararRelevancia } from '../relevancia'
import type { EstadoEstablecimiento } from '../trayectoria-tipos'
import type { Severidad } from '../validacion'
import type { ParteActualizacionInput } from '../validacion-trayectoria'

// Spec rediseño §6.2: el recorrido guiado es una máquina de respuestas sin UI.
// Toda decisión (qué falta, qué preguntar en cascada, qué mandar) vive acá,
// testeada; los componentes sólo muestran y recogen respuestas.

export type AspectoCambio = 'gravedad' | 'alcance' | 'clases-edificio'

export interface CambioSituacion {
  aspectos: AspectoCambio[]
  severidad?: Severidad
  justificacionCritica?: JustificacionCritica
  justificacionCriticaDetalle?: string
  secciones?: number[]
  alumnos?: number[]
  /** Sólo institutos superiores: carreras alcanzadas y alumnos elegidos dentro de ellas. */
  carreras?: number[]
  alumnosElegidos?: AlumnoElegido[]
}

export type RespuestaSituacion =
  | { tipo: 'sigue' }
  | { tipo: 'cambio'; cambio: CambioSituacion }
  | { tipo: 'solucionada'; solucionadaEn: string }

export interface SituacionRecorrido {
  id: string
  motivo: string
  categoria: CategoriaAfectacion
  severidad: Severidad
  rigeDesde: string
  creadaEn: string
  causadaPorId: string | null
}

export interface NuevaSituacion {
  causadaPorId: string | null
  motivo: string
  severidad: Severidad
  justificacionCritica?: JustificacionCritica
  justificacionCriticaDetalle?: string
  /** GE: secciones alcanzadas. Ausente en institutos superiores. */
  secciones?: number[]
  alumnos?: number[]
  /** Sólo institutos superiores: carreras alcanzadas. */
  carreras?: number[]
  descripcion?: string
}

export interface EstadoRecorrido {
  respuestas: Record<string, RespuestaSituacion>
  nueva: NuevaSituacion | null
  clasesEdificio: {
    servicioEstado: 'normal' | 'suspendido'
    estadoEstablecimiento: EstadoEstablecimiento
    confirmarInterrupcionTotal: boolean
  } | null
}

export const RECORRIDO_INICIAL: EstadoRecorrido = { respuestas: {}, nueva: null, clasesEdificio: null }

export function ordenarSituaciones(
  situaciones: SituacionRecorrido[],
  estadoEstablecimiento: EstadoEstablecimiento,
): SituacionRecorrido[] {
  return [...situaciones].sort((a, b) =>
    compararRelevancia({ ...a, estadoEstablecimiento }, { ...b, estadoEstablecimiento }),
  )
}

export function situacionesSinRespuesta(situaciones: SituacionRecorrido[], estado: EstadoRecorrido): string[] {
  return situaciones.filter((situacion) => !estado.respuestas[situacion.id]).map((situacion) => situacion.id)
}

function fueSolucionada(estado: EstadoRecorrido, id: string): boolean {
  return estado.respuestas[id]?.tipo === 'solucionada'
}

export function consecuenciasActivas(
  situaciones: SituacionRecorrido[],
  causaId: string,
  estado: EstadoRecorrido,
): SituacionRecorrido[] {
  return situaciones.filter((situacion) => situacion.causadaPorId === causaId && !fueSolucionada(estado, situacion.id))
}

export function situacionConMismoMotivo(
  situaciones: SituacionRecorrido[],
  motivo: string,
  estado: EstadoRecorrido,
): SituacionRecorrido | null {
  return situaciones.find((situacion) => situacion.motivo === motivo && !fueSolucionada(estado, situacion.id)) ?? null
}

export function responder(estado: EstadoRecorrido, id: string, respuesta: RespuestaSituacion): EstadoRecorrido {
  return { ...estado, respuestas: { ...estado.respuestas, [id]: respuesta } }
}

// Institutos: la modificación y el servicio por carrera tienen campos que el
// esquema GE no declara (el servidor los valida según el sistema del CUE).
type ModificacionEnvio = ParteActualizacionInput['afectacionesModificadas'][number] & { carreras?: number[] }
// Institutos: la nueva situación va por carreras y sin `secciones`.
type NuevaEnvio = Omit<ParteActualizacionInput['afectacionesNuevas'][number], 'secciones'> & {
  secciones?: number[]
  carreras?: number[]
}
type ServicioEnvio = {
  estado: 'normal' | 'suspendido'
  alcance: { tipo: 'establecimiento' } | { tipo: 'carrera'; carreras: number[] }
}

type Envio = Pick<
  ParteActualizacionInput,
  | 'afectacionesConfirmadas'
  | 'afectacionesSolucionadas'
  | 'estadoEstablecimiento'
  | 'confirmarInterrupcionTotal'
> & {
  afectacionesModificadas: ModificacionEnvio[]
  afectacionesNuevas: NuevaEnvio[]
  servicioEducativo?: ServicioEnvio
}

/**
 * Carreras que sufren la interrupción de clases de un instituto: las de cada
 * situación que sigue activa (con su alcance nuevo si lo cambió). Sin ninguna,
 * la interrupción vale para todo el catálogo del CUE.
 */
export function carrerasDelServicio<T extends SituacionRecorrido>(
  situaciones: T[],
  estado: EstadoRecorrido,
  carrerasDelCue: number[],
  carrerasDeSituacion: (situacion: T) => number[],
): number[] {
  const ids = new Set<number>(estado.nueva?.carreras ?? [])
  for (const situacion of situaciones) {
    const respuesta = estado.respuestas[situacion.id]
    if (respuesta?.tipo === 'solucionada') continue
    const carreras = respuesta?.tipo === 'cambio' && respuesta.cambio.carreras ? respuesta.cambio.carreras : carrerasDeSituacion(situacion)
    for (const id of carreras) ids.add(id)
  }
  return ids.size > 0 ? [...ids] : carrerasDelCue
}

export function construirEnvio(
  situaciones: SituacionRecorrido[],
  estado: EstadoRecorrido,
  alcanceServicio?: { carreras: number[] },
): Envio {
  const confirmadas: string[] = []
  const modificadas: ModificacionEnvio[] = []
  const solucionadas: Envio['afectacionesSolucionadas'] = []

  for (const situacion of situaciones) {
    const respuesta = estado.respuestas[situacion.id]
    if (!respuesta) continue
    if (respuesta.tipo === 'sigue') confirmadas.push(situacion.id)
    else if (respuesta.tipo === 'solucionada') {
      solucionadas.push({ id: situacion.id, solucionadaEn: respuesta.solucionadaEn })
    } else {
      const modificacion: ModificacionEnvio = { id: situacion.id }
      if (respuesta.cambio.aspectos.includes('gravedad') && respuesta.cambio.severidad) {
        modificacion.severidad = respuesta.cambio.severidad
        if (respuesta.cambio.justificacionCritica) {
          modificacion.justificacionCritica = respuesta.cambio.justificacionCritica
        }
        if (respuesta.cambio.justificacionCriticaDetalle) {
          modificacion.justificacionCriticaDetalle = respuesta.cambio.justificacionCriticaDetalle
        }
      }
      if (respuesta.cambio.aspectos.includes('alcance')) {
        if (respuesta.cambio.secciones) modificacion.secciones = respuesta.cambio.secciones
        if (respuesta.cambio.carreras) modificacion.carreras = respuesta.cambio.carreras
        if (respuesta.cambio.alumnos) modificacion.alumnos = respuesta.cambio.alumnos
      }
      if (Object.keys(modificacion).length > 1) modificadas.push(modificacion)
      else confirmadas.push(situacion.id) // Cambió sólo clases o edificio; la situación permanece igual.
    }
  }

  const nuevas: NuevaEnvio[] = []
  if (estado.nueva) {
    const { causadaPorId, ...resto } = estado.nueva
    nuevas.push({ ...resto, ...(causadaPorId ? { causadaPorId } : {}) })
  }

  const clasesEdificio = estado.clasesEdificio
  return {
    afectacionesConfirmadas: confirmadas,
    afectacionesModificadas: modificadas,
    afectacionesSolucionadas: solucionadas,
    afectacionesNuevas: nuevas,
    servicioEducativo: clasesEdificio
      ? {
        estado: clasesEdificio.servicioEstado,
        alcance: alcanceServicio ? { tipo: 'carrera', carreras: alcanceServicio.carreras } : { tipo: 'establecimiento' },
      }
      : undefined,
    estadoEstablecimiento: clasesEdificio ? { estado: clasesEdificio.estadoEstablecimiento } : undefined,
    confirmarInterrupcionTotal: clasesEdificio ? clasesEdificio.confirmarInterrupcionTotal || undefined : undefined,
  }
}
