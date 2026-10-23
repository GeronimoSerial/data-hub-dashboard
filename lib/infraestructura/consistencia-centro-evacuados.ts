import type { EstadoEstablecimiento } from './trayectoria-tipos'

export const MOTIVO_CENTRO_EVACUADOS_ID = 'centro-evacuados'
export const ESTADO_CENTRO_EVACUADOS = 'centro_evacuados'

/** Minimal persisted affectation fields needed for the report-wide rule. */
export interface AfectacionConsistenciaCentroEvacuados {
  motivoId: string | null
  retiradaEn: string | null
}

/**
 * The caller must resolve an omitted request status against the persisted
 * building status (or the initial-report default) before calling this helper.
 * Supply the complete resulting affectation set, including retired rows.
 */
export interface EntradaConsistenciaCentroEvacuados {
  estadoEstablecimiento: EstadoEstablecimiento
  afectaciones: readonly AfectacionConsistenciaCentroEvacuados[]
}

export type CodigoConsistenciaCentroEvacuados =
  | 'centro-evacuados-requiere-estado'
  | 'estado-centro-evacuados-requiere-motivo'

export type ResultadoConsistenciaCentroEvacuados =
  | { ok: true }
  | { ok: false; codigo: CodigoConsistenciaCentroEvacuados; mensaje: string }

/** Validates the bidirectional rule against the effective report, not a change fragment. */
export function validarConsistenciaCentroEvacuados(
  entrada: EntradaConsistenciaCentroEvacuados,
): ResultadoConsistenciaCentroEvacuados {
  const tieneMotivoActivo = entrada.afectaciones.some(
    (afectacion) =>
      afectacion.retiradaEn === null &&
      afectacion.motivoId === MOTIVO_CENTRO_EVACUADOS_ID,
  )
  const estadoEsCentro = entrada.estadoEstablecimiento === ESTADO_CENTRO_EVACUADOS

  if (tieneMotivoActivo && !estadoEsCentro) {
    return {
      ok: false,
      codigo: 'centro-evacuados-requiere-estado',
      mensaje: 'La afectación «Centro de evacuados» requiere que el estado del edificio sea «Centro de evacuados».',
    }
  }

  if (estadoEsCentro && !tieneMotivoActivo) {
    return {
      ok: false,
      codigo: 'estado-centro-evacuados-requiere-motivo',
      mensaje: 'El estado del edificio «Centro de evacuados» requiere una afectación activa con ese motivo.',
    }
  }

  return { ok: true }
}
