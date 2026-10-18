import {
  alcanceDeSecciones,
  evaluarConsistenciaParte,
  type AlcanceSecciones,
  type EstadoClasesConsistencia,
  type EstadoEdificioConsistencia,
  type RespuestasConsistencia,
} from '@/lib/infraestructura/consistencia-parte'
import type { CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import type { JustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import type { Severidad } from '@/lib/infraestructura/validacion'

export interface DatosSituacionConsistencia {
  categoria: CategoriaAfectacion | null
  motivoId: string | null
  severidad: Severidad | null
  justificacionCritica?: JustificacionCritica | null
  descripcion?: string
  alcance: AlcanceSecciones | null
  clases: EstadoClasesConsistencia | null
  edificio: EstadoEdificioConsistencia | null
}

// Respuestas del módulo de consistencia armadas desde el estado de la
// actualización. Asistencia y vigencia no aplican a una actualización.
export function respuestasDeSituacion(datos: DatosSituacionConsistencia): RespuestasConsistencia {
  return {
    categoria: datos.categoria,
    motivoId: datos.motivoId,
    severidad: datos.severidad,
    justificacionCritica: datos.justificacionCritica ?? null,
    descripcion: datos.descripcion ?? '',
    alcance: datos.alcance,
    clases: datos.clases,
    edificio: datos.edificio,
    asistenciaBrinda: null,
    vigencia: null,
  }
}

// Situación nueva: misma exención que el servidor (consistencia-parte-servidor),
// alumnos no pregunta por edificio ni clases.
export function respuestasNuevaDeActualizacion(datos: DatosSituacionConsistencia): RespuestasConsistencia {
  const esAlumnos = datos.categoria === 'alumnos'
  return respuestasDeSituacion({
    ...datos,
    clases: esAlumnos ? null : datos.clases,
    edificio: esAlumnos ? null : datos.edificio,
  })
}

// Mensajes de bloqueo de una situación que esta actualización toca. La
// descripción sólo se exige en situaciones nuevas: las existentes no la
// editan aquí.
export function mensajesDeBloqueo(respuestas: RespuestasConsistencia, { descripcion }: { descripcion: boolean }): string[] {
  return evaluarConsistenciaParte(respuestas).bloqueos
    .filter((regla) => descripcion || regla.campo !== 'descripcion')
    .map((regla) => regla.mensaje)
}

export function alcanceDe(secciones: number[] | undefined, seccionesDeLaEscuela: number[]): AlcanceSecciones | null {
  return alcanceDeSecciones(secciones ?? [], seccionesDeLaEscuela)
}
