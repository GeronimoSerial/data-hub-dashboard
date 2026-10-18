# Auditoría de motor-v0.3 y corrección en reglas v0.4 (T10)

Auditoría del run vigente de prod `75273aab` (asOf 2026-10-18T02:15:04Z,
`motor-v0.3`, 6.003 filas) y su corrección dentro del **motor único**. Las
correcciones viven detrás de un selector de reglas explícito
(`calcularRiesgoEscuela({ reglas })`, `motor/config.ts` → bloque "Reglas v0.4"):

- `reglas: 'v0.3'` (por defecto) — el job operativo `calcular-riesgo` no cambia:
  mismos factores, scores y niveles byte a byte; `MOTOR_VERSION` sigue en
  `motor-v0.3`.
- `reglas: 'v0.4'` — lo usa sólo el job candidato `calcular-riesgo-v04`. El
  resultado informa `modeloVersion = motor-v0.4+reglas-v0.4-1`.

Al promover, `v0.4` pasa a ser la única regla y se retira `v0.3` (no quedan dos
motores; ver `evaluacion-u8.md`).

## Qué mostró la auditoría

| Hallazgo | Evidencia (prod, run vigente) |
|---|---|
| Todo nivel distinto de `bajo` sale de los pisos de Prefectura | 121 alerta → 25 (moderado), 28 evacuación → 50 (alto); 1.852 bajo. Idénticos a 24/72/240 h; `muy_alto` imposible. |
| D1 susceptibilidad saturada | `susceptibilidad.ts` promedia profundidad WRI (m, 0–2,91) con grados-día de calor (192–335): el clamp satura en 100 en las 2.001 escuelas → vulnerabilidad constante 30. Los tests usaban entradas 0..1. |
| D2 historial vacío como 0 real | Peso 0,7; prod tiene 0 partes. riesgo = amenaza × V/100 ≤ 0,3 × amenaza: contradice "un faltante nunca se imputa 0" (`config.ts`). |
| D3 exposición por celdas gruesas | De las 149 escuelas en riesgo, 105 están > 3 m sobre el agua estimada (41 > 10 m). 35 pares de vecinas a ≤ 150 m divergen (bordes de celda JRC/WRI 14, ruta 12, umbrales GSW 5, nombre de localidad 4). Ituzaingó casco 13–17 m sobre el agua con 7 `alto` por celda WRI; Paso de los Libres 4 `alto` sólo por la ruta. El nivel de agua DEM está sesgado 1,6–3,7 m abajo frente a cero INA + mediana de 365 días. |
| D4 precipitación determinística | Un valor horario de ECMWF contra percentiles DIARIOS (`peligro/nivel.ts`). |
| D6 caudal | Sólo el horizonte más chico ("actual") para 24/72/240; la climatología de caudal no existe en prod (0 filas). |
| D7 confianza | Cuenta como presentes un historial vacío y una susceptibilidad saturada. |
| D8 evidencia válida / ensemble | `evidenciaValida` nunca filtra (siempre hay amenaza); el cargador del ensemble no filtra por `asOf`. |
| D9 climatología IMERG | Dos períodos (2001–2010 y 2001–2014) bajo la misma versión `climatologia-imerg-v1`: el reductor de lluvia observada los agrupa en una sola clave y mezcla percentiles. |

## Resolución en reglas v0.4

### F1 — Susceptibilidad sólo fluvial (D1)

- Única variable: profundidad de inundación fluvial **JRC RP100** (`profundidad_rp100_m`),
  normalizada `min(1, profundidad / 1 m) × 100` (`TOPE_PROFUNDIDAD_FLUVIAL_V04_M`).
  Nunca se mezcla con calor, viento ni pluvial.
- Por qué JRC y no WRI: 90 m contra ~1 km, misma fuente que `clase_rio` (el
  respaldo de exposición de F3) y más cobertura útil (137 escuelas con
  profundidad > 0 contra 67 en WRI).
- Hueco del Uruguay: ambas fuentes casi no marcan el río Uruguay (JRC 6/162
  escuelas de localidades del Uruguay con profundidad > 0, WRI 3/162). La
  susceptibilidad del Uruguay queda subestimada; la exposición de F3 no depende
  de ella.
- Nula → sin dato (sin factor, cuenta como faltante); 0 m es un 0 real.
- El adapter la expone fuera del `Record` que promedia v0.3
  (`profundidadFluvialRp100M`, sólo con `conProfundidadFluvial`).

### F2 — Historial ausente y combinación que no anula (D2)

- El adapter de historial informa `fuenteDisponible` (sólo con `informarFuente`):
  `false` si no había **ningún** parte creado hasta `asOf`. En ese caso el
  historial no entra (su peso se redistribuye) y cuenta como faltante.
- `riesgo = amenaza × (0,5 + 0,5 · V/100)` (`BASE_COMBINACION_V04`): la
  vulnerabilidad modula, nunca borra la amenaza. V desconocida → factor 1.
- Los pisos por río siguen aplicándose después.

### F7 — Confianza con faltantes reales (D7)

- En v0.4 el historial ausente cuenta como faltante; la susceptibilidad ya no
  puede saturar (sólo profundidad), y la nula cuenta como faltante.
- Sólo v0.4: aplicarlo a v0.3 cambiaría su confianza publicada hoy.

### F3 — Exposición: terreno contra el agua posible en el horizonte (D3)

Decisión del usuario (2026-10-18): el piso por alerta/evacuación sólo se aplica
si el terreno de la escuela es alcanzable por el agua **posible** dentro del
horizonte, no sólo por la existente. Código: `motor/exposicion-v04.ts`,
`motor/escenarios-subida.ts`, `motor-v04/escenarios-estacion.ts`,
`adaptadores/rio-prefectura.ts` (`resolverEvidenciaRioV04`).

**Subida posible por estación** (`subida_posible(h) = max(análogos, tendencia + onda)`):

| Escenario | Fuente | Regla |
|---|---|---|
| Análogos | Serie diaria INA A5 (sólo historia) | p90 de (máximo en la ventana − nivel actual) entre los 20 vecinos de `analogos-v2`; nunca negativa. Sin análogos → no aporta (marcado `s/d`). |
| Tendencia ("si se mantiene esta tendencia") | Lecturas de Prefectura (`hidro_lectura`, máximo por día local ≤ asOf) | Tasa media diaria de la ventana **media de 5 días** × 1/3/10 días; nunca negativa (bajante o plano = 0). Se informa también la ventana corta de 2 días. Variaciones de más de 2,5 m/día se descartan como lecturas espurias (Empedrado tuvo picos de 12–13 m) y el día del salto no cuenta como nivel actual. Exige lectura de ≤ 2 días y cubrir la mitad de la ventana. |
| Onda aguas arriba | Prefectura de la estación inmediata aguas arriba (Paraná aguas abajo de Corrientes: Empedrado←Corrientes, Bella Vista←Empedrado, Goya←Bella Vista, Esquina←Goya) | Lo que subió de más la estación de arriba en la ventana media, acotado a [0, 1 m], sumado desde 72 h. Proxy simple de propagación, no tránsito hidráulico. |

**Zona modelada** (superación del terreno v0.4 `modelada`): el piso observado se
aplica si `P_conservador(h) ≥ 0,05` (`UMBRAL_ALCANZABLE_V04`; la principal si la
conservadora no se modeló) **o** si el escenario de tendencia alcanza la cota
conservadora en el sitio (nivel por transferencia km con el nivel actual de
Prefectura de cada estación + tendencia + onda). Los pisos probabilísticos de T8
siguen igual.

**Resto con DEM evaluable** (suelo y agua a ≤ 2 km, no embalse, el agua es el
río: |nivel DEM − nivel del tramo| ≤ 3 m):

```
agua_posible(h) = nivel_rio_dem + anomalía_actual + subida_posible(h)
margen = agua_posible + 2 m − suelo
margen ≥ 0        → piso completo
−2 m ≤ margen < 0 → piso un nivel menor (evacuación → moderado; alerta → sin piso)
margen < −2 m     → sin piso ni componente río
```

- Margen de error DEM 2 m (`MARGEN_ERROR_DEM_V04_M`): el agua DEM está sesgada
  1,6–3,7 m abajo frente a cero INA + mediana; 2 m cubre el sesgo típico y la
  banda de 2 m (`BANDA_EXPOSICION_V04_M`) llega al máximo medido con piso reducido.
- Se elimina el corte duro de 500 m: el alcance del dato (2 km) más la prueba de
  terreno deciden.
- **No evaluable** (sin DEM, sin agua a ≤ 2 km o el agua no es el río): respaldo
  sólo con `clase_rio` JRC 90 m, con confianza degradada. Ni WRI, ni ruta, ni
  agua GSW, ni punto de río, ni cercanía a la estación.
- La ruta RP100 sale de la exposición (sigue en la dimensión de acceso, que
  nunca se mezcla en el score).
- Con lectura vigente, la evidencia se devuelve aunque ningún horizonte alcance;
  el cálculo registra entonces un factor `altura_rio` con unidad `no_alcanzable`,
  peso 0 y sin texto de "escuela expuesta".
- La explicación del factor tiene formato fijo:
  `exposicion v0.4 a <h>h: criterio <c>; alcance <a>; margen <m>m (suelo …, agua posible … = dem … + anomalia … + subida … por <analogos|tendencia|tendencia+onda> [analogos_p90 …, tendencia … a … m/dia, onda …]; margen_error 2m; banda 2m)`.
  En la zona modelada el factor `rio-v04` agrega `alcance_observado <criterio>`.

### F5 — Precipitación determinística acumulada por ventana (D4)

- Reglas v0.4 (`peligro/nivel.ts`, `reglas: 'v0.4'`): con climatología se suma
  el pronóstico horario de la corrida más reciente en `(h − 24, h]` y se compara
  con los percentiles **diarios**; 72 h usa `(48, 72]`, igual que la ventana de
  24 h del ensemble en el día 3, y 240 h usa `(216, 240]`.
- La ventana exige 18 h cubiertas (suma de `paso_horas`,
  `COBERTURA_MIN_VENTANA_V04_HORAS`); si no, el horizonte no tiene pronóstico.
- Sin climatología, el umbral provisorio (definido sobre el acumulado del
  horizonte) recibe lo acumulado en `(0, h]`.

### F6 — Caudal dentro de la ventana del horizonte (D6)

- Reglas v0.4: el puerto recibe `horizonteHoras` y se evalúa el máximo
  pronosticado en `(0, h]` de la corrida más reciente, no el horizonte más chico
  para los tres. La caché por corrida usa la clave `punto|horizonte`.
- La climatología de caudal sigue faltando en prod (0 filas): el caudal queda
  `null` (sin dato), nunca 0. La falla del job de climatología de caudal queda
  fuera de T10 (panel estado-datos).

### F8 — Ensemble filtrado por asOf y edad (D8)

- Ambas reglas: el cargador del ensemble ignora corridas posteriores a `ahora`
  (regla as-of; en el operativo `ahora` es el instante actual, así que no cambia
  ningún resultado publicado).
- Reglas v0.4: además descarta corridas de más de 36 h
  (`EDAD_MAX_ENSEMBLE_V04_HORAS`) y el horizonte cae al determinístico.
- `evidenciaValida` no se cambia: sigue siendo "hay alguna amenaza"; la mejora
  real es que la amenaza ya no se construye con insumos posteriores o vencidos.

### F9 — Climatología IMERG por período (D9)

- Reglas v0.4: `reducirClimatologiaObservada(filas, { porPeriodo: true })`
  agrupa por celda, ventana, versión **y período**; un período incompleto no
  presta percentiles y entre los completos gana el de período más reciente
  (luego el calculado más recientemente). El candidato usa
  `cargarClimatologiaPorPeriodoDesdeDb`.
- Sólo v0.4: en prod conviven 2001–2010 y 2001–2014 bajo
  `climatologia-imerg-v1`, así que corregirlo en v0.3 podía cambiar puntajes de
  lluvia observada publicados.
- Pendiente menor: el selector de umbrales del pronóstico
  (`peligro/fuente-climatologia.ts`) ordena por `periodoHasta` y toma el primer
  valor por percentil; si el período más reciente estuviera incompleto podría
  completar con el anterior. Hoy ambos períodos están completos (387 celdas × 3).

## Evaluación (replay del run vigente con reglas v0.4)

Harness local no versionado: código de esta rama al asOf del run vigente
`75273aab` (2026-10-18T02:15:04Z); prod leída en sesión
`default_transaction_read_only` (sólo SELECT); series A5 de T5 ≤ asOf (las del
Uruguay sólo Santo Tomé, Paso de los Libres y Monte Caseros: el resto sin
análogos); altimetría del CSV como en T9. Reglas v0.3 reproducen prod en
6.003/6.003 filas (nivel y score).

### Niveles por horizonte (bajo / moderado / alto / muy alto)

| h | v0.3 (prod) | v0.4 sólo análogos | v0.4 + tendencia | v0.4 final (+ onda) |
|---|---|---|---|---|
| 24 | 1.852 / 121 / 28 / 0 | 1.988 / 1 / 7 / 5 | 1.988 / 1 / 7 / 5 | 1.988 / 1 / 7 / 5 |
| 72 | 1.852 / 121 / 28 / 0 | 1.987 / 1 / 8 / 5 | 1.987 / 0 / 5 / 9 | 1.985 / 0 / 7 / 9 |
| 240 | 1.852 / 121 / 28 / 0 | 1.987 / 1 / 8 / 5 | 1.977 / 5 / 7 / 12 | 1.976 / 6 / 7 / 12 |

- De las 149 escuelas hoy en riesgo quedan 13 (24 h), 15 (72 h) y 22 (240 h).
  A 24 h: Paso de la Patria 11, General Alvear 1, Apipé Grande 1. A 240 h:
  Paso de la Patria 12, Goya 3, Corrientes 2, Puerto Boca 2, Itatí 1, General
  Alvear 1, Apipé Grande 1.
- Por qué bajan (24 h): 113 están en la zona modelada con `P_conservador = 0`
  y la tendencia no alcanza la cota conservadora (cota − nivel en el sitio:
  mediana 3,2 m; 25 a ≤ 2 m, 62 a ≤ 4 m); 20 por DEM con margen < −2 m
  (mediana del margen de las 33 evaluadas por DEM: −4,6 m); 7 en la banda con
  alerta (sin piso); 3 no evaluables sin `clase_rio` JRC.
- Entran: 0 (24 h), 1 (72 h: 1800185-00 Esquina, piso probabilístico de T8),
  3 (240 h: la anterior y 2 de Paso de la Patria por tendencia que alcanza el
  terreno DEM).
- Lo que agrega cada escenario (escuelas no bajas): a 240 h la tendencia suma
  10 y la onda 1; a 72 h la onda suma 2; a 24 h ninguno.
- `muy_alto` aparece (5–12 escuelas de Paso de la Patria): evacuación con
  terreno alcanzable y profundidad JRC ≥ 1 m (V = 100 → riesgo = amenaza).
- Vecinas a ≤ 150 m (1.388 pares): divergen 35 en v0.3; 4 (24 h), 4 (72 h) y
  15 (240 h) en v0.4 (las de 240 h, en bordes de la zona modelada y de la
  tendencia).
- Ituzaingó: 7 `alto` → 0 (29 bajo en los tres horizontes). Paso de los Libres:
  4 `alto` → 0.

### Subida posible por estación al asOf (m)

| Estación | h0 | tasa corta / media (m/día) | onda | 72 h: p90 · tendencia · final | 240 h: p90 · tendencia · final |
|---|---|---|---|---|---|
| Ituzaingó | 4,92 | 0,09 / 0,22 | — | 0,26 · 0,67 · 0,67 | 0,26 · 2,22 · 2,22 |
| Itá Ibaté | 6,82 | 0,21 / 0,41 | — | 0,42 · 1,22 · 1,22 | 0,57 · 4,05 · 4,05 |
| Itatí | 7,87 | 0,38 / 0,45 | — | 0,45 · 1,35 · 1,35 | 0,50 · 4,50 · 4,50 |
| Paso de la Patria | 7,18 | 0,47 / 0,40 | — | 0,44 · 1,20 · 1,20 | 0,58 · 4,00 · 4,00 |
| Corrientes | 6,77 | 0,35 / 0,33 | — | 0,41 · 0,98 · 0,98 | 0,53 · 3,27 · 3,27 |
| Empedrado | 5,67 | 0,24 / 0,18 | 0,58 | 0,39 · 0,55 · 1,13 | 0,46 · 1,82 · 2,40 |
| Bella Vista | 5,75 | 0,21 / 0,17 | 0,04 | 0,38 · 0,52 · 0,56 | 0,46 · 1,73 · 1,77 |
| Goya | 5,22 | 0,16 / 0,13 | 0,19 | 0,24 · 0,38 · 0,57 | 0,33 · 1,25 · 1,44 |
| Esquina | 4,33 | 0,06 / 0,07 | 0,23 | 0,23 · 0,20 · 0,43 | 0,59 · 0,68 · 0,91 |
| Santo Tomé | 10,74 | −0,13 / −0,11 | — | 0,38 · 0 · 0,38 | 5,83 · 0 · 5,83 |
| Paso de los Libres | 9,46 | 0 / 0,03 | — | 0,78 · 0,08 · 0,78 | 2,26 · 0,28 · 2,26 |
| Monte Caseros | 7,13 | 0,02 / 0,02 | — | 0,58 · 0,06 · 0,58 | 2,07 · 0,20 · 2,07 |
| Mocoretá | 8,66 | 0,21 / 0,21 | — | s/d · 0,62 · 0,62 | s/d · 2,05 · 2,05 |

Garruchos y Bompland bajan (subida 0); Alvear, La Cruz y Yapeyú casi planos
(0,3–0,35 m a 240 h, sin análogos).

### Backtest a umbral de alerta (1990 → 2026-10, semanal, sólo h0 < alerta)

Sólo datos ≤ cada fecha; la tendencia usa la serie diaria A5 como sustituto de
Prefectura. Aciertos / falsas alarmas sobre los positivos observados.

| Estación (alerta) | h | positivos | p90 análogos | max(p90, tendencia) | + onda |
|---|---|---|---|---|---|
| Corrientes (6,5 m) | 72 | 12 | 10 / 8 | 10 / 12 | 10 / 12 |
| Corrientes | 240 | 34 | 18 / 44 | 21 / 84 | 21 / 84 |
| Goya (5,2 m) | 72 | 21 | 16 / 23 | 16 / 31 | 18 / 39 |
| Goya | 240 | 65 | 34 / 73 | 42 / 125 | 42 / 134 |
| Esquina (5,0 m) | 72 | 10 | 9 / 19 | 9 / 23 | 10 / 36 |
| Esquina | 240 | 39 | 30 / 63 | 34 / 96 | 38 / 112 |

La tendencia y la onda suben la detección a 240 h (Corrientes 18 → 21 de 34,
Goya 34 → 42 de 65, Esquina 30 → 38 de 39) a costa de 1,5–2× falsas alarmas.

### Limitaciones

- La zona modelada no tiene margen de error vertical: decide con la cota
  conservadora y la probabilidad, por eso Corrientes y Goya bajan más de lo que
  anticipaba el criterio DEM (> 3 m sobre el agua). Datum de ceros INA
  supuesto (SRVN71 frente a SRVN16) sin verificar.
- En prod la serie diaria A5 todavía no se ingesta (T3 no desplegado): el job
  candidato tendría análogos `s/d` y sólo tendencia y onda.
- Sin historia de lecturas de Prefectura, el backtest de tendencia usa A5.

## Fuera de T10

- Tramo por geometría: los tramos los aprueba el usuario (`tramos-prefectura`).
- `tiene_alternativa_sin_cruce` nulo en OSM v4 (1.962/2.001): job geo-static de
  otro agente.
- Falla del job de climatología de caudal: panel estado-datos.
