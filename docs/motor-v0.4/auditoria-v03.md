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
