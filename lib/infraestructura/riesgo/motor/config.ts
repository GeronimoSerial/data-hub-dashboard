// Configuración versionada del motor v0 (decisión N1 fija, ver
// docs/ejecucion-enos/E3b/registro.md). Cambiar un peso o un umbral exige
// subir MOTOR_VERSION: un snapshot persiste la versión que lo produjo
// (infra_risk_run.modeloVersion) para que "mismos inputs/misma versión →
// mismo score" sea verificable después de que la configuración cambie.
export const MOTOR_VERSION = 'motor-v0.1'

// Escala de nivel de riesgo (documento base §5.1). Límites inclusivos por el
// borde inferior de cada tramo: score < 25 → bajo, etc.
export const UMBRAL_MODERADO = 25
export const UMBRAL_ALTO = 50
export const UMBRAL_MUY_ALTO = 75

// Amenaza = combinación ponderada de peligro por celda (horizonte elegido),
// caudal en el punto de río asociado (si existe) y lluvia observada
// antecedente. Si un componente falta, su peso se redistribuye entre los
// componentes presentes (nunca se imputa 0 en su lugar) — ver
// motor/calculo.ts, normalizarPesos().
export const PESOS_AMENAZA = {
  peligroCelda: 0.5,
  caudal: 0.3,
  lluviaAntecedente: 0.2,
} as const

// Vulnerabilidad = combinación ponderada de historial de partes confirmados,
// aislamiento OSM y susceptibilidad estática (physrisk). Misma regla de
// redistribución de pesos ante ausencia.
export const PESOS_VULNERABILIDAD = {
  historial: 0.5,
  aislamiento: 0.3,
  susceptibilidad: 0.2,
} as const

// Mapeo determinista de NivelPeligro a un número 0..100 para poder combinarlo
// con caudal/lluvia en una misma escala. 'sin_dato' es null a propósito: el
// núcleo nunca lo trata como 0.
export const NIVEL_PELIGRO_A_NUMERO: Record<string, number | null> = {
  verde: 0,
  amarillo: 33,
  naranja: 66,
  rojo: 100,
  sin_dato: null,
}

// Umbral de lluvia antecedente (mm acumulados en 72h) a partir del cual se
// considera saturación relevante del terreno; escala lineal hasta el tope
// (documento base §5.2, componente A). Valor inicial de aceptación, no una
// calibración estadística.
export const LLUVIA_72H_SATURACION_MM = 150

// Ventana de historial confirmado que entra en el cálculo de vulnerabilidad.
// 365 días cubre una temporada ENOS completa sin arrastrar antecedentes
// indefinidamente.
export const VENTANA_HISTORIAL_DIAS = 365

// Normaliza cantidad/duración de antecedentes a una escala 0..100 mediante
// topes de saturación: por encima de estos valores el componente satura en
// 100 en vez de crecer sin límite (una escuela con 50 antecedentes no debe
// scorear distinto de una con 10 si ambas superan el tope de "recurrente").
export const HISTORIAL_TOPE_CANTIDAD = 5
export const HISTORIAL_TOPE_DURACION_HORAS = 24 * 30
export const HISTORIAL_TOPE_ACCESO_INTERRUMPIDO = 3

// Confianza: 'alta' exige todos los componentes principales presentes,
// 'media' tolera hasta este número de componentes faltantes por dimensión,
// 'baja' en cualquier otro caso (ver motor/calculo.ts, calcularConfianza()).
export const CONFIANZA_MEDIA_MAX_FALTANTES = 1
