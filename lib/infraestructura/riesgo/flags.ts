// Única fuente de lectura de flags de feature del motor de riesgo: ninguna
// otra parte del repo debe leer RISK_ENGINE_ENABLED, RISK_RADAR_ENABLED,
// AI_BRIEFING_ENABLED ni RISK_MODE (verificado con rg antes de crear este
// módulo). Leer process.env en cada llamada (sin cachear en el import) para
// que los tests puedan mutar el entorno entre casos.
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