// Configuración versionada del motor v0 (decisión N1 fija, ver
// docs/ejecucion-enos/E3b/registro.md). Cambiar un peso o un umbral exige
// subir MOTOR_VERSION: un snapshot persiste la versión que lo produjo
// (infra_risk_run.modeloVersion) para que "mismos inputs/misma versión →
// mismo score" sea verificable después de que la configuración cambie.
export const MOTOR_VERSION = 'motor-v0.3'

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
  peligroCelda: 0.4,
  caudal: 0.2,
  rioPrefectura: 0.25,
  lluviaAntecedente: 0.15,
} as const
// CAMBIO (motor-v0.2 -> motor-v0.3, odd/tasks/evidencia-riesgo-escuelas.md):
// entra `rioPrefectura`, el estado oficial (normal/alerta/evacuación) de la
// estación de Prefectura del tramo de la escuela, SÓLO para escuelas
// físicamente expuestas a ese río (ver motor/rio-prefectura.ts). Es la única
// señal OBSERVADA del río: el caudal GloFAS es pronóstico y queda nulo cuando
// falta la climatología de caudal. Los pesos previos se reescalan
// (0.5/0.3/0.2 -> 0.4/0.2/0.15). Para escuelas sin evidencia de río el
// componente no existe (no cuenta como faltante) y la redistribución deja los
// tres restantes en la misma proporción relativa de antes.

// Piso de score por estado oficial del río en escuela expuesta. La amenaza
// observada en el propio río de la escuela es evidencia directa: ni el resto
// de los componentes (pronóstico "verde") ni la vulnerabilidad multiplicativa
// (historial vacío) pueden borrarla. Evacuación => amenaza muy_alto y riesgo
// >= alto; alerta => amenaza >= alto y riesgo >= moderado.
export const PISO_AMENAZA_POR_ESTADO_RIO = { normal: null, alerta: 50, evacuacion: 75 } as const
export const PISO_RIESGO_POR_ESTADO_RIO = { normal: null, alerta: 25, evacuacion: 50 } as const

// Vulnerabilidad = combinación ponderada de historial de partes confirmados y
// susceptibilidad estática (physrisk). Misma regla de redistribución de pesos
// ante ausencia.
//
// CAMBIO (batch de riesgo de acceso, MOTOR_VERSION motor-v0.1 -> motor-v0.2):
// el aislamiento OSM SALIÓ de esta dimensión. Ya no entra a scoreVulnerabilidad
// ni al IRO compuesto; pasó a ser insumo de la dimensión separada `riesgoAcceso`
// (ver REGLA_ACCESO_VERSION / motor/riesgo-acceso.ts), que el núcleo calcula y
// persiste pero NUNCA mezcla en el score. Los dos pesos restantes se
// renormalizan para repartirse todo el peso (antes 0.5/0.2, ahora 0.7/0.3),
// conservando el orden historial > susceptibilidad.
export const PESOS_VULNERABILIDAD = {
  historial: 0.7,
  susceptibilidad: 0.3,
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
// motor-v0.3: el motor ya no la usa; la lluvia observada se puntúa con
// climatología de la celda o umbrales absolutos por ventana (lluvia-observada.ts).
// Se conserva como valor de referencia "al máximo" en tests.
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

// Regla de RIESGO DE ACCESO (dimensión separada del IRO). Versionada aparte de
// MOTOR_VERSION a propósito: puede evolucionar sin tocar los pesos del score
// compuesto. Cambiar cualquier valor de BASE_ACCESO_POR_NIVEL_AISLAMIENTO o
// AGRAVANTES_ACCESO exige subir REGLA_ACCESO_VERSION, porque un mismo
// aislamiento debe poder auditarse contra la versión de regla que lo puntuó.
export const REGLA_ACCESO_VERSION = 'acceso-v1'

// Punto de partida del score de acceso 0..100 según el nivel de aislamiento
// OSM 0..3 (resumen del `IndiceAislamiento`). NO son los umbrales de
// clasificación (esos siguen siendo UMBRAL_MODERADO/UMBRAL_ALTO): son la
// posición base antes de agravantes. Nivel 0 = sin aislamiento conocido = 0.
// Nivel 3 = aislamiento severo = 70, dejando margen para que los agravantes
// (cruce sin puente, peligro alto) lo puedan llevar hasta 100.
export const BASE_ACCESO_POR_NIVEL_AISLAMIENTO: Record<0 | 1 | 2 | 3, number> = {
  0: 0,
  1: 20,
  2: 45,
  3: 70,
}

// Agravantes aditivos de la regla de acceso. `sinAlternativa` (false) y
// `alternativaDesconocida` (null) son MUTUAMENTE EXCLUYENTES; la desconocida
// pesa MÁS que la ausencia confirmada, porque un dato faltante nunca puede
// abaratar el riesgo (regla "alternativa desconocida nunca baja el riesgo").
export const AGRAVANTES_ACCESO = {
  // Hay al menos un cruce de agua sin puente/vado conocido (derivación
  // documentada en motor/riesgo-acceso.ts).
  cruceDeRiesgo: 25,
  // Lluvia/celda o caudal del horizonte en nivel naranja o rojo (>= 66 en
  // NIVEL_PELIGRO_A_NUMERO).
  peligroAlto: 25,
  // No hay alternativa sin cruce (tieneAlternativaSinCruce === false).
  sinAlternativa: 15,
  // Alternativa sin cruce DESCONOCIDA (null): igual o peor que false.
  alternativaDesconocida: 20,
  // Antecedentes confirmados con motivo 'Acceso interrumpido' (> 0). Agravante
  // SOLO de esta dimensión: no le resta su rol en historial/vulnerabilidad.
  accesoInterrumpido: 15,
} as const
