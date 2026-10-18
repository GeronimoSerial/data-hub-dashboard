# Motor v0.4 — integración con el cálculo de v0.3 (motor único)

## Decisión

v0.4 **no es un segundo motor**. Contiene el cálculo de v0.3 (`motor/calculo.ts`, `calcularRiesgoEscuela`) y sólo cambia el factor río, que en v0.3 vale lo mismo en 24, 72 y 240 h. Donde la superación del terreno es estimable (T6), el factor río pasa a ser probabilístico y depende del horizonte. Donde no lo es, se usa el factor río de v0.3 sin cambios.

El frontend no cambia. Lo único que se ve es que hay más o menos escuelas en riesgo, a través de los campos existentes `nivelRiesgo` y `scoreRiesgo` y de los factores.

## Una sola ruta de código

- `calcularRiesgoEscuela` acepta un parámetro opcional `rioProbabilistico` (`EvidenciaRioProbabilistica`, en `motor/tipos.ts`) con `principal`, `conservador`, `ventanaHoras`, `metodo`, `version` y `diagnostico`.
- Si el parámetro falta o `principal` es `null`, el resultado es idéntico byte a byte al de v0.3. Los tests de v0.3 siguen pasando sin cambios, y hay un test que compara contra el resultado de referencia.
- `jobs/compartido-riesgo.ts` reúne lo que comparten los dos jobs: puertos reales con caché por corrida, `calcularFilasEscuela` (núcleo + filas de snapshot y factores) e `insertarEnChunks`. El job operativo (`calcular-riesgo.ts`) y el candidato (`calcular-riesgo-v04.ts`) los usan a los dos.

## Mapeo (provisorio, pendiente de decisión del usuario)

Las constantes están en el bloque v0.4 de `motor/config.ts` (`RIO_V04_MAPEO_VERSION = 'rio-v04-mapeo-provisorio-1'`).

| Elemento | Regla |
|---|---|
| Componente río | `100 × P_principal(horizonte)` (P de superación del terreno con la cota principal), con peso `PESOS_AMENAZA.rioPrefectura` (0,25). Un componente que falta nunca se imputa como 0: su peso se redistribuye entre los presentes. |
| Pisos observados v0.3 | `PISO_AMENAZA/RIESGO_POR_ESTADO_RIO` (alerta y evacuación) se siguen aplicando con la lectura de Prefectura. Un pronóstico nunca quita la evidencia observada. |
| Piso probabilístico alto | `P_principal ≥ UMBRAL_P_ALTO_V04 (0,5)` → riesgo ≥ 50 (alto). |
| Piso probabilístico moderado | `P_conservador ≥ UMBRAL_P_MODERADO_V04 (0,2)` → riesgo ≥ 25 (moderado). |
| Pisos | Sólo suben el riesgo, nunca lo bajan. |

Factor persistido: `fuente 'rio-v04'`, `variable 'superacion_terreno'`, valor = P principal, unidad `'probabilidad'`. `infra_risk_factor` no tiene columna de metadatos, así que el método, la versión, el horizonte, la P conservadora, la versión del mapeo y el piso aplicado (`ninguno`, `observado_<estado>`, `probabilistico_alto` o `probabilistico_moderado`) se guardan en `explicacion` con un formato estable. `explicar-snapshot.ts` lo muestra como «Río: probabilidad N % de que el agua supere el terreno…» y `motor-v04/comparacion.ts` lo usa para saber la causa de cada cambio de nivel. Con P estimable, el factor `altura_rio` de v0.3 no se persiste. Por eso se pierde el aviso de «zona expuesta» que `explicar-snapshot` deduce de ese factor.

## Job candidato

`calcular-riesgo-v04.ts` corre el cálculo de v0.3 completo (todos sus puertos) para cada escuela con coordenadas y cada horizonte, y le pasa la P de T6 cuando `superacionTerreno.principal` está `modelada`. Las columnas heredadas (`nivelRiesgo`, scores, factores) se llenan como las escribiría v0.3 con ese reemplazo. `resultado_v04` guarda el detalle.

Las escuelas sin coordenadas mantienen el comportamiento de T1: tienen fila, con el motivo en `resultado_v04` y el nivel heredado en `null`. v0.3 no genera fila para ellas.

La corrida sigue siendo `modo = 'candidato'`, termina `completado` y nunca `vigente`. `modeloVersion` es `motor-v0.4`.

## Comparación (insumo de T9)

`compararNivelesV03V04(v03, v04)` es una función pura. Por horizonte, devuelve el conteo por nivel (más `sin_nivel`) y las transiciones (sube, baja, igual). También lista las escuelas que cambian de nivel con su causa: `piso_probabilistico`, `piso_observado`, `componente_probabilistico` o `sin_factor_v04`.

## Promoción y retiro (no incluidos en T8)

Al promover:

1. `MOTOR_VERSION` pasa a `motor-v0.4` (y `publicar-run.ts` acepta esa versión como operativa).
2. El job operativo carga los insumos de terreno y le pasa `rioProbabilistico` a `calcularFilasEscuela`, igual que el candidato hoy.
3. Se retira la ruta exclusiva de río de v0.3 cuando hay P estimable. Es la única que hoy decide entre ambos factores. El factor de Prefectura queda sólo como respaldo donde la P no es estimable y como fuente de los pisos observados.
4. Se decide qué pasa con las escuelas sin coordenadas en el operativo y se fijan los umbrales provisorios.

No cambian la lluvia observada, el peligro de celda, el caudal, la susceptibilidad, el historial, el riesgo de acceso (`riesgo_acceso` de v0.3; T7 diferida), la exposición, la confianza ni la clasificación por nivel.

## Limitaciones

- Los umbrales y pisos son provisorios y no están calibrados contra eventos escolares.
- Cuando hay P, una lectura de Prefectura `sin_dato` deja de contar como faltante para la confianza.
- Los metadatos del factor dependen del formato de la explicación (no hay columna JSON).
