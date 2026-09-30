// Briefing determinista del modo Radar (E4). Reglas y plantillas de string,
// sin LLM, sin `Date.now()` y sin aleatoriedad: los mismos inputs producen
// siempre el mismo arreglo exacto de líneas. La variabilidad temporal entra
// sólo por `publicadoEn`, ya resuelto en los runs que recibe.

export interface CoberturaBriefing {
  procesadas: number
  conEvidencia: number
  sinEvidencia: number
}

export interface RunBriefing {
  id: string
  cobertura: CoberturaBriefing | null
  publicadoEn: string
}

export interface ConteosPorNivel {
  actual: Record<string, number>
  anterior: Record<string, number> | null
}

// El motor v0 publica riesgo 'alto' y 'muy_alto'; el briefing cuenta ambos
// como "alto o muy alto".
const NIVELES_ALTO = ['alto', 'muy_alto'] as const

const MAX_LINEAS = 5

function contarAlto(conteos: Record<string, number>): number {
  return NIVELES_ALTO.reduce((total, nivel) => total + (conteos[nivel] ?? 0), 0)
}

/** Fecha en formato YYYY-MM-DD vía UTC: determinista, sin depender del TZ del runner. */
function formatearFechaCorta(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha.toISOString().slice(0, 10)
}

function lineaComparacionAlto(
  actual: Record<string, number>,
  anterior: Record<string, number> | null,
): string {
  if (anterior === null) {
    return 'No hay conteos del corte anterior para comparar.'
  }
  const altoActual = contarAlto(actual)
  const altoAnterior = contarAlto(anterior)
  const diferencia = altoActual - altoAnterior
  if (diferencia > 0) {
    return `Las escuelas en riesgo alto o muy alto subieron de ${altoAnterior} a ${altoActual} (${diferencia} más que en el corte anterior).`
  }
  if (diferencia < 0) {
    return `Las escuelas en riesgo alto o muy alto bajaron de ${altoAnterior} a ${altoActual} (${-diferencia} menos que en el corte anterior).`
  }
  return 'Sin cambios significativos respecto del corte anterior.'
}

function lineaCobertura(
  actual: CoberturaBriefing | null,
  anterior: CoberturaBriefing | null,
): string {
  if (actual === null) return 'Cobertura con evidencia: sin dato.'
  const porcentaje =
    actual.procesadas > 0 ? Math.round((actual.conEvidencia / actual.procesadas) * 100) : 0
  let linea = `Cobertura con evidencia: ${actual.conEvidencia} de ${actual.procesadas} escuelas procesadas (${porcentaje}%).`
  if (anterior !== null && anterior.conEvidencia !== actual.conEvidencia) {
    linea += ` Antes: ${anterior.conEvidencia}.`
  }
  return linea
}

function lineaSinEvidencia(actual: CoberturaBriefing | null): string {
  if (actual === null) return 'Sin evidencia válida: sin dato.'
  return `Sin evidencia válida: ${actual.sinEvidencia} escuelas.`
}

// Nunca exponer `id` (UUID interno): sólo la fecha de publicación, que es lo
// único que un operador necesita para ubicar el corte en el tiempo.
function lineaCorte(runActual: RunBriefing, runAnterior: RunBriefing | null): string {
  let linea = `Corte publicado el ${formatearFechaCorta(runActual.publicadoEn)}.`
  if (runAnterior !== null) {
    linea += ` Corte anterior: ${formatearFechaCorta(runAnterior.publicadoEn)}.`
  }
  return linea
}

/**
 * Genera un briefing de 1 a 5 líneas comparando el corte actual contra el
 * anterior. Sin `runAnterior` es el primer corte disponible: devuelve una única
 * línea explicativa y NUNCA inventa una comparación. Con corte anterior,
 * devuelve cuatro líneas: cambio de escuelas en alto/muy alto, cobertura con
 * evidencia, escuelas sin evidencia y referencia del corte.
 */
export function generarBriefing(
  runActual: RunBriefing,
  runAnterior: RunBriefing | null,
  conteosPorNivel: ConteosPorNivel,
): string[] {
  if (runAnterior === null) {
    return ['Primer resumen del día; todavía no hay un corte anterior para comparar.']
  }

  const coberturaAnterior = conteosPorNivel.anterior === null ? null : runAnterior.cobertura

  const lineas = [
    lineaComparacionAlto(conteosPorNivel.actual, conteosPorNivel.anterior),
    lineaCobertura(runActual.cobertura, coberturaAnterior),
    lineaSinEvidencia(runActual.cobertura),
    lineaCorte(runActual, runAnterior),
  ].filter((linea) => linea.length > 0)

  // El corte siempre produce 4 líneas; el tope de 5 es una red de seguridad por
  // si una regla futura agrega más.
  return lineas.slice(0, MAX_LINEAS)
}
