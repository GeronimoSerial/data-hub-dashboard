import type { Severidad } from './validacion'

// Spec rediseño §4.3: Crítica es la excepción y se justifica cuando el motivo
// no la sugería. Lista cerrada para poder clasificar; 'otro' admite detalle
// libre porque los casos críticos son pocos y conviene que vengan detallados.
export const JUSTIFICACIONES_CRITICA = ['mas_personas', 'riesgo_fisico', 'se_prolonga', 'combinado', 'otro'] as const
export type JustificacionCritica = (typeof JUSTIFICACIONES_CRITICA)[number]

export function esJustificacionCritica(valor: unknown): valor is JustificacionCritica {
  return typeof valor === 'string' && (JUSTIFICACIONES_CRITICA as readonly string[]).includes(valor)
}

export const ETIQUETA_JUSTIFICACION_CRITICA: Record<JustificacionCritica, string> = {
  mas_personas: 'Afecta a más personas o secciones de lo habitual',
  riesgo_fisico: 'Hay riesgo eléctrico, estructural o sanitario',
  se_prolonga: 'Se prolonga en el tiempo o no tiene fecha de solución',
  combinado: 'Se combina con otra situación activa',
  otro: 'Otro',
}

export function presentarJustificacionCritica(input: {
  severidad: unknown
  justificacionCritica?: unknown
  justificacionCriticaDetalle?: unknown
}): { etiqueta: string; detalle: string | null } | null {
  if (input.severidad !== 'Crítica' || !esJustificacionCritica(input.justificacionCritica)) return null

  const detalle =
    input.justificacionCritica === 'otro' &&
    typeof input.justificacionCriticaDetalle === 'string' &&
    input.justificacionCriticaDetalle.trim()
      ? input.justificacionCriticaDetalle
      : null
  return { etiqueta: ETIQUETA_JUSTIFICACION_CRITICA[input.justificacionCritica], detalle }
}

export function requiereJustificacionCritica(severidad: Severidad, sugerida: Severidad | null | undefined): boolean {
  return severidad === 'Crítica' && sugerida !== 'Crítica'
}

export function validarJustificacionCritica(input: {
  severidad: Severidad
  sugerida: Severidad | null | undefined
  justificacion?: JustificacionCritica
  detalle?: string
}): { ok: true } | { ok: false; error: string } {
  const requiere = requiereJustificacionCritica(input.severidad, input.sugerida)
  if (!requiere) {
    if (input.justificacion !== undefined || input.detalle !== undefined) {
      return { ok: false, error: 'La justificación sólo corresponde a una situación crítica no sugerida' }
    }
    return { ok: true }
  }
  if (input.justificacion === undefined) return { ok: false, error: 'Indique por qué la situación es crítica' }
  if (input.justificacion === 'otro' && !input.detalle) return { ok: false, error: 'Describa por qué la situación es crítica' }
  if (input.justificacion !== 'otro' && input.detalle !== undefined) {
    return { ok: false, error: 'El detalle sólo corresponde a la opción "Otro"' }
  }
  return { ok: true }
}
