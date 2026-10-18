# Modelo temporal por estación `analogos-v1` (Motor v0.4, U4)

Código: `lib/infraestructura/riesgo/motor-v04/hidrologia/{analogos,evaluacion}.ts`. Módulos puros (sin DB, red ni reloj). Versión `MODELO_TEMPORAL_VERSION = 'analogos-v1'`, parámetros `PARAMETROS_ANALOGOS_V1`.

## Método

Trayectorias análogas empíricas sobre la serie diaria de Prefectura (INA A5, escala local del hidrómetro, m).

1. **Estado en `asOf`.** `h0` = última lectura con fecha ≤ `asOf` y edad ≤ `edadMaxDias` (2). Tendencia = `h0 − h(t−3 d)`, clasificada `sube`/`baja`/`estable` con umbral ±0,05 m. Sin `h0` → `no_estimable` (`nivel_actual_no_disponible`).
2. **Análogos.** Días históricos `d` con: distancia estacional ≤ ±30 días del año; `|h(d) − h0| ≤ 0,3 m`; misma clase de tendencia (si la de `asOf` es calculable); ventana futura completa de `desfase + 10` días que termina **antes** de `asOf` (sin fuga). Un día faltante descarta el análogo para todas las ventanas (no se imputa); así los tres horizontes comparten miembros. Menos de 30 análogos → `no_estimable` (`analogos_insuficientes`).
3. **Trayectoria.** Para cada análogo `Δj = h(d+j) − h(d)`; trayectoria proyectada `h0 + Δj`. Las ventanas empiezan el día siguiente a `asOf`: 24 h = 1 día, 72 h = 3, 240 h = 10. Si `h0` es de ayer (desfase 1), la trayectoria tiene 11 pasos y la ventana se corre un día.
4. **Salidas.** Miembros (fecha análoga + trayectoria), cuantiles p10/p50/p90 del máximo por ventana y `P(max ≥ umbral)` = fracción de miembros, para cualquier umbral en metros de escala. `P(24) ≤ P(72) ≤ P(240)` por construcción (mismos miembros, ventanas anidadas).
5. **Ensamble conjunto** (`ensambleConjunto`). La estación de referencia elige las fechas; las demás aportan su propio Δ en las mismas fechas (dependencia conservada). Una fecha sin ventana completa en una estación elimina ese miembro sólo allí y se informa `miembrosDescartados`. Uso previsto: T6 interpola miembro a miembro entre dos hidrómetros. El error estático de terreno no se sortea por día.

**Límites del método.** Las lecturas son diarias (una por día, hora local), no picos intradiarios: el máximo en 24 h es la lectura del día siguiente. No usa pronósticos INA (T9 los compara), ni medias semanales interpoladas, ni miembros equiprobables inventados. No es probabilidad escolar: es la distribución del nivel en el hidrómetro.

## Evaluación retrospectiva

`evaluarEstacion` recorre fechas `t`; modelo y climatología reciben `recortarSerie(serie, t)` (vista sin copia, lo posterior no existe). El observado es el máximo de las lecturas `t+1..t+n` (fechas sin ventana de 240 h completa se excluyen). Métricas por estación × umbral × horizonte (`resumirEvaluacion`): Brier; BSS frente a climatología estacional (frecuencia en la historia anterior a `t`, misma ventana de ±30 días) y frente a persistencia (`h0 ≥ umbral`); bins de confiabilidad; n; positivos; episodios (positivos a ≤ 14 días cuentan como uno); IC 95 % por bootstrap de bloques anuales (B = 200, semilla 1). Abstenciones se informan aparte y no entran en el Brier.

### Corrida

- Descarga: 2026-10-17, 36 solicitudes GET a `https://alerta.ina.gob.ar/a5/obs/puntual/series/<id>/observaciones?timestart=…&timeend=…&format=json` (tres tramos 1900–1959, 1960–1999, 2000–2026-10-16) para las series 15, 16, 17, 18, 19, 21, 22, 23, 25 (Paraná) y 68, 72, 74 (Uruguay). Datos no versionados.
- Parseo con `parsearObservacionesA5` + `normalizarSerieDiaria` (T3). Umbrales de `CATALOGO_A5` (`ina-a5-2026-10-17.1`).
- Fechas: semanales, 1990-01-03 → 2026-10-06 (período retenido; parámetros fijados a priori). Ventana creciente: cada `t` usa toda la historia anterior.
- Comando (harness local, no versionado): `./node_modules/.bin/vitest run -c <scratchpad>/t5/vitest.harness.config.mts` con `T5_TOL`, `T5_VENT`, `T5_DESDE`, `T5_HASTA`, `T5_SALIDA`. ≈ 3 s por estación.

### Resultados `analogos-v1` (tolerancia 0,3 m, ventana ±30 d)

| Estación | Umbral (m) | h | Brier | BSS clim [IC95] | BSS pers [IC95] | n | pos | episodios | abst |
|---|---|---|---|---|---|---|---|---|---|
| Ituzaingó | alerta 3.5 | 24 | 0.003 | 0.768 [0.65, 0.88] | 0.258 [-0.10, 0.63] | 1801 | 25 | 15 | 2% |
| Ituzaingó | alerta 3.5 | 72 | 0.006 | 0.666 [0.46, 0.84] | 0.209 [-0.10, 0.51] | 1801 | 30 | 18 | 2% |
| Ituzaingó | alerta 3.5 | 240 | 0.017 | 0.461 [0.30, 0.56] | 0.069 [-0.14, 0.19] | 1801 | 55 | 25 | 2% |
| Ituzaingó | evacuacion 4 | 24 | 0.001 | 0.747 [0.57, 0.99] | -0.383 [-0.96, 0.04] | 1801 | 5 | 5 | 2% |
| Ituzaingó | evacuacion 4 | 72 | 0.003 | 0.434 [0.19, 0.67] | -0.077 [-0.69, 0.18] | 1801 | 9 | 9 | 2% |
| Ituzaingó | evacuacion 4 | 240 | 0.010 | 0.236 [0.08, 0.34] | 0.054 [-0.18, 0.15] | 1801 | 23 | 15 | 2% |
| Itá Ibaté | alerta 7 | 24 | 0.000 | 1.000 [1.00, 1.00] | — | 1707 | 0 | 0 | 4% |
| Itá Ibaté | alerta 7 | 72 | 0.000 | 1.000 [1.00, 1.00] | — | 1707 | 0 | 0 | 4% |
| Itá Ibaté | alerta 7 | 240 | 0.002 | 0.011 [-0.04, 0.06] | 0.003 [-0.07, 0.03] | 1707 | 3 | 3 | 4% |
| Itá Ibaté | evacuacion 7.5 | 24 | 0.000 | 1.000 [1.00, 1.00] | — | 1707 | 0 | 0 | 4% |
| Itá Ibaté | evacuacion 7.5 | 72 | 0.000 | 1.000 [1.00, 1.00] | — | 1707 | 0 | 0 | 4% |
| Itá Ibaté | evacuacion 7.5 | 240 | 0.001 | 0.001 [-0.01, 1.00] | -0.007 [-0.02, 0.00] | 1707 | 1 | 1 | 4% |
| Itatí | alerta 6.8 | 24 | 0.001 | 0.842 [0.55, 0.98] | 0.339 [-0.19, 0.51] | 1736 | 12 | 6 | 4% |
| Itatí | alerta 6.8 | 72 | 0.005 | 0.536 [0.16, 0.75] | 0.101 [-0.22, 0.31] | 1736 | 19 | 12 | 4% |
| Itatí | alerta 6.8 | 240 | 0.013 | 0.339 [0.13, 0.56] | 0.113 [-0.05, 0.26] | 1736 | 35 | 17 | 4% |
| Itatí | evacuacion 7.5 | 24 | 0.000 | 0.810 [0.66, 1.00] | 0.788 [0.62, 0.95] | 1736 | 2 | 2 | 4% |
| Itatí | evacuacion 7.5 | 72 | 0.002 | 0.336 [0.00, 0.75] | 0.308 [-0.04, 0.71] | 1736 | 5 | 5 | 4% |
| Itatí | evacuacion 7.5 | 240 | 0.007 | 0.112 [-0.08, 0.25] | 0.103 [-0.12, 0.24] | 1736 | 13 | 9 | 4% |
| Paso de la Patria | alerta 6.5 | 24 | 0.000 | 0.976 [0.94, 1.00] | 0.834 [0.42, 0.95] | 1740 | 19 | 11 | 7% |
| Paso de la Patria | alerta 6.5 | 72 | 0.003 | 0.810 [0.61, 0.93] | 0.399 [-0.12, 0.71] | 1740 | 24 | 14 | 7% |
| Paso de la Patria | alerta 6.5 | 240 | 0.011 | 0.548 [0.36, 0.70] | 0.270 [0.06, 0.44] | 1740 | 43 | 22 | 7% |
| Paso de la Patria | evacuacion 7 | 24 | 0.000 | 0.912 [0.73, 1.00] | 0.375 [0.30, 0.44] | 1740 | 6 | 5 | 7% |
| Paso de la Patria | evacuacion 7 | 72 | 0.001 | 0.723 [0.39, 0.97] | 0.152 [-0.98, 0.84] | 1740 | 8 | 6 | 7% |
| Paso de la Patria | evacuacion 7 | 240 | 0.006 | 0.396 [0.15, 0.63] | 0.051 [-0.40, 0.23] | 1740 | 16 | 10 | 7% |
| Corrientes | alerta 6.5 | 24 | 0.001 | 0.944 [0.84, 1.00] | 0.208 [-0.12, 0.47] | 1828 | 29 | 18 | 4% |
| Corrientes | alerta 6.5 | 72 | 0.002 | 0.855 [0.74, 0.93] | 0.094 [-0.57, 0.36] | 1828 | 32 | 19 | 4% |
| Corrientes | alerta 6.5 | 240 | 0.012 | 0.564 [0.44, 0.68] | 0.163 [-0.01, 0.29] | 1828 | 54 | 23 | 4% |
| Corrientes | evacuacion 7 | 24 | 0.001 | 0.695 [0.12, 1.00] | 0.052 [-0.04, 0.10] | 1828 | 6 | 4 | 4% |
| Corrientes | evacuacion 7 | 72 | 0.001 | 0.671 [-0.12, 0.80] | 0.207 [-0.77, 0.50] | 1828 | 7 | 4 | 4% |
| Corrientes | evacuacion 7 | 240 | 0.007 | 0.275 [-0.21, 0.52] | 0.051 [-0.34, 0.20] | 1828 | 17 | 11 | 4% |
| Empedrado | alerta 6.5 | 24 | 0.000 | 1.000 [1.00, 1.00] | — | 1491 | 0 | 0 | 8% |
| Empedrado | alerta 6.5 | 72 | 0.000 | 1.000 [1.00, 1.00] | — | 1491 | 0 | 0 | 8% |
| Empedrado | alerta 6.5 | 240 | 0.000 | 1.000 [1.00, 1.00] | — | 1491 | 0 | 0 | 8% |
| Empedrado | evacuacion 6.7 | 24 | 0.000 | 1.000 [1.00, 1.00] | — | 1491 | 0 | 0 | 8% |
| Empedrado | evacuacion 6.7 | 72 | 0.000 | 1.000 [1.00, 1.00] | — | 1491 | 0 | 0 | 8% |
| Empedrado | evacuacion 6.7 | 240 | 0.000 | 1.000 [1.00, 1.00] | — | 1491 | 0 | 0 | 8% |
| Bella Vista | alerta 6 | 24 | 0.001 | 0.914 [0.87, 0.98] | 0.530 [0.14, 0.87] | 1746 | 28 | 14 | 4% |
| Bella Vista | alerta 6 | 72 | 0.003 | 0.814 [0.68, 0.91] | 0.354 [-0.01, 0.62] | 1746 | 32 | 15 | 4% |
| Bella Vista | alerta 6 | 240 | 0.013 | 0.522 [0.33, 0.64] | 0.073 [-0.11, 0.20] | 1746 | 50 | 18 | 4% |
| Bella Vista | evacuacion 6.4 | 24 | 0.000 | 0.900 [0.83, 1.00] | 0.497 [0.49, 0.50] | 1746 | 5 | 2 | 4% |
| Bella Vista | evacuacion 6.4 | 72 | 0.001 | 0.773 [0.19, 1.00] | 0.313 [0.13, 0.48] | 1746 | 6 | 3 | 4% |
| Bella Vista | evacuacion 6.4 | 240 | 0.002 | 0.526 [-0.54, 0.73] | 0.144 [-0.61, 0.29] | 1746 | 9 | 4 | 4% |
| Goya | alerta 5.2 | 24 | 0.005 | 0.941 [0.90, 0.98] | 0.352 [-0.16, 0.60] | 1848 | 158 | 47 | 3% |
| Goya | alerta 5.2 | 72 | 0.008 | 0.898 [0.86, 0.93] | 0.372 [0.10, 0.54] | 1848 | 170 | 48 | 3% |
| Goya | alerta 5.2 | 240 | 0.027 | 0.733 [0.68, 0.78] | 0.266 [0.14, 0.34] | 1848 | 214 | 45 | 3% |
| Goya | evacuacion 5.7 | 24 | 0.002 | 0.859 [0.71, 0.93] | 0.144 [-0.80, 0.49] | 1848 | 25 | 12 | 3% |
| Goya | evacuacion 5.7 | 72 | 0.002 | 0.838 [0.68, 0.90] | 0.429 [-0.35, 0.64] | 1848 | 29 | 14 | 3% |
| Goya | evacuacion 5.7 | 240 | 0.007 | 0.664 [0.50, 0.77] | 0.353 [0.17, 0.50] | 1848 | 42 | 16 | 3% |
| Esquina | alerta 5 | 24 | 0.002 | 0.978 [0.96, 0.99] | 0.599 [0.11, 0.76] | 1796 | 138 | 29 | 3% |
| Esquina | alerta 5 | 72 | 0.008 | 0.902 [0.87, 0.94] | 0.346 [0.16, 0.49] | 1796 | 152 | 29 | 3% |
| Esquina | alerta 5 | 240 | 0.017 | 0.814 [0.77, 0.87] | 0.389 [0.22, 0.49] | 1796 | 181 | 30 | 3% |
| Esquina | evacuacion 5.4 | 24 | 0.001 | 0.907 [0.80, 0.99] | 0.118 [-1.03, 0.42] | 1796 | 29 | 13 | 3% |
| Esquina | evacuacion 5.4 | 72 | 0.003 | 0.815 [0.68, 0.93] | 0.144 [-0.82, 0.48] | 1796 | 33 | 14 | 3% |
| Esquina | evacuacion 5.4 | 240 | 0.009 | 0.653 [0.45, 0.78] | 0.268 [0.07, 0.46] | 1796 | 48 | 15 | 3% |
| Santo Tomé | alerta 11.5 | 24 | 0.004 | 0.348 [0.11, 0.57] | 0.416 [0.21, 0.60] | 1448 | 8 | 8 | 7% |
| Santo Tomé | alerta 11.5 | 72 | 0.009 | 0.212 [0.05, 0.38] | 0.263 [0.10, 0.43] | 1448 | 16 | 16 | 7% |
| Santo Tomé | alerta 11.5 | 240 | 0.033 | 0.047 [-0.01, 0.09] | 0.107 [0.04, 0.15] | 1448 | 53 | 38 | 7% |
| Santo Tomé | evacuacion 12.5 | 24 | 0.001 | 0.034 [-0.01, 0.94] | -0.032 [-0.06, -0.00] | 1448 | 1 | 1 | 7% |
| Santo Tomé | evacuacion 12.5 | 72 | 0.004 | 0.112 [-0.03, 0.22] | 0.113 [-0.06, 0.23] | 1448 | 6 | 6 | 7% |
| Santo Tomé | evacuacion 12.5 | 240 | 0.017 | 0.015 [-0.02, 0.06] | 0.036 [-0.02, 0.08] | 1448 | 25 | 19 | 7% |
| Paso de los Libres | alerta 7.5 | 24 | 0.003 | 0.921 [0.85, 0.96] | 0.759 [0.61, 0.85] | 1603 | 54 | 41 | 7% |
| Paso de los Libres | alerta 7.5 | 72 | 0.015 | 0.660 [0.57, 0.76] | 0.390 [0.24, 0.51] | 1603 | 77 | 55 | 7% |
| Paso de los Libres | alerta 7.5 | 240 | 0.046 | 0.398 [0.32, 0.47] | 0.260 [0.19, 0.32] | 1603 | 139 | 60 | 7% |
| Paso de los Libres | evacuacion 8.5 | 24 | 0.002 | 0.832 [0.61, 0.93] | 0.287 [-1.29, 0.62] | 1603 | 17 | 14 | 7% |
| Paso de los Libres | evacuacion 8.5 | 72 | 0.006 | 0.633 [0.42, 0.74] | 0.246 [-0.15, 0.41] | 1603 | 25 | 19 | 7% |
| Paso de los Libres | evacuacion 8.5 | 240 | 0.026 | 0.289 [0.16, 0.39] | 0.143 [0.03, 0.21] | 1603 | 62 | 39 | 7% |
| Monte Caseros | alerta 7.5 | 24 | 0.000 | 0.802 [0.79, 0.99] | 0.590 [0.59, 0.59] | 1105 | 2 | 1 | 6% |
| Monte Caseros | alerta 7.5 | 72 | 0.005 | 0.345 [0.10, 0.58] | 0.258 [0.07, 0.42] | 1105 | 8 | 7 | 6% |
| Monte Caseros | alerta 7.5 | 240 | 0.018 | 0.164 [0.03, 0.36] | 0.151 [0.04, 0.29] | 1105 | 24 | 18 | 6% |
| Monte Caseros | evacuacion 8.5 | 24 | 0.000 | 0.955 [0.90, 0.99] | — | 1105 | 0 | 0 | 6% |
| Monte Caseros | evacuacion 8.5 | 72 | 0.004 | 0.065 [0.02, 0.13] | 0.072 [0.02, 0.11] | 1105 | 5 | 5 | 6% |
| Monte Caseros | evacuacion 8.5 | 240 | 0.011 | 0.057 [0.02, 0.08] | 0.068 [0.03, 0.10] | 1105 | 13 | 9 | 6% |
| Estación | fechas | abst | motivos | abst con ≥alerta 240h | abst con ≥evac 240h |
|---|---|---|---|---|---|
| Ituzaingó | 1846 | 45 | {"analogos_insuficientes":43,"nivel_actual_no_disponible":2} | 23 | 19 |
| Itá Ibaté | 1779 | 72 | {"analogos_insuficientes":67,"nivel_actual_no_disponible":5} | 6 | 1 |
| Itatí | 1806 | 70 | {"analogos_insuficientes":66,"nivel_actual_no_disponible":4} | 34 | 21 |
| Paso de la Patria | 1871 | 131 | {"analogos_insuficientes":129,"nivel_actual_no_disponible":2} | 51 | 33 |
| Corrientes | 1898 | 70 | {"analogos_insuficientes":70} | 35 | 29 |
| Empedrado | 1612 | 121 | {"analogos_insuficientes":114,"nivel_actual_no_disponible":7} | 5 | 4 |
| Bella Vista | 1813 | 67 | {"analogos_insuficientes":67} | 35 | 17 |
| Goya | 1898 | 50 | {"analogos_insuficientes":50} | 37 | 32 |
| Esquina | 1843 | 47 | {"analogos_insuficientes":44,"nivel_actual_no_disponible":3} | 18 | 17 |
| Santo Tomé | 1549 | 101 | {"analogos_insuficientes":99,"nivel_actual_no_disponible":2} | 31 | 21 |
| Paso de los Libres | 1718 | 115 | {"analogos_insuficientes":115} | 66 | 49 |
| Monte Caseros | 1176 | 71 | {"analogos_insuficientes":68,"nivel_actual_no_disponible":3} | 25 | 14 |

Lectura: BSS = 1,000 con 0 positivos (Itá Ibaté, Empedrado 24/72 h) es degenerado: la climatología asigna una probabilidad mínima y el modelo 0; no prueba habilidad. Empedrado no superó 6,5 m en ninguna fecha puntuada del período: revisar umbral/escala antes de usarlo.

### Hallazgo principal: abstención en crecidas

La abstención es baja en total (2–8 %), pero **se concentra en niveles extremos**, donde hay pocos análogos: en Corrientes 35 fechas abstenidas tuvieron máximo ≥ alerta en 240 h, frente a 54 positivos puntuados (≈ 39 % de las fechas con excedencia quedan sin pronóstico); Goya 37 vs 214, Paso de la Patria 51 vs 43, Paso de los Libres 66 vs 139. El BSS de la tabla mide el modelo sólo donde se pronunció. Antes de publicar probabilidades en crecida (T6/T8) hace falta una regla para niveles fuera de rango (banda proporcional al nivel, ampliar ventana estacional con mínimo de análogos, o abstención explícita `analogos_insuficientes` en la escuela). Decisión de producto pendiente.

### Sensibilidad

BSS climatológico medio entre las 12 estaciones (promedio simple, incluye filas degeneradas sin positivos), en el período previo 1960–1989 (usado para comprobar la elección) y en el retenido:

| Variante | 1960–1989 alerta 24/72/240 | 1960–1989 evac 24/72/240 | 1990–2026 alerta 24/72/240 | 1990–2026 evac 24/72/240 |
|---|---|---|---|---|
| tol 0,2 · ±30 d | 0,94 / 0,66 / 0,44 | 0,82 / 0,70 / 0,38 | 0,82 / 0,65 / 0,40 | 0,55 / 0,33 / 0,32 |
| **tol 0,3 · ±30 d (v1)** | 0,81 / 0,63 / 0,45 | 0,47 / 0,77 / 0,39 | 0,87 / 0,72 / 0,47 | 0,80 / 0,62 / 0,35 |
| tol 0,5 · ±30 d | 0,81 / 0,67 / 0,49 | 0,81 / 0,76 / 0,45 | 0,89 / 0,78 / 0,50 | 0,86 / 0,70 / 0,44 |
| tol 0,3 · ±15 d | 0,87 / 0,69 / 0,38 | 0,90 / 0,71 / 0,38 | 0,84 / 0,64 / 0,39 | 0,78 / 0,54 / 0,34 |
| tol 0,3 · ±45 d | 0,81 / 0,63 / 0,47 | 0,29 / 0,70 / 0,37 | 0,89 / 0,76 / 0,50 | 0,87 / 0,69 / 0,43 |

Los promedios de 24 h de evacuación dependen de muy pocos eventos y varían mucho. Con 240 h, una banda más ancha (0,5 m o ±45 d) mejora levemente en ambos períodos; no se cambió v1 para no ajustar sobre el retenido. Una `analogos-v2` debería fijarse con validación sólo en datos previos a 1990.

## Reversión

Módulos nuevos sin consumidores: se eliminan o se selecciona otra versión del modelo por tramo.
