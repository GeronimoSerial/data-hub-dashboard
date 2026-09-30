import type { BriefingPersistido } from './repositorio'

export interface BriefingDto {
  id: string
  corteId: string
  modelo: string
  versionPrompt: string
  textoFinal: string
  fuente: 'ia' | 'plantilla'
  motivoFallback: string | null
  tokensEntrada: number | null
  tokensSalida: number | null
  costoUsd: number | null
  latenciaMs: number | null
  creadaEn: string
  salidaIa: Record<string, unknown> | null
}

// Whitelist explícita: nunca se serializa la fila completa. 'parametros',
// 'validacion' y 'auditoriaFallback' son internos. 'salidaIa' sólo se expone
// cuando la fuente es 'ia' (pasó la validación de trazabilidad); si la fuente
// es 'plantilla' nunca se manda el texto del modelo, sin importar qué haya
// quedado en la fila.
export function aDtoPublico(briefing: BriefingPersistido): BriefingDto {
  return {
    id: briefing.id,
    corteId: briefing.corteId,
    modelo: briefing.modelo,
    versionPrompt: briefing.versionPrompt,
    textoFinal: briefing.textoFinal,
    fuente: briefing.fuente,
    motivoFallback: briefing.motivoFallback,
    tokensEntrada: briefing.tokensEntrada,
    tokensSalida: briefing.tokensSalida,
    costoUsd: briefing.costoUsd,
    latenciaMs: briefing.latenciaMs,
    creadaEn: briefing.creadaEn,
    salidaIa: briefing.fuente === 'ia' ? briefing.salidaIa : null,
  }
}
