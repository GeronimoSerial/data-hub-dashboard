import type { Severidad } from './validacion'
import { parteComunTextosEs } from '@/lib/i18n/diccionarios/grupos/parteComunTextos.es'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

// Spec rediseño §4.3: Crítica es la excepción y se justifica cuando el motivo
// no la sugería. Lista cerrada para poder clasificar; 'otro' admite detalle
// libre porque los casos críticos son pocos y conviene que vengan detallados.
export const JUSTIFICACIONES_CRITICA = ['mas_personas', 'riesgo_fisico', 'se_prolonga', 'combinado', 'otro'] as const
export type JustificacionCritica = (typeof JUSTIFICACIONES_CRITICA)[number]

export function esJustificacionCritica(valor: unknown): valor is JustificacionCritica {
  return typeof valor === 'string' && (JUSTIFICACIONES_CRITICA as readonly string[]).includes(valor)
}

export const ETIQUETA_JUSTIFICACION_CRITICA: Record<JustificacionCritica, string> = parteComunTextosEs.justificacionCritica

/** Etiqueta de la justificación crítica en el idioma `t` (por defecto español). */
export function etiquetaJustificacionCritica(justificacion: JustificacionCritica, t: Diccionario = es): string {
  return t.parteComunTextos.justificacionCritica[justificacion]
}

export function presentarJustificacionCritica(input: {
  categoria?: string
  severidad: unknown
  justificacionCritica?: unknown
  justificacionCriticaDetalle?: unknown
}): { etiqueta: string; detalle: string | null } | null {
  if (input.categoria === 'alumnos' || input.severidad !== 'Crítica' || !esJustificacionCritica(input.justificacionCritica)) return null

  const detalle =
    input.justificacionCritica === 'otro' &&
    typeof input.justificacionCriticaDetalle === 'string' &&
    input.justificacionCriticaDetalle.trim()
      ? input.justificacionCriticaDetalle
      : null
  return { etiqueta: ETIQUETA_JUSTIFICACION_CRITICA[input.justificacionCritica], detalle }
}

export function describirJustificacionCritica(afectacion: {
  categoria?: string
  severidad: Severidad
  justificacionCritica?: string | null
  justificacionCriticaDetalle?: string | null
}): string | null {
  if (afectacion.categoria === 'alumnos' || afectacion.severidad !== 'Crítica' || !afectacion.justificacionCritica) return null
  const codigo = afectacion.justificacionCritica
  const etiqueta = JUSTIFICACIONES_CRITICA.find((valor) => valor === codigo)
  const texto = etiqueta ? ETIQUETA_JUSTIFICACION_CRITICA[etiqueta] : codigo
  return [texto, afectacion.justificacionCriticaDetalle?.trim()].filter(Boolean).join(': ')
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
