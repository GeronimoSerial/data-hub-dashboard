// Configuración versionada del motor v0 (decisión N1 fija, ver
// docs/ejecucion-enos/E3b/registro.md). Cambiar un peso o un umbral exige
// subir MOTOR_VERSION: un snapshot persiste la versión que lo produjo
// (infra_risk_run.modeloVersion) para que "mismos inputs/misma versión →
// mismo score" sea verificable después de que la configuración cambie.
// PROMOCIÓN (T11, docs/motor-v0.4/promocion.md): motor-v0.4 es el motor
// operativo. MOTOR_VERSION_V03 sólo identifica cálculos históricos de comparación.
export const MOTOR_VERSION = 'motor-v0.4'
export const MOTOR_VERSION_V03 = 'motor-v0.3'

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
export const PISO_AMENAZA_POR_ESTADO_RIO = { normal: null, alerta: 50, evacuacion: 75, bajante: null } as const
export const PISO_RIESGO_POR_ESTADO_RIO = { normal: null, alerta: 25, evacuacion: 50, bajante: null } as const

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

// --- Motor v0.4: factor río probabilístico (T8, odd/tasks/motor-v0-4.md) ---
// PROVISORIO, PENDIENTE DE DECISIÓN DEL USUARIO. Sólo lo usa el job candidato
// (jobs/calcular-riesgo-v04.ts) mientras MOTOR_VERSION siga en motor-v0.3.
// - Componente río = 100 × P(superación del terreno, cota principal) con el
//   peso PESOS_AMENAZA.rioPrefectura (misma redistribución: si falta, no es 0).
// - Los pisos observados de v0.3 (PISO_*_POR_ESTADO_RIO) se mantienen.
// - Pisos probabilísticos de riesgo: sólo suben, nunca bajan.
export const RIO_V04_MAPEO_VERSION = 'rio-v04-mapeo-provisorio-1'
export const UMBRAL_P_ALTO_V04 = 0.5
export const UMBRAL_P_MODERADO_V04 = 0.2
export const PISO_RIESGO_P_ALTO_V04 = UMBRAL_ALTO
export const PISO_RIESGO_P_MODERADO_V04 = UMBRAL_MODERADO

// --- Reglas v0.4 (T10, docs/motor-v0.4/auditoria-v03.md) ---
// Selector explícito de reglas del cálculo compartido. Desde la promoción
// (T11) el job operativo usa exclusivamente 'v0.4'. 'v0.3' se conserva para
// comparaciones históricas del núcleo puro, sin publicación operativa.
export type ReglasMotor = 'v0.3' | 'v0.4'
export const REGLAS_V04_VERSION = 'reglas-v0.4-3'
// Alias histórico de MOTOR_VERSION (antes de T11 identificaba la corrida
// candidata); se mantiene para no renombrar los usos existentes.
export const MODELO_VERSION_V04 = MOTOR_VERSION

// F1 — Susceptibilidad v0.4: SÓLO profundidad fluvial JRC RP100 (m), escala
// lineal hasta el tope (profundidad ≥ tope = 100). Nunca se mezcla con calor,
// viento ni pluvial (magnitudes y unidades distintas: el promedio de v0.3
// mezclaba metros con grados-día y saturaba en 100 para todas las escuelas).
// JRC (90 m) en lugar de WRI (~1 km): misma fuente que `clase_rio` (respaldo de
// exposición) y 12× más resolución. Nulo → sin dato, nunca 0.
export const TOPE_PROFUNDIDAD_FLUVIAL_V04_M = 1

// F2 — Historial v0.4: si el sistema no tiene NINGÚN parte cargado, el
// historial es ausente (su peso se redistribuye), no un 0 real. Combinación
// que no puede borrar la amenaza: riesgo = amenaza × (BASE + (1 − BASE)·V/100).
// Con V desconocida (ni historial ni susceptibilidad) el factor es 1: un dato
// faltante nunca baja el riesgo. Los pisos por río siguen aplicándose.
export const BASE_COMBINACION_V04 = 0.5

// F3 — Exposición v0.4: terreno de la escuela contra el agua POSIBLE dentro
// del horizonte (decisión del usuario 2026-10-18), no sólo la existente.
// Zona modelada (superación del terreno v0.4; T10b, mismo margen y banda que
// la zona DEM): umbral = cota_conservadora − MARGEN_ERROR_DEM_V04_M; piso
// completo si P(máx nivel sitio ≥ umbral) ≥ UMBRAL_ALCANZABLE_V04 o la
// tendencia llega al umbral; un nivel menor si sólo llega a umbral − BANDA;
// si no, sin piso. Los pisos probabilísticos usan la cota SIN margen.
// Resto con DEM evaluable:
//   agua_posible(h) = nivel_rio_dem + anomalía_actual + subida_posible(h)
//   margen = agua_posible + MARGEN_ERROR_DEM_V04_M − suelo
//   margen ≥ 0 → piso completo; −BANDA ≤ margen < 0 → piso un nivel menor;
//   margen < −BANDA → sin piso.
// MARGEN_ERROR_DEM: el nivel de agua DEM está sesgado 1,6–3,7 m abajo frente
// a cero INA + mediana de 365 días (auditoría 2026-10-18); 2 m cubre el sesgo
// típico y la banda de 2 m llega al máximo medido con piso reducido.
export const UMBRAL_ALCANZABLE_V04 = 0.05
export const DISTANCIA_DATOS_DEM_V04_M = 2000
export const MARGEN_ERROR_DEM_V04_M = 2
export const BANDA_EXPOSICION_V04_M = 2
// Piso un nivel menor (banda): evacuación → alerta (amenaza 50, riesgo 25);
// alerta → sin piso.
export const PISO_AMENAZA_REDUCIDO_V04 = { normal: null, alerta: null, evacuacion: 50, bajante: null } as const
export const PISO_RIESGO_REDUCIDO_V04 = { normal: null, alerta: null, evacuacion: 25, bajante: null } as const

// T10c — Referencia estable del nivel (motor/referencia-nivel.ts): la anomalía
// v0.4 se mide contra la mediana de la serie A5 en una ventana FIJA (no
// deriva con el año previo), con al menos 10 años de ≥ 300 días. Sin serie
// suficiente se usa la mediana de 365 días, marcada `referencia_inestable`.
// Con cero efectivo calibrado, el DEM es río sólo si su agua está a ≤
// TOLERANCIA_RIO_CERO_EFECTIVO_V04_M de a + b·referencia (lagunas fuera).
export const VENTANA_REFERENCIA_LARGA_V04 = { desde: '1991-01-01', hasta: '2020-12-31' } as const
export const ANIOS_COMPLETOS_REFERENCIA_V04 = 10
export const DIAS_ANIO_COMPLETO_V04 = 300
export const TOLERANCIA_RIO_CERO_EFECTIVO_V04_M = 3

// Escenarios de subida posible por estación (F3):
// - análogos: p90 de la subida máxima en la ventana (analogos-v2, serie A5);
// - tendencia ("si se mantiene esta tendencia"): tasa diaria media de los
//   máximos diarios de Prefectura en la ventana media × días del horizonte;
//   nunca negativa. La ventana corta sólo se informa.
// - onda aguas arriba (Paraná aguas abajo de Corrientes, h ≥ 72): lo que subió
//   de más la estación inmediatamente aguas arriba en la ventana media, acotado.
//   Es un proxy de propagación, no un tránsito hidráulico.
// subida_posible = max(análogos, tendencia + onda).
export const VENTANA_TENDENCIA_CORTA_DIAS = 2
export const VENTANA_TENDENCIA_MEDIA_DIAS = 5
// Saltos diarios mayores se descartan como lecturas espurias (Empedrado tuvo
// picos de 12–13 m sobre ~5 m); el Uruguay real sube hasta ~1–2 m/día.
export const SALTO_MAX_DIARIO_M = 2.5
export const EDAD_MAX_LECTURA_TENDENCIA_DIAS = 2
export const ONDA_MAX_V04_M = 1
export const DIAS_POR_HORIZONTE_V04 = { 24: 1, 72: 3, 240: 10 } as const

// F5 — Precipitación determinística v0.4: el pronóstico horario se acumula en
// la ventana (h − 24, h] antes de compararlo con percentiles DIARIOS (v0.3
// comparaba un solo valor horario). La ventana exige cubrir al menos estas
// horas (suma de `paso_horas`); si no, no hay pronóstico para ese horizonte.
// Sin climatología, el umbral provisorio (definido sobre lo acumulado en el
// horizonte) recibe lo acumulado en (0, h].
export const COBERTURA_MIN_VENTANA_V04_HORAS = 18
// F5 — Respaldo v0.4: si la ingesta más reciente no cubre la ventana, se usa la
// ingesta previa que sí la cubra, sólo si no tiene más de estas horas de
// antigüedad respecto de `ahora`. Evita mezclar un pronóstico viejo con el
// vigente, pero absorbe una ingesta incompleta (ej. 06/12/18 UTC de ECMWF).
export const EDAD_MAX_INGESTA_RESPALDO_V04_HORAS = 18
// F8 — Ensemble v0.4: además de no usar corridas posteriores a asOf (regla
// as-of que ya aplica a ambas reglas), una corrida de más de estas horas no se
// usa y el horizonte cae al determinístico.
export const EDAD_MAX_ENSEMBLE_V04_HORAS = 36
// F6 — Caudal v0.4: máximo del pronóstico dentro de la ventana (0, h] de la
// corrida más reciente, en lugar del horizonte más chico para los tres.

// Vigencia máxima de la última fila diaria INA + Prefectura para el río v0.4.
export const EDAD_MAX_SERIE_INA_V04_DIAS = 3
