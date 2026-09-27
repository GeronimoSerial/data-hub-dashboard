// Única fuente de lectura del flag maestro de los jobs batch de OPS1 (ENOS
// 2026/2027): gobierna si `scripts/jobs.mjs` ejecuta trabajo real en
// absoluto. Ninguna otra parte del repo debe leer ENOS_JOBS_ENABLED
// directamente. Leer process.env en cada llamada (sin cachear en el import)
// para que los tests puedan mutar el entorno entre casos — mismo patrón que
// lib/infraestructura/riesgo/flags.ts y
// lib/infraestructura/episodios-derivados/flags.ts.
//
// Deliberadamente independiente de RISK_ENGINE_ENABLED y
// EPISODIOS_DERIVADOS_ENABLED (gate del hallazgo bloqueante del review de
// N1): esos dos son flags de **UI** — RISK_ENGINE_ENABLED gobierna sólo
// /admin/riesgo (lista y detalle) y EPISODIOS_DERIVADOS_ENABLED gobierna sólo
// /admin/episodios-derivados (confirmado con `rg` antes de esta decisión:
// ninguna otra parte del repo los leía antes de que este batch los agregara
// a scripts/jobs.mjs). Los jobs programados (los 3 sync de hazard, las 2
// climatologías, geo-perfiles, calcular-riesgo en modo shadow y
// episodios-derivados) no exponen nada a usuarios finales por sí mismos —
// sólo pueblan tablas internas que esas dos UIs leen — así que deben poder
// correr aunque ambas UIs sigan apagadas por defecto. Acoplar la ejecución de
// datos a un flag de visibilidad de UI habría dejado el batch entero sin
// correr nunca con la configuración por defecto documentada.
//
// Por eso, a diferencia de esos dos flags (apagados por defecto, opt-in),
// este tiene default ENCENDIDO: sólo se apaga seteando exactamente 'false',
// como interruptor de pausa operativa (incidente, ensayo, migración) — ver
// docs/ejecucion-enos/OPS1/runbook-scheduler.md.
const ES_FALSE = 'false'

export function enosJobsEnabled(): boolean {
  return process.env.ENOS_JOBS_ENABLED !== ES_FALSE
}
