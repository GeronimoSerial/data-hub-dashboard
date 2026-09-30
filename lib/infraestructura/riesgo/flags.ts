// Única fuente de lectura de flags de feature del motor de riesgo: ninguna
// otra parte del repo debe leer RISK_ENGINE_ENABLED, RISK_RADAR_ENABLED,
// AI_BRIEFING_ENABLED ni RISK_MODE; SITUACION_, HAZARD_, SEASONAL_ y REPLAY_
// también viven aquí. listarFlagsOperativas() enumera los flags de /admin/operacion.
import { episodiosDerivadosEnabled } from '@/lib/infraestructura/episodios-derivados/flags'
import { enosJobsEnabled } from '@/lib/infraestructura/jobs/flags'

const ES_TRUE = 'true'
const ES_ADVISORY = 'advisory'

function esTrue(valor: string | undefined): boolean {
  return valor === ES_TRUE
}

export function riskEngineEnabled(): boolean {
  return esTrue(process.env.RISK_ENGINE_ENABLED)
}

export function riskRadarEnabled(): boolean {
  return esTrue(process.env.RISK_RADAR_ENABLED)
}

export function aiBriefingEnabled(): boolean {
  return esTrue(process.env.AI_BRIEFING_ENABLED)
}

// Gobierna sólo la UI nueva de E2 (ficha territorial + vista técnica de
// fuentes). Las APIs /fuentes, /peligro y /geo-perfiles/:cueAnexo existen
// siempre, protegidas por ACL; este flag no las oculta, sólo el frontend.
export function hazardContextEnabled(): boolean {
  return esTrue(process.env.HAZARD_CONTEXT_ENABLED)
}

// Gobierna sólo la UI de la tarjeta "Perspectiva 30-90 días" (tendencia ENOS
// regional, Open-Meteo Seasonal) dentro del panel de explicación del Radar.
// Apagado por defecto (Off/E5+, capa opcional — plan-implementacion §9.3).
// La API /tendencia-estacional existe siempre, protegida por ACL staff; este
// flag sólo oculta el frontend, mismo criterio que hazardContextEnabled.
export function seasonalEnabled(): boolean {
  return esTrue(process.env.SEASONAL_ENABLED)
}

// Gobierna sólo la UI del modo "Replay" del mapa de infraestructura (batch
// E7c): el conmutador de modo, el panel de línea de tiempo y las capas del
// cuadro reproducido. Apagado por defecto. Las APIs de sólo lectura
// /api/infraestructura/replay y /replay/export (batch E7b) existen siempre,
// protegidas por ACL staff; este flag sólo oculta el frontend, mismo criterio
// que hazardContextEnabled/seasonalEnabled.
export function replayEnabled(): boolean {
  return esTrue(process.env.REPLAY_ENABLED)
}

// Modo de operación del motor: 'advisory' solo si el valor es exactamente
// 'advisory'; cualquier otro valor (incluido undefined o inválido) cae al
// default seguro 'shadow'. No lanza excepción ante valor inválido.
export function riskMode(): 'shadow' | 'advisory' {
  return process.env.RISK_MODE === ES_ADVISORY ? 'advisory' : 'shadow'
}

// Gobierna sólo la UI nueva del Centro de Situación (E5, ruta /situacion) y
// nada más: las APIs /api/infraestructura/situacion* existen siempre,
// protegidas por adminPageGate/ACL, este flag sólo oculta el frontend. Apagado
// por defecto, como todos los flags de este módulo.
export function situacionEnabled(): boolean {
  return esTrue(process.env.SITUACION_ENABLED)
}

/** Enumera los flags operativos mostrados en /admin/operacion. */
export function listarFlagsOperativas(): Array<{ nombre: string; valor: string }> {
  return [
    { nombre: 'RISK_ENGINE_ENABLED', valor: String(riskEngineEnabled()) },
    { nombre: 'RISK_RADAR_ENABLED', valor: String(riskRadarEnabled()) },
    { nombre: 'AI_BRIEFING_ENABLED', valor: String(aiBriefingEnabled()) },
    { nombre: 'HAZARD_CONTEXT_ENABLED', valor: String(hazardContextEnabled()) },
    { nombre: 'SEASONAL_ENABLED', valor: String(seasonalEnabled()) },
    { nombre: 'REPLAY_ENABLED', valor: String(replayEnabled()) },
    { nombre: 'RISK_MODE', valor: riskMode() },
    { nombre: 'SITUACION_ENABLED', valor: String(situacionEnabled()) },
    { nombre: 'EPISODIOS_DERIVADOS_ENABLED', valor: String(episodiosDerivadosEnabled()) },
    { nombre: 'ENOS_JOBS_ENABLED', valor: String(enosJobsEnabled()) },
  ]
}
