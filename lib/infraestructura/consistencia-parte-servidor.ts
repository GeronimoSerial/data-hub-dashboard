import type { CategoriaAfectacion } from './categorias'
import type { JustificacionCritica } from './justificacion-critica'
import {
  evaluarConsistenciaParte,
  type AlcanceSecciones,
  type EstadoClasesConsistencia,
  type EstadoEdificioConsistencia,
  type Regla,
  type RespuestasConsistencia,
} from './consistencia-parte'
import type { Severidad } from './validacion'

// Adaptador del servidor hacia las reglas de consistencia del parte. El body
// trae el estado del edificio, las clases y la asistencia una sola vez para
// todo el envío, pero las reglas se evalúan por afectación nueva: esta función
// arma las respuestas de cada una con la situación común.
// Diferencias intencionales con el cliente: sólo se consulta el primer bloqueo
// (no hay UX de opciones) y no hay vigencia ni asistencia en el cliente de
// actualización. Pendiente: el alcance llega como cantidad, así que nunca es
// "toda la escuela" (sólo afecta advertencias, no bloqueos).

export interface AfectacionNuevaConsistencia {
  categoria: CategoriaAfectacion
  motivoId: string | null
  severidad: Severidad
  justificacionCritica?: JustificacionCritica | undefined
  descripcion?: string | undefined
  seccionesCantidad: number
}

export interface SituacionParteConsistencia {
  estadoEstablecimiento: EstadoEdificioConsistencia | null
  servicioEstado: EstadoClasesConsistencia | null
  asistenciaBrinda: boolean | null
}

export function respuestasAfectacionNueva(
  afectacion: AfectacionNuevaConsistencia,
  situacion: SituacionParteConsistencia,
): RespuestasConsistencia {
  // Alumnos no pregunta por edificio, clases ni asistencia (ver el asistente):
  // esas respuestas no existen para esa categoría, así que no bloquean nada.
  const esAlumnos = afectacion.categoria === 'alumnos'
  const alcance: AlcanceSecciones | null =
    afectacion.seccionesCantidad > 0 ? { tipo: 'algunas', secciones: afectacion.seccionesCantidad } : null
  return {
    categoria: afectacion.categoria,
    motivoId: afectacion.motivoId,
    severidad: afectacion.severidad,
    justificacionCritica: afectacion.justificacionCritica ?? null,
    descripcion: afectacion.descripcion?.trim() ?? '',
    alcance,
    clases: esAlumnos ? null : situacion.servicioEstado,
    edificio: esAlumnos ? null : situacion.estadoEstablecimiento,
    asistenciaBrinda: esAlumnos ? null : situacion.asistenciaBrinda,
    // La vigencia no interviene en ninguna regla bloqueante; sólo en
    // advertencias, que este chequeo nunca devuelve.
    vigencia: null,
  }
}

// Primer bloqueo de todas las afectaciones nuevas del envío, o null si ninguna
// combinación está bloqueada. Las advertencias no cuentan.
export function primerBloqueoParte(
  afectaciones: AfectacionNuevaConsistencia[],
  situacion: SituacionParteConsistencia,
  ahora: Date = new Date(),
): Regla | null {
  for (const afectacion of afectaciones) {
    const { bloqueos } = evaluarConsistenciaParte(respuestasAfectacionNueva(afectacion, situacion), ahora)
    const primero = bloqueos[0]
    if (primero) return primero
  }
  return null
}
