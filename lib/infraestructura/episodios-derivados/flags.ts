// Única fuente de lectura del flag de episodios derivados: ninguna otra parte
// del repo debe leer EPISODIOS_DERIVADOS_ENABLED directamente. Leer
// process.env en cada llamada (sin cachear en el import) para que los tests
// puedan mutar el entorno entre casos. Mismo patrón que
// lib/infraestructura/riesgo/flags.ts.
//
// Este flag gobierna SÓLO la UI de solo lectura (lista + detalle) en
// /admin/episodios-derivados. La API (/api/infraestructura/episodios-derivados)
// existe siempre, protegida por ACL de staff; el flag no la oculta. Default
// apagado. No existe ni debe existir ningún botón de crear/cerrar episodio:
// los episodios manuales fueron eliminados del producto (E1-fix2) y este
// batch es puramente derivado/analítico.
const ES_TRUE = 'true'

export function episodiosDerivadosEnabled(): boolean {
  return process.env.EPISODIOS_DERIVADOS_ENABLED === ES_TRUE
}
