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
