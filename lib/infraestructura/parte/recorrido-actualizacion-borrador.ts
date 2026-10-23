import type { EstadoRecorrido } from './recorrido-actualizacion'
import { esModalidadAsistenciaPedagogica, type ModalidadAsistenciaPedagogica } from '../trayectoria-tipos'

export type EtapaActualizacion = 'entrada' | { revisar: number } | 'nuevo' | 'resumen'
export type AsistenciaSeleccionada = { brinda: '' | 'si' | 'no'; modalidades: ModalidadAsistenciaPedagogica[] }

export interface BorradorRecorridoActualizacion {
  generacion: string
  etapa: EtapaActualizacion
  recorrido: EstadoRecorrido
  asistenciaPedagogica: AsistenciaSeleccionada
  idsSituaciones: string[]
}

function esEtapa(valor: unknown): valor is EtapaActualizacion {
  return valor === 'entrada' || valor === 'nuevo' || valor === 'resumen' ||
    (typeof valor === 'object' && valor !== null && Number.isInteger((valor as { revisar?: unknown }).revisar) && (valor as { revisar: number }).revisar >= 0)
}

function esRespuesta(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false
  const respuesta = valor as Record<string, unknown>
  if (respuesta.tipo === 'sigue') return true
  if (respuesta.tipo === 'solucionada') return typeof respuesta.solucionadaEn === 'string'
  if (respuesta.tipo !== 'cambio' || typeof respuesta.cambio !== 'object' || respuesta.cambio === null) return false
  const cambio = respuesta.cambio as Record<string, unknown>
  if (!Array.isArray(cambio.aspectos) || !cambio.aspectos.every((a) => ['gravedad', 'alcance', 'clases-edificio'].includes(String(a)))) return false
  if (cambio.severidad !== undefined && !['Baja', 'Media', 'Alta', 'Crítica'].includes(String(cambio.severidad))) return false
  if (cambio.secciones !== undefined && (!Array.isArray(cambio.secciones) || !cambio.secciones.every((n) => typeof n === 'number'))) return false
  if (cambio.alumnos !== undefined && (!Array.isArray(cambio.alumnos) || !cambio.alumnos.every((n) => typeof n === 'number'))) return false
  return true
}

function esNuevaSituacion(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false
  const nueva = valor as Record<string, unknown>
  return typeof nueva.motivo === 'string' && (typeof nueva.severidad === 'string' || (nueva.severidad === undefined && Array.isArray(nueva.alumnos))) &&
    Array.isArray(nueva.secciones) && nueva.secciones.every((n) => typeof n === 'number') &&
    (nueva.alumnos === undefined || (Array.isArray(nueva.alumnos) && nueva.alumnos.every((n) => typeof n === 'number'))) &&
    (nueva.causadaPorId === null || typeof nueva.causadaPorId === 'string')
}

function esClasesEdificio(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false
  const clases = valor as Record<string, unknown>
  return ['normal', 'suspendido'].includes(String(clases.servicioEstado)) &&
    ['habitual', 'parcial', 'evacuado', 'centro_evacuados', 'sin_clases'].includes(String(clases.estadoEstablecimiento)) &&
    typeof clases.confirmarInterrupcionTotal === 'boolean'
}

export function esBorradorRecorridoActualizacion(valor: unknown): valor is BorradorRecorridoActualizacion {
  if (typeof valor !== 'object' || valor === null) return false
  const borrador = valor as Record<string, unknown>
  if (typeof borrador.generacion !== 'string' || !esEtapa(borrador.etapa)) return false
  if (!Array.isArray(borrador.idsSituaciones) || !borrador.idsSituaciones.every((id) => typeof id === 'string')) return false
  if (typeof borrador.recorrido !== 'object' || borrador.recorrido === null) return false
  const recorrido = borrador.recorrido as Record<string, unknown>
  if (typeof recorrido.respuestas !== 'object' || recorrido.respuestas === null || Array.isArray(recorrido.respuestas)) return false
  if (!Object.values(recorrido.respuestas).every(esRespuesta)) return false
  if (!Object.prototype.hasOwnProperty.call(recorrido, 'nueva') || (recorrido.nueva !== null && !esNuevaSituacion(recorrido.nueva))) return false
  if (!Object.prototype.hasOwnProperty.call(recorrido, 'clasesEdificio') || (recorrido.clasesEdificio !== null && !esClasesEdificio(recorrido.clasesEdificio))) return false
  const asistencia = borrador.asistenciaPedagogica as Record<string, unknown> | null
  return !!asistencia && ['si', 'no', ''].includes(String(asistencia.brinda)) &&
    Array.isArray(asistencia.modalidades) && asistencia.modalidades.every(esModalidadAsistenciaPedagogica)
}

export function coincidenIdsSituaciones(guardados: string[], vigentes: string[]): boolean {
  return guardados.length === vigentes.length && [...guardados].sort().every((id, indice) => id === [...vigentes].sort()[indice])
}

export function crearAsistenciaSeleccionada(brinda: '' | 'si' | 'no', modalidades: AsistenciaSeleccionada['modalidades']) {
  if (brinda === '') return undefined
  return { brinda: brinda === 'si', modalidades: brinda === 'si' ? modalidades : [] }
}

export function asistenciaCoincide(vigente: { brinda: boolean; modalidades: string[] } | null | undefined, seleccionada: { brinda: boolean; modalidades: string[] } | undefined): boolean {
  if (!seleccionada) return !vigente
  if (!vigente || vigente.brinda !== seleccionada.brinda) return false
  return [...vigente.modalidades].sort().join('|') === [...seleccionada.modalidades].sort().join('|')
}
