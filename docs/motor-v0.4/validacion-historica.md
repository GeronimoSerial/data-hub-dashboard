# Validación histórica 2000–2026 del motor v0.4 (T10c)

Fecha: 2026-10-18. Alcance: reglas `v0.4` (candidato). El operativo `v0.3` no cambia.
Los datos de trabajo (series A5, escenas Sentinel-2, replays) quedaron en un scratch
local y no se versionan; este documento resume lo que se encontró y qué se cambió.

## 1. Catálogo de eventos (INA A5, 2000–2026)

Se detectaron 178 eventos sobre el nivel de alerta en 11 escalas de Prefectura con serie
diaria A5. Paso de los Libres (47) y Santo Tomé (27) concentran la mayoría.

| Escala | Eventos | Mayor pico 2000–2026 | Días sobre evacuación |
|---|---|---|---|
| Paso de los Libres | 47 | 12,13 m (2017-06-12; evac. 8,5) | 28 |
| Santo Tomé | 27 | 16,33 m (2023-11-22) | — |
| Goya | 22 | 6,59 m (2017-03-28) | 1 |
| Monte Caseros | 17 | 10,00 m (2015-12-28) | 12 |
| Esquina | 13 | 6,05 m (2015-12-31) | 83 |
| Ituzaingó / Paso de la Patria | 12 c/u | 7,78 m Paso de la Patria (2016-01-10) | 52 |
| Corrientes | 11 | 7,47 m (2016-01-09) | 44 |

Defecto de dato: la serie A5 de Santo Tomé trae un valor espurio (1e12 m, 2017-11-26) que
debe filtrarse en cualquier uso de máximos.

## 2. Evidencia Sentinel-2 (borde de agua observado)

Se tomó la elevación Copernicus GLO-30 sobre el borde del agua clasificada en escenas
Sentinel-2 L2A sin nubes, contra la altura A5 del mismo día.

- **Paso de los Libres** (5 fechas: 2019-01-24, 2023-11-04, 2023-11-19, 2023-11-29,
  2024-05-17; h 8,69–11,28 m): el percentil 75 del borde ajusta
  `cota ≈ 39,19 + 0,837·h` (R² 0,953). Con h ≈ 9,4 m el agua real está en ≈ 47,1 m;
  el modelo DEM + anomalía daba ≈ 48,2 m (1–2 m conservador en el Uruguay).
- **Monte Caseros** (2 fechas, h 8,35 y 8,88 m): el DEM está aplanado a 35,5 m por el
  embalse de Salto Grande; el modelo quedaba 3–4 m alto y marcaba la Escuela 347
  (falsa alarma). El borde p75 es ≈ 31,26 + h (pendiente fija 1, sólo 2 fechas).
- **Santo Tomé**: la única escena útil (2023-11-19) no tiene borde argentino utilizable.
  El JIN 4 a 1,9 km del río aparecía como falsa alarma.
- Algunas escuelas toman agua de laguna (56–58 m) como "río" (Santa Ana / Laguna Brava
  cuando se asignan a Corrientes): señales espurias.

## 3. Replay v0.4 sobre los picos (antes de T10c)

- Paraná (Itatí, Paso de la Patria, Corrientes): la regla DEM marcaba 1–6 escuelas
  completas y 5–18 reducidas por pico; Goya 35–51 por el cero + h. Ituzaingó, Bella Vista
  y Esquina: 0 escuelas en todos los picos.
- Uruguay: Paso de los Libres 0–2 escuelas por pico aun con 12,13 m (2017); Santo Tomé y
  Monte Caseros 1–2 marcas por pico, varias de ellas falsas alarmas (JIN 4, Escuela 347).
- La mediana de 365 días hacía que la misma altura diera agua posible ~3 m distinta según
  el año previo (Paso de los Libres: mediana 1,97 m en 2023 vs 4,79 m en 2024).

## 4. Diagnóstico de Paso de los Libres

Con ~9,4 m (octubre 2026) el agua no llega a ningún edificio escolar: la escuela más
cercana está a ~360 m del agua observada. La escuela más baja (1800524-00, terreno 53,8 m)
recién se alcanza con ~15,0 m en la escala con margen de 2 m (17,4 m sin margen); el
récord 2000–2026 es 12,13 m y los análogos (h0 9,44 ± 0,3 m, ± 30 días de estación) llegan
a ≥ 12 m en 10 días en 1 de 106 días análogos y a ≥ 13 m en ninguno.

Los impactos reales son sobre viviendas ribereñas (evacuados en 2017, 2022, 2024 y 2026),
nunca sobre escuelas: la señal relevante es de **acceso / interrupción educativa**
(alumnos evacuados, escuelas usadas como refugio), no de inundación del edificio.

Fuentes (verificadas en `evidencia_impacto.csv`; ninguna menciona escuelas inundadas):

- El Litoral (crecidas 2017 y 2022): https://www.ellitoral.com/nacionales/evacuados-corrientes-crecida-extraordinaria-rio-uruguay_0_WVpIPaY2mr.html
- La Nación 28/5/2024: https://www.lanacion.com.ar/politica/un-intendente-le-pidio-ayuda-a-sandra-pettovello-por-las-inundaciones-pero-no-recibio-respuesta-nid28052024/
- Radio Rafaela 12/10/2026: https://radiorafaela.com.ar/interes-general/paso-de-los-libres-supero-el-nivel-de-evacuacion-y-hay-decenas-de-afectados-por-la-crecida-del-rio-uruguay
- La Nación 15/10/2026: https://www.lanacion.com.ar/sociedad/crecidas-del-parana-y-del-uruguay-zonas-criticas-evacuados-rutas-cortadas-y-fechas-que-inquietan-nid15102026/
- CFIN 17/10/2026: https://www.cfin.com.ar/destacados/crecida-parana-uruguay-evacuados-corrientes/
- TN24 14/10/2026 (Isla Apipé, ruta a parajes con escuelas cortada): https://www.tn24.com.ar/2026/10/corrientes-57-evacuados-y-caminos-cortados-por-la-crecida-del-rio-en-la-isla-apipe/
- Infobae 4/3/2024 (evento pluvial; escuelas como albergue): https://www.infobae.com/sociedad/2024/03/04/el-temporal-en-corrientes-alcanzo-un-nivel-record-de-lluvias-hay-casi-800-evacuados-y-las-clases-fueron-suspendidas/
- Radio EME 10/2026 (Monte Caseros sin evacuados): https://www.radioeme.com/2026/10/crecida-del-rio-uruguay-monte-caseros-permanece-en-alerta-pero-no-registra-evacuados/

## 5. Qué cambió en T10c (sólo reglas v0.4)

Código: `lib/infraestructura/riesgo/motor/referencia-nivel.ts`, `exposicion-v04.ts`,
`adaptadores/rio-prefectura.ts`, `jobs/calcular-riesgo-v04.ts`; constantes en el bloque
v0.4 de `motor/config.ts`. Versión de reglas `reglas-v0.4-2`.

1. **Referencia estable**: la anomalía se mide contra la mediana de la serie A5 en la
   ventana fija 1991–2020 (≥ 10 años con ≥ 300 días). Sin serie suficiente se usa la
   mediana de 365 días y la explicación dice `referencia_inestable`.
2. **Cero efectivo calibrado** (`CEROS_EFECTIVOS_V04`): en Paso de los Libres
   (a 39,19, b 0,837) y Monte Caseros (a 31,26, b 1) el agua posible en el sitio es
   `a + b·(h + subida)` en lugar de DEM + anomalía. Para agregar una estación: ≥ 3
   fechas Sentinel-2 con h distinto, regresión del p75 del borde contra h, documentar
   fechas, n y R² en la constante.
3. **Sólo agua de río**: con cero efectivo, el agua del DEM cuenta como río sólo si está a
   ≤ 3 m de `a + b·referencia`; si no (laguna), la escuela no es evaluable por DEM y cae
   al respaldo JRC. Sin cero efectivo sigue la regla |nivel DEM − tramo| ≤ 3 m. El cero
   IGN de la escala no se usa para esto: el DEM está 1,6–3,7 m por debajo de cero + h.
4. **Altura crítica en la escala**: cada escuela de la zona DEM informa
   `alturaCriticaM` (lectura de la escala del tramo a la que el agua posible + margen
   llega al terreno), `alturaCriticaBandaM`, h0 y el récord de la serie ≤ asOf, p. ej.
   "se alcanza con 15,07 m en la escala (banda 12,68 m); hoy 9,44 m; récord …".
   Fórmulas: cero efectivo `(suelo − margen − a)/b`; DEM `suelo − margen − nivel_dem +
   referencia`. La decisión es la misma regla (h0 + subida ≥ h_crit).

## 6. Evaluación (harness local, prod sólo lectura, asOf 2026-10-18T02:15:04Z)

Niveles (bajo / moderado / alto / muy alto) por horizonte:

| Horizonte | T10b | T10c |
|---|---|---|
| 24 h | 1.961 / 20 / 15 / 5 | 1.962 / 20 / 15 / 4 |
| 72 h | 1.939 / 39 / 14 / 9 | 1.939 / 40 / 17 / 5 |
| 240 h | 1.906 / 66 / 17 / 12 | 1.907 / 66 / 17 / 11 |

Nueve cambios escuela-horizonte, todos a la baja: Paso de la Patria 7 (muy alto → alto en
72/240 h y una alto → bajo en 24 h), Itatí 1 (240 h alto → bajo) y Apipé Grande 1 (24 h
muy alto → alto). Corrientes y Goya sin cambios (Goya es zona modelada; Corrientes 0/2/17).
Paso de los Libres, Monte Caseros y Santo Tomé seguían sin marcas en esta fecha y siguen
así: en Paso de los Libres el agua posible baja de ≈ 48,2 a ≈ 47,1 m y la escuela más
baja (1800524-00) informa altura crítica 15,05 m frente a hoy 9,44 m y récord 13,02 m (1983).

Medianas de largo plazo 1991–2020 (m en la escala): Ituzaingó 1,70; Itá Ibaté 2,38;
Itatí 3,64; Paso de la Patria 3,61; Corrientes 3,65; Empedrado 3,33; Bella Vista 3,68;
Goya 3,82; Esquina 3,51; Santo Tomé 3,70; Paso de los Libres 3,14; Monte Caseros 2,66.
Sin años completos 1991–2020 en la serie A5 cargada (se usa la mediana de 365 días
marcada `referencia_inestable`): Garruchos, Alvear, La Cruz, Yapeyú, Bompland, Mocoretá
(39 escuelas a 24 h con la marca).

## 7. Limitaciones

- La probabilidad P(máx de la escala ≥ h_crit) del ensemble de análogos no se calcula
  todavía en la zona DEM: la decisión usa el escenario de subida (p90 de análogos,
  tendencia, onda), que es la misma regla expresada en altura. La zona modelada (cota
  + transferencia por km) aún no invierte la transferencia para informar h_crit.
- El cero efectivo de Monte Caseros se apoya en 2 fechas con h casi igual (pendiente fija 1).
- El récord descarta picos de un día (> 2,5 m sobre ambos vecinos); otros saltos
  sostenidos (Ituzaingó 9,72 m en 2024-08, Empedrado 12,89 m en 2026-10) requieren revisión.
- La verificación de lagunas sólo mejora en estaciones con cero efectivo; en el resto
  sigue la tolerancia contra el nivel DEM del tramo.
