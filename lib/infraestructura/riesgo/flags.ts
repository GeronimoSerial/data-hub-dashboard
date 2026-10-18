// Única fuente de lectura de flags de feature del motor de riesgo: ninguna
// otra parte del repo debe leer RISK_ENGINE_ENABLED, RISK_RADAR_ENABLED,
// ni RISK_MODE; SITUACION_, HAZARD_, SEASONAL_ y RIESGO_REGLAS_MOTOR
// también viven aquí. listarFlagsOperativas() enumera los flags de /admin/operacion.
import { episodiosDerivadosEnabled } from '@/lib/infraestructura/episodios-derivados/flags'
import { enosJobsEnabled } from '@/lib/infraestructura/jobs/flags'
import type { ReglasMotor } from './motor/config'

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

// Apagado por defecto: habilita el job de veredicto diario asistido por IA.
export function aiVeredictoEnabled(): boolean {
  return esTrue(process.env.AI_VEREDICTO_ENABLED)
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

// Reglas del job operativo calcular-riesgo (T11, docs/motor-v0.4/promocion.md):
// 'v0.4' por defecto (motor promovido); sólo el valor exacto 'v0.3' activa el
// rollback de un ciclo a motor-v0.3. Cualquier otro valor cae a 'v0.4'. Flag
// transitorio: se retira tras verificar la promoción.
export function riesgoReglasMotor(): ReglasMotor {
  return process.env.RIESGO_REGLAS_MOTOR?.trim() === 'v0.3' ? 'v0.3' : 'v0.4'
}

/** Enumera los flags operativos mostrados en /admin/operacion. */
export function listarFlagsOperativas(): Array<{ nombre: string; valor: string }> {
  return [
    { nombre: 'RISK_ENGINE_ENABLED', valor: String(riskEngineEnabled()) },
    { nombre: 'RISK_RADAR_ENABLED', valor: String(riskRadarEnabled()) },
    { nombre: 'AI_VEREDICTO_ENABLED', valor: String(aiVeredictoEnabled()) },
    { nombre: 'HAZARD_CONTEXT_ENABLED', valor: String(hazardContextEnabled()) },
    { nombre: 'SEASONAL_ENABLED', valor: String(seasonalEnabled()) },
    { nombre: 'RISK_MODE', valor: riskMode() },
    { nombre: 'SITUACION_ENABLED', valor: String(situacionEnabled()) },
    { nombre: 'EPISODIOS_DERIVADOS_ENABLED', valor: String(episodiosDerivadosEnabled()) },
    { nombre: 'ENOS_JOBS_ENABLED', valor: String(enosJobsEnabled()) },
    { nombre: 'RIESGO_REGLAS_MOTOR', valor: riesgoReglasMotor() },
  ]
}
