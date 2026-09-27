// Métrica de anticipación del replay temporal (batch E7b, decisión de N1 #4
// del brief). Pura y determinista: no toca la DB, no hace fetch, no usa
// `new Date()` implícito. Todo dato llega ya resuelto por el caller (mismo
// criterio que lib/infraestructura/episodios-derivados/regla.ts) — el script
// scripts/evaluar-replay.mjs (o el módulo que invoque) es quien consulta la
// base y arma las señales antes de llamar acá.
//
// Sesgo declarado (documentar SIEMPRE junto al resultado, no ocultarlo): hoy
// casi no hay historia real de riesgo/peligro en producción, así que con
// datos de desarrollo la salida esperada es MAYORMENTE "no evaluable". Este
// módulo no intenta compensar esa escasez con supuestos: reporta el hueco.
//
// Principio de "sin reporte nunca es negativo": una escuela o un episodio sin
// evidencia de riesgo calculada (NO evaluado, no "evaluado y en verde") se
// excluye del denominador de sus tasas, nunca se cuenta como si hubiera
// fallado la anticipación.

const MS_HORA = 3_600_000

// Niveles de alerta "alta" del motor de riesgo (infra_risk_snapshot.nivelRiesgo)
// y de la Capa 1 de peligro (lib/infraestructura/riesgo/peligro/nivel.ts).
const NIVELES_RIESGO_ALTO = new Set(['alto', 'muy_alto'])
const NIVELES_PELIGRO_ALTO = new Set(['naranja', 'rojo'])

export interface SenalAlerta {
  nivel: string
  emitidoEn: string // ISO 8601 UTC
}

export interface EntradaAnticipacionEpisodio {
  episodioId: string
  departamento: string
  // Primera afectación confirmada del episodio (infra_episodio_derivado.inicioEn
  // o el primeraAfectacionEn más temprano de sus miembros).
  primeraAfectacionEn: string
  // Desde cuándo hay AL MENOS UNA señal (de riesgo o de peligro) calculada
  // para esta unidad territorial, según lo que el caller pudo resolver.
  // `null` = no hay ninguna historia conocida: no evaluable. Este campo es la
  // variable de censura: sin él no se puede distinguir "no hubo alerta previa"
  // de "no había manera de saberlo".
  historiaDisponibleDesde: string | null
  senalesRiesgo: SenalAlerta[]
  senalesPeligro: SenalAlerta[]
}

export type MotivoNoEvaluable = 'sin_historia_previa'

export interface ResultadoAnticipacionEpisodio {
  episodioId: string
  departamento: string
  evaluable: boolean
  motivoNoEvaluable: MotivoNoEvaluable | null
  // null cuando no es evaluable; en ese caso NO se afirma ni "precedido" ni
  // "no precedido" (sería inventar evidencia que no existe).
  precedidoPorRiesgoAlto: boolean | null
  // Horas entre la señal de alerta alta MÁS TEMPRANA dentro de la historia
  // disponible y `primeraAfectacionEn`. `null` en dos casos MUY distintos que
  // el consumidor no debe confundir: (a) no evaluable, o (b) evaluable pero
  // sin ninguna alerta previa (precedidoPorRiesgoAlto === false) — este
  // segundo caso NO es un número negativo, es la ausencia de anticipación.
  anticipacionHoras: number | null
}

/**
 * Anticipación de UN episodio: busca, dentro de la ventana observable
 * [historiaDisponibleDesde, primeraAfectacionEn], la señal de alerta alta más
 * temprana (riesgo alto/muy_alto o peligro naranja/rojo) y mide cuánto
 * antecedió a la primera afectación confirmada.
 */
export function calcularAnticipacionEpisodio(
  entrada: EntradaAnticipacionEpisodio,
): ResultadoAnticipacionEpisodio {
  const base = {
    episodioId: entrada.episodioId,
    departamento: entrada.departamento,
  }

  if (entrada.historiaDisponibleDesde === null) {
    return {
      ...base,
      evaluable: false,
      motivoNoEvaluable: 'sin_historia_previa',
      precedidoPorRiesgoAlto: null,
      anticipacionHoras: null,
    }
  }

  const inicioMs = Date.parse(entrada.primeraAfectacionEn)
  const historiaMs = Date.parse(entrada.historiaDisponibleDesde)

  // Censura: si la historia conocida empieza en o después del propio evento,
  // no hubo NINGUNA ventana observable antes de la afectación — no evaluable,
  // no "no precedido".
  if (historiaMs >= inicioMs) {
    return {
      ...base,
      evaluable: false,
      motivoNoEvaluable: 'sin_historia_previa',
      precedidoPorRiesgoAlto: null,
      anticipacionHoras: null,
    }
  }

  const alertasEnVentana = [
    ...entrada.senalesRiesgo
      .filter((s) => NIVELES_RIESGO_ALTO.has(s.nivel))
      .map((s) => ({ ...s, ms: Date.parse(s.emitidoEn) })),
    ...entrada.senalesPeligro
      .filter((s) => NIVELES_PELIGRO_ALTO.has(s.nivel))
      .map((s) => ({ ...s, ms: Date.parse(s.emitidoEn) })),
  ].filter((s) => s.ms >= historiaMs && s.ms <= inicioMs)

  if (alertasEnVentana.length === 0) {
    return {
      ...base,
      evaluable: true,
      motivoNoEvaluable: null,
      precedidoPorRiesgoAlto: false,
      anticipacionHoras: null,
    }
  }

  const masTemprana = alertasEnVentana.reduce((min, s) => (s.ms < min.ms ? s : min))
  return {
    ...base,
    evaluable: true,
    motivoNoEvaluable: null,
    precedidoPorRiesgoAlto: true,
    anticipacionHoras: (inicioMs - masTemprana.ms) / MS_HORA,
  }
}

export interface TasaAnticipacion {
  episodiosEvaluables: number
  episodiosNoEvaluables: number
  episodiosPrecedidos: number
  // Denominador = SÓLO evaluables. null si no hay ninguno evaluable (nunca 0
  // disfrazado de "0% de anticipación": esa sería una afirmación falsa).
  tasaPrecedidos: number | null
  // Promedio sólo sobre los episodios efectivamente precedidos con
  // anticipacionHoras numérico.
  anticipacionPromedioHoras: number | null
}

/** Agrega resultados por episodio en la tasa global (o por departamento, según lo que agrupe el caller). */
export function calcularTasaAnticipacion(
  resultados: ResultadoAnticipacionEpisodio[],
): TasaAnticipacion {
  const evaluables = resultados.filter((r) => r.evaluable)
  const precedidos = evaluables.filter((r) => r.precedidoPorRiesgoAlto === true)
  const horas = precedidos
    .map((r) => r.anticipacionHoras)
    .filter((h): h is number => h !== null)

  return {
    episodiosEvaluables: evaluables.length,
    episodiosNoEvaluables: resultados.length - evaluables.length,
    episodiosPrecedidos: precedidos.length,
    tasaPrecedidos: evaluables.length === 0 ? null : precedidos.length / evaluables.length,
    anticipacionPromedioHoras:
      horas.length === 0 ? null : horas.reduce((a, b) => a + b, 0) / horas.length,
  }
}

export interface EntradaEscuelaRiesgo {
  cueAnexo: string
  // Nivel de riesgo más alto que llegó a tener la escuela en la historia
  // observable, o `null` si NUNCA se calculó riesgo para ella (sin evidencia
  // suficiente / sin cobertura). `null` es "sin reporte", NUNCA se traduce a
  // "nivel bajo" ni penaliza la tasa.
  maxNivelRiesgoAlcanzado: string | null
}

export interface ResultadoEscuelasSinAlerta {
  // Denominador real: sólo escuelas con AL MENOS un cálculo de riesgo.
  escuelasConDatoDeRiesgo: number
  // Informativo, excluido del denominador — nunca cuenta como "nunca alertada".
  escuelasSinDatoDeRiesgo: number
  escuelasNuncaAlerta: number
  tasaNuncaAlerta: number | null
  cueAnexosNuncaAlerta: string[]
}

/** Escuelas afectadas que, dentro de lo evaluable, nunca alcanzaron riesgo alto/muy_alto. */
export function calcularEscuelasSinAlerta(
  escuelas: EntradaEscuelaRiesgo[],
): ResultadoEscuelasSinAlerta {
  const conDato = escuelas.filter((e) => e.maxNivelRiesgoAlcanzado !== null)
  const nuncaAlerta = conDato.filter(
    (e) => !NIVELES_RIESGO_ALTO.has(e.maxNivelRiesgoAlcanzado as string),
  )

  return {
    escuelasConDatoDeRiesgo: conDato.length,
    escuelasSinDatoDeRiesgo: escuelas.length - conDato.length,
    escuelasNuncaAlerta: nuncaAlerta.length,
    tasaNuncaAlerta: conDato.length === 0 ? null : nuncaAlerta.length / conDato.length,
    cueAnexosNuncaAlerta: nuncaAlerta.map((e) => e.cueAnexo),
  }
}
