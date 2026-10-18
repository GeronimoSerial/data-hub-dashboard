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

La abstención es baja en total (2–8 %), pero **se concentra en niveles extremos**, donde hay pocos análogos: en Corrientes 35 fechas abstenidas tuvieron máximo ≥ alerta en 240 h, frente a 54 positivos puntuados (≈ 39 % de las fechas con excedencia quedan sin pronóstico); Goya 37 vs 214, Paso de la Patria 51 vs 43, Paso de los Libres 66 vs 139. El BSS de la tabla mide el modelo sólo donde se pronunció. Antes de publicar probabilidades en crecida (T6/T8) hace falta una regla para niveles fuera de rango (banda proporcional al nivel, ampliar ventana estacional con mínimo de análogos, o abstención explícita `analogos_insuficientes` en la escuela). Resuelto con `analogos-v2` (sección siguiente).

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

## analogos-v2: vecinos más cercanos

`lib/infraestructura/riesgo/motor-v04/hidrologia/analogos-v2.ts`. Resuelve el hallazgo anterior: v1 se abstiene justo en crecida porque exige |h(d) − h0| ≤ 0,3 m y la misma clase de tendencia, y a niveles extremos no hay 30 análogos así. v1 se conserva sin cambios de comportamiento para comparar; la versión se elige con la función (`estimarAnalogos` / `estimarAnalogosV2`, `ensambleConjunto` / `ensambleConjuntoV2`).

- Candidatos: los mismos que v1 (ventana estacional ±30 d, ventana futura completa, d + desfase + 10 < asOf; sólo pasado).
- Distancia, en metros: `|h(d) − h0| + 1·|τ(d) − τ0| + 0,005·|doy(d) − doy0|`, con τ = h(t) − h(t − 3 d). Un día de época vale 5 mm (30 días = 0,15 m). Si τ0 no existe se omite el término.
- Miembros: los K = 20 más cercanos; empates por fecha ascendente. Cada uno aporta h0 + Δj, como en v1, así que P(24) ≤ P(72) ≤ P(240) y el ensamble conjunto usa las mismas fechas en todas las estaciones.
- Abstención: `nivel_actual_no_disponible` (igual que v1), `analogos_insuficientes` si hay menos de K candidatos y `analogos_lejanos` si algún miembro está a más de 6 m en nivel.
- Diagnóstico por estimación: `distanciaMaxNivelM` (la mayor |h(d) − h0| entre los miembros) y `fueraDeRangoHistorico` (h0 por encima de todo nivel visto en la época). Son avisos: no cambian la probabilidad.

### Elección de parámetros (sólo 1960–1989)

Fechas semanales 1960-01-06 → 1989-12-27, cada una con toda la historia anterior. Criterio: BSS completo contra climatología (abstenciones puntuadas con la climatología, ver abajo), promedio simple de estaciones × umbral × horizonte con al menos un positivo. Grilla: K ∈ {15, 20, 30, 40, 50}, tope ∈ {0,5, 1, 1,5, 2, 2,5, 3, 4, 6, 100} m, peso de tendencia ∈ {0,5, 1, 2}, peso estacional ∈ {0,002, 0,005, 0,01} m/día (76 combinaciones, no factorial completa).

| Variante (1960–1989) | BSS completo medio | BSS completo 240 h | positivos alerta 240 h con pronóstico | abstención |
|---|---|---|---|---|
| v1 | 0,15 | 0,14 | 54 % | 9,7 % |
| K 40 · tope 1 m · 1 · 0,01 (punto de partida) | 0,39 | 0,34 | 79 % | 2,9 % |
| K 30 · tope 1,5 m · 1 · 0,005 | 0,58 | 0,49 | 92 % | 0,9 % |
| K 20 · tope 3 m · 1 · 0,005 | 0,77 | 0,63 | 99,5 % | 0,1 % |
| **K 20 · tope 6 m · 1 · 0,005 (v2)** | **0,80** | **0,64** | **100 %** | **0,1 %** |
| K 20 · sin tope · 1 · 0,005 | 0,80 | 0,64 | 100 % | 0,1 % |

El resultado mejora en forma monótona al subir el tope: en 1960–1989 abstenerse por distancia nunca le ganó a la climatología. Se fijó 6 m, el menor tope de la meseta (ninguna abstención por distancia en el período de ajuste), como red de seguridad contra datos fuera de escala más que como límite modelado. K 20 y 15 quedan casi empatados; pesos de tendencia 0,5–1 y estacional 0,002–0,005 dan lo mismo a dos decimales. Parámetros congelados antes de correr 1990–2026.

### Evaluación retenida (1990-01-03 → 2026-10-06, semanal)

"Completo" puntúa cada abstención con la probabilidad climatológica, así que abstenerse no puede esconder un evento perdido. "Con pronóstico" cuenta, entre las fechas cuyo máximo alcanzó el umbral en la ventana, las que recibieron probabilidad del modelo; "p media" es la probabilidad media que recibieron. Positivos = fechas, no episodios.

Promedio de estaciones con positivos (12 en alerta; positivos con pronóstico sobre el total):

| Umbral · h | BSS clim v1 / v2 | BSS pers v1 / v2 | BSS clim completo v1 / v2 | Con pronóstico v1 / v2 |
|---|---|---|---|---|
| alerta 24 | 0,87 / 0,91 | 0,49 / 0,44 | 0,34 / 0,91 | 473 / 813 · 813 / 813 |
| alerta 72 | 0,72 / 0,81 | 0,28 / 0,31 | 0,32 / 0,81 | 560 / 909 · 909 / 909 |
| alerta 240 | 0,47 / 0,63 | 0,17 / 0,20 | 0,27 / 0,63 | 851 / 1.217 · 1.217 / 1.217 |
| evacuación 24 | 0,79 / 0,90 | 0,21 / 0,45 | 0,19 / 0,90 | 96 / 323 · 323 / 323 |
| evacuación 72 | 0,62 / 0,74 | 0,19 / 0,32 | 0,17 / 0,74 | 133 / 372 · 372 / 372 |
| evacuación 240 | 0,35 / 0,53 | 0,11 / 0,15 | 0,14 / 0,53 | 269 / 526 · 526 / 526 |

Alerta, 240 h, por estación:

| Estación | BSS clim v1 / v2 | BSS pers v1 / v2 | abst v1 / v2 | positivos | con pronóstico v1 / v2 | p media positivos v1 / v2 | BSS clim completo v1 / v2 |
|---|---|---|---|---|---|---|---|
| Ituzaingó | 0,46 / 0,59 | 0,07 / 0,05 | 2 % / 0 % | 78 | 55 / 78 | 0,52 / 0,66 | 0,34 / 0,59 |
| Itá Ibaté | 0,01 / 0,41 | 0,00 / 0,34 | 4 % / 0 % | 9 | 3 / 9 | 0,01 / 0,40 | 0,00 / 0,41 |
| Itatí | 0,34 / 0,59 | 0,11 / 0,13 | 4 % / 0 % | 69 | 35 / 69 | 0,41 / 0,68 | 0,18 / 0,59 |
| Paso de la Patria | 0,55 / 0,73 | 0,27 / 0,17 | 7 % / 0 % | 94 | 43 / 94 | 0,53 / 0,75 | 0,27 / 0,73 |
| Corrientes | 0,56 / 0,72 | 0,16 / 0,15 | 4 % / 0 % | 89 | 54 / 89 | 0,58 / 0,74 | 0,35 / 0,72 |
| Empedrado | 1,00 / 0,85 | — / 0,23 | 8 % / 0 % | 5 | 0 / 5 | — / 0,92 | 0,00 / 0,85 |
| Bella Vista | 0,52 / 0,72 | 0,07 / 0,14 | 4 % / 0 % | 85 | 50 / 85 | 0,56 / 0,73 | 0,31 / 0,72 |
| Goya | 0,73 / 0,76 | 0,27 / 0,25 | 3 % / 0 % | 251 | 214 / 251 | 0,77 / 0,81 | 0,63 / 0,76 |
| Esquina | 0,81 / 0,82 | 0,39 / 0,35 | 3 % / 0 % | 199 | 181 / 199 | 0,83 / 0,85 | 0,75 / 0,82 |
| Santo Tomé | 0,05 / 0,28 | 0,11 / 0,14 | 7 % / 0 % | 84 | 53 / 84 | 0,10 / 0,34 | 0,03 / 0,28 |
| Paso de los Libres | 0,40 / 0,53 | 0,26 / 0,23 | 7 % / 0 % | 205 | 139 / 205 | 0,47 / 0,62 | 0,28 / 0,53 |
| Monte Caseros | 0,16 / 0,51 | 0,15 / 0,18 | 6 % / 0 % | 49 | 24 / 49 | 0,14 / 0,48 | 0,08 / 0,51 |

Evacuación, 240 h, por estación:

| Estación | BSS clim v1 / v2 | BSS pers v1 / v2 | abst v1 / v2 | positivos | con pronóstico v1 / v2 | p media positivos v1 / v2 | BSS clim completo v1 / v2 |
|---|---|---|---|---|---|---|---|
| Ituzaingó | 0,24 / 0,53 | 0,05 / 0,07 | 2 % / 0 % | 42 | 23 / 42 | 0,26 / 0,57 | 0,13 / 0,53 |
| Itá Ibaté | 0,00 / -0,24 | -0,01 / -0,24 | 4 % / 0 % | 2 | 1 / 2 | 0,00 / 0,10 | 0,00 / -0,24 |
| Itatí | 0,11 / 0,54 | 0,10 / 0,20 | 4 % / 0 % | 34 | 13 / 34 | 0,13 / 0,57 | 0,04 / 0,54 |
| Paso de la Patria | 0,40 / 0,64 | 0,05 / 0,04 | 7 % / 0 % | 49 | 16 / 49 | 0,38 / 0,69 | 0,14 / 0,64 |
| Corrientes | 0,27 / 0,71 | 0,05 / 0,23 | 4 % / 0 % | 46 | 17 / 46 | 0,32 / 0,71 | 0,10 / 0,71 |
| Empedrado | 1,00 / 0,76 | — / 0,68 | 8 % / 0 % | 4 | 0 / 4 | — / 0,59 | 0,00 / 0,76 |
| Bella Vista | 0,53 / 0,69 | 0,14 / 0,11 | 4 % / 0 % | 26 | 9 / 26 | 0,60 / 0,76 | 0,19 / 0,69 |
| Goya | 0,66 / 0,73 | 0,35 / 0,11 | 3 % / 0 % | 74 | 42 / 74 | 0,72 / 0,83 | 0,38 / 0,73 |
| Esquina | 0,65 / 0,71 | 0,27 / 0,22 | 3 % / 0 % | 65 | 48 / 65 | 0,69 / 0,74 | 0,49 / 0,71 |
| Santo Tomé | 0,02 / 0,28 | 0,04 / 0,09 | 7 % / 0 % | 46 | 25 / 46 | 0,05 / 0,32 | 0,01 / 0,28 |
| Paso de los Libres | 0,29 / 0,56 | 0,14 / 0,21 | 7 % / 0 % | 111 | 62 / 111 | 0,35 / 0,62 | 0,17 / 0,56 |
| Monte Caseros | 0,06 / 0,43 | 0,07 / 0,11 | 6 % / 0 % | 27 | 13 / 27 | 0,05 / 0,42 | 0,03 / 0,43 |

IC 95 % (bootstrap por años, 200 remuestreos) del BSS clim de v2 en alerta 240 h: Corrientes [0,60, 0,78] (21 episodios), Goya [0,69, 0,81] (38), Paso de los Libres [0,46, 0,58] (49).

Lectura:

- v2 da pronóstico a todas las fechas con excedencia (v1 dejaba sin pronóstico 30–70 % de los positivos de evacuación) y además mejora el BSS en las fechas que v1 sí puntuaba. Las únicas abstenciones de v2 son por nivel actual vencido.
- Contra persistencia la ventaja es chica (0,15–0,45) y en Goya evacuación 240 h baja de 0,35 a 0,11: en crecida sostenida "el río sigue arriba" es una referencia difícil.
- Itá Ibaté evacuación (2 positivos) da BSS negativo; Empedrado (4–5 positivos) mantiene la advertencia sobre umbral y escala de T5. Muestras de evacuación chicas: leer por estación con cautela.
- Recomendación: `analogos-v2` como versión por omisión desde T6 (mejor BSS completo y cobertura total de positivos en el período retenido, en ambos umbrales y los tres horizontes).

Limitaciones: el criterio de ajuste usa la climatología como penalidad de abstención, lo que favorece no abstenerse; con h0 fuera del rango histórico v2 traslada incrementos de niveles más bajos (señalado por `fueraDeRangoHistorico`, frecuencia no medida en esta evaluación); la evaluación es semanal y sobre lecturas diarias, no picos horarios.

## Reversión

Módulos nuevos sin consumidores: se eliminan o se selecciona otra versión del modelo por tramo.
