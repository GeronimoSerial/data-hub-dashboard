# Motor v0.4 — pronóstico fluvial por escuela en modo candidato

## Objetivo

Implementar Motor v0.4 según `Motor v0.4/PLAN_IMPLEMENTACION.md`, `CONTRATOS.md` y `POLITICA_CONSERVADORA.md`, ajustado a los datos realmente disponibles (verificados el 2026-10-17): anticipar hasta 10 días, por escuela, la superación del terreno por crecida fluvial y el contexto de acceso, en modo **candidato** aislado del operativo `motor-v0.3`.

## Problema y por qué

- `motor-v0.3` (prod, cada 6 h) produce el mismo score en 24/72/240 h cuando domina el río: la evidencia de Prefectura no depende del horizonte (`motor/calculo.ts:283-326`).
- No hay probabilidad con soporte temporal, ni universo completo (las 4 escuelas sin coordenadas no generan fila, `motor/adaptadores/territorio.ts:51-58`).
- El plan v0.4 exige probabilidades sólo donde el modelo y los datos las sostengan; el resto se publica como `no_estimable` con motivo.

## Hechos verificados que cambian el plan (2026-10-17)

- Prod: `motor-v0.3`, 24 migraciones drizzle idénticas a `origin/dev`; esquema `ge.*` fuera de drizzle. U0 queda prácticamente reconciliado.
- Prod no tiene cero de escala, datum, cota de piso ni partes escolares (tablas vacías).
- INA A5 `/a5/obs/puntual/estaciones` publica `cero_ign`, alerta y evacuación para las estaciones del Paraná de Itá Ibaté a Esquina (Corrientes 42,39 m IGN). Faltan Ituzaingó, Paso de la Patria y todo el Uruguay. Datum supuesto SRVN71 (sin verificar).
- Boletín SSPVN publica km de río por hidrómetro (Corrientes 1208, Goya 972…): interpolación lineal por km con precedente oficial.
- INA A5 series: alturas diarias de Prefectura desde ~1901–1912, públicas. Prod sólo guarda p10/p50/p90 de 365 días.
- INA corridas sin autenticación: sólo la última; 73 corridas guardadas para el calibrado 289 (2022-2024), 0 para 499.
- Prod tiene rutas OSM, 2.940 cruces de agua (puente/vado), alternativas y exposición de ruta a inundación.

## Decisiones del usuario

- Base: rama `GeronimoSerial/motor-v0.4` desde `origin/dev` (2026-10-17).
- Partes escolares descartados como insumo (2026-10-17).
- Sin cota de piso por ahora: el evento de edificio se publica como **superación del terreno**, nunca como agua dentro del edificio (2026-10-17).
- Entrega: `feature-branch-chain` — tracker `GeronimoSerial/motor-v0.4`, PRs encadenados hacia el tracker, merge final a `dev` (2026-10-17).
- El motor no cambia el frontend: su único efecto visible es más o menos escuelas en riesgo, vía los campos `nivel`/score existentes (2026-10-17).
- Motor único: v0.4 contiene el cálculo de v0.3 y lo reemplaza; sólo sustituye el factor río (hoy igual en los tres horizontes) por el factor probabilístico donde sea estimable, y conserva el factor río de v0.3 donde no. Al promover, `MOTOR_VERSION` pasa a `motor-v0.4` y se retira la ruta de río de v0.3; no quedan dos motores (2026-10-17).
- Fuentes geográficas adicionales: hidrografía IGN WFS (licencia Ley 27.275 art. 2) como principal para nombre/régimen de cruces; esteros no permanentes de IDE Corrientes `Cuerpo_de_Agua`; `redvialprovincial` (DPV) para tipo de calzada (2026-10-17).

## Alcance autorizado

Código, migraciones aditivas, pruebas y docs en las ramas del chain. Sin push, PR, merge ni cambios en producción sin pedido explícito. Lectura de prod sólo para análisis (read-only). Fuera de alcance: cota de piso, partes escolares, promoción operativa del candidato, servicios OSM cercanos, transporte público, datos de puentes.

## Restricciones

- `null` nunca es 0 ni "seguro"; `no_estimable` exige valor nulo y motivo.
- El candidato nunca queda `vigente`, no vence el operativo, no aparece en consultas públicas.
- Universo completo: una fila por CUE/anexo × 24/72/240 h, incluidas las 4 sin coordenadas.
- La menor cota es un escenario conservador identificado, no una cota más exacta.
- Sólo información disponible en `asOf`; sin fuga temporal en evaluación.
- No asignar una escuela a una estación por cercanía; sólo tramos aprobados.
- Datum: escuelas en SRVN16 (Copernicus convertido aprox.), ceros INA supuestos SRVN71 → se registra como incertidumbre, no se corrige en silencio.
- Tamaño por tarea: ~400 líneas como heurística de planificación, no tope.
- Checks por tarea: `pnpm exec vitest run <rutas>`, `pnpm exec tsc --noEmit`, `pnpm exec eslint <rutas>`.
- RDD: off (global). Delivery: `feature-branch-chain`.

## Checklist

- [x] T1 (U0+U1) Contratos v0.4 (zod), migración 0024 aditiva (`modo`, `metadatos`, CHECK candidato≠vigente, `resultado_v04`), job candidato `calcular-riesgo-v04` con universo completo y todos los eventos `no_estimable`, publicador explícito que rechaza candidatos; doc de reconciliación U0.
- [x] T2 (U2) Altimetría por fuente: tabla + importador del CSV conservador (1.994 candidatas, 7 observadas, 4 ausentes), adaptador de puerto, cota principal (Copernicus) y conservadora (mínimo admisible).
- [x] T3 (U3a) INA A5: cliente/parser zod, catálogo de estaciones (`cero_ign`, alerta, evacuación, km de río) como dataset versionado, serie diaria histórica de alturas con raw hash.
- [x] T4 (U3b) INA pronósticos 499/289: corridas, valores, `qualifier`, soporte semanal, dedupe por corrida/emisión, raw inmutable.
- [x] T5 (U4) Modelo temporal por estación: distribución empírica condicional del máximo en 24/72/240 h (análogos históricos, trayectorias conjuntas entre estaciones), evaluación retrospectiva por años excluidos.
- [x] T6 (U5) Transferencia por km de río entre estaciones con cero y P(superación del terreno) principal y conservadora, sólo tramos aprobados del cauce principal; resto `no_estimable` con motivo.
- [ ] T7 (U6) Contexto de acceso — **diferida** (2026-10-17): el motor único conserva `riesgo_acceso` de v0.3; `interrupcionEducativa` sigue `no_estimable`. La importación de hidrografía IGN / esteros IDE / red vial DPV vive en el job geo-static de accesos OSM, que otro agente está modificando en otra rama; se coordina después para no pisarlo.
- [x] T5b `analogos-v2`: vecinos más cercanos (sin abstención por nivel extremo salvo distancia máxima), parámetros elegidos sólo con datos anteriores a 1990, evaluación del período reservado incluyendo abstenciones; v1 queda para comparación.
- [x] T8 (U7, redefinida) Integrar el factor río probabilístico en `calcularRiesgoEscuela` (cálculo v0.3 completo en el job candidato), proyectar a `nivel`/score existentes por horizonte, fallback al factor río v0.3 donde no sea estimable; sin cambios de frontend ni rutas.
- [ ] T9 (U8) Informe de evaluación: calibración de excedencia de alerta/evacuación por estación, cobertura, abstenciones, escuelas que suben/bajan de nivel frente a v0.3; procedimiento de promoción y retiro de la ruta v0.3 (sin promover).

## Slices (feature-branch-chain)

Tracker: `GeronimoSerial/motor-v0.4` (base `origin/dev` f07002f7). Cada tarea = una rama hija encadenada `motor-v0.4/NN-<tema>` desde la anterior. Forecast: ~3.500–4.500 líneas autoradas en total.

| Slice | Rama | Tareas | Commits |
|---|---|---|---|
| 01 | `motor-v0.4/01-contratos-candidato` | T1 | 853f4e88 (+ registro ODD) |
| 02 | `motor-v0.4/02-altimetria` | T2 | 7180d65d |
| 03 | `motor-v0.4/03-ina-catalogo-serie` | T3 | 0139e672 |
| 04 | `motor-v0.4/04-ina-pronosticos` | T4 | 9d803fb2 |
| 05 | `motor-v0.4/05-modelo-temporal` | T5, T5b | 14557cd2, e464feb6 |
| 06 | `motor-v0.4/06-transferencia-terreno` | T6 | 12015ca0 |
| 07 | `motor-v0.4/07-integracion-v03` | T8 | 3a9a825f |
| 08 | `motor-v0.4/08-evaluacion` | T9 | — |

## Progreso y evidencia

(Por tarea: ruta, trigger, RED/GREEN, checks observados, commit.)

- T1 — ruta: delegated direct (writer trigger: 2+ archivos no triviales). RED/GREEN por comportamiento: contratos 14/14, publicador + CHECK 8/8, padrón, job candidato 5/5, registro; `calcular-riesgo.test.ts` 5/5 tras usar el publicador. Checks: `tsc --noEmit` ok; eslint 0 errores; vitest suite `riesgo+hidrometria+db` 892/892 (2 skip) con `--maxWorkers=6` — sin ese flag fallan hooks `beforeAll` por timeout bajo carga de la máquina, igual en checkout limpio (ambiental). Re-ejecución del padre: 5 archivos de T1, 33/33. Commit 853f4e88 (`feat(riesgo): isolate v0.4 contracts and candidate runs`), ~1.340 líneas autoradas (~550 tests) + snapshot drizzle generado; supera la heurística porque une U0+U1. Excepción: "entradas posteriores a `asOf`" sin insumos fechados en T1 → se prueba en T3/T4. Decisiones: snapshot legado con scores/nivel null, `evidenciaValida=false`, `confianza='baja'` (NOT NULL); publicador sólo acepta `motor-v0.3` operativo.
- Seguimiento: el universo usa todo `ge.ge_localizacion`; prod (lectura 2026-10-17) tiene publicación `localizaciones` que contiene los 2.005 CUE, así que hoy coincide con el filtro de `parte-mapa.ts:650`. Si divergen, alinear.
- RDD off → sin review nativa; candidato de revisión = commit del slice.
- T2 — ruta: delegated direct (Opus low; writer trigger). RED/GREEN: regla 9/9 (incluye harness sobre el CSV real), importador 5/5, job candidato +1. Harness real: 1.918 Copernicus + 76 IGN candidatas, 7 `revisar_georreferencia`, 4 `sin_coordenadas`, 0 discrepancias con el CSV. El writer se bloqueó por `jobs-esperados.test.ts` (lista fija de jobs deshabilitados, fuera de su superficie); el padre agregó `importar-altimetria-v04`. Re-ejecución del padre: vitest `riesgo+db` 774/774 (2 skip) con `--maxWorkers=6`, `tsc --noEmit` ok; eslint ok (writer). Ambiental: `scripts/backup-postgres.test.ts` no carga (`spawn podman ENOENT`). ~800 líneas autoradas (~300 tests) + snapshot drizzle. Decisiones: versión = sha256 del archivo; reversión = borrar sólo las filas de la versión más nueva (el archivo origen se conserva con hash); el importador no usa lease; IGN MDE-Ar v2.1 tratado como SRVN16 nativo (sin verificar); motivos de exclusión de pendientes no se persisten por separado.
- T3 — ruta: delegated direct (Opus low; writer trigger). RED: 4 archivos fallan por módulos inexistentes; GREEN: parser/cliente 11/11, catálogo 5/5, repo 3/3, job 3/3. Checks: vitest `hidrometria+riesgo+db` 929/929 (2 skip) con `--maxWorkers=6`; `tsc --noEmit` ok; eslint ok. ~1.055 líneas autoradas (~310 tests) + 272 de fixtures reales recortados + snapshot drizzle; supera la heurística porque une cliente, catálogo, migración, repo y job. Solicitudes remotas: ~6. Catálogo `ina-a5-2026-10-17.1`, 18 estaciones (`rol = corrientes`): cero+km Corrientes, Empedrado, Bella Vista, Goya, Esquina; sólo cero Itá Ibaté, Itatí (fuera del boletín SSPVN Esquina–Confluencia); sólo km Paso de la Patria; sin ambos Ituzaingó y las 9 del Uruguay. Decisiones: emparejamiento por `id_externo` A5 = `idHistorico` PNA; serie = var 2 medición directa (id serie = id estación en A5); fecha local UTC-3 fijo; repetidas → menor `timestart`, luego menor id; lote crudo PK sha256 de `JSON.stringify(payload)`; discrepancias sólo se informan en el resultado del job (no se persisten); ventana 3.650 días, solape incremental 7 días, tope 300 solicitudes/corrida.
- T4 — ruta: delegated direct (Opus low; writer trigger). RED: 3 archivos nuevos fallan por módulos inexistentes; GREEN: parser/catálogo/cliente 8/8, repo 3/3, job 2/2. Checks: vitest `hidrometria+riesgo+db` 941/941 (2 skip) con `--maxWorkers=6`; `tsc --noEmit` ok; eslint ok. ~830 líneas autoradas (~220 tests) + 327 de fixtures reales recortados (499: 4 series, 289: 3) + snapshot drizzle; supera la heurística porque une catálogo, parser, migración, repo y job. Solicitudes remotas: 5. Catálogo `ina-a5-pronostico-2026-10-17.1` (36 series): 499 `Hms` media semanal en m (`main/p10/p90`) cubre Itá Ibaté, Itatí, Paso de la Patria, Corrientes, Empedrado, Bella Vista, Goya, Esquina; Zárate/Atucha `Hmd` diario; 34881–34883 no publicadas en A5 → `desconocido`. 289 `H` instantánea en m (`inferior/medio/superior`, paso semanal) cubre Corrientes y Goya. Decisiones: corrida = PK (cal_id, cor_id), reingesta no guarda lote ni valores; "más nueva" por `forecast_date`; `hidro_lote_crudo.serie_id = cal_id` con `fuente 'ina-a5-calibrado'`; único con `coalesce(qualifier,'')`; asOf filtra sólo por `forecast_date` (no por descarga); job 6 h previsto, 1 solicitud por calibrado.
- T5 — ruta: delegated direct (Opus low; writer trigger). Método `analogos-v1` (trayectorias análogas empíricas, ventana estacional ±30 d, tolerancia 0,3 m, tendencia 3 d, mín. 30 análogos, edad máx. 2 d) + ensamble conjunto por fechas compartidas + evaluador sin fuga (vista recortada) con Brier/BSS clim/BSS pers/confiabilidad/episodios/IC bootstrap anual. RED: 2 archivos fallan por módulos inexistentes; GREEN: análogos 10/10, evaluación 5/5. Checks: vitest `riesgo+hidrometria` 902/902 (2 skip) con `--maxWorkers=6`; `tsc --noEmit` ok; eslint ok. ~775 líneas autoradas (~185 tests, 141 doc); supera la heurística porque une modelo, ensamble, evaluador y doc con resultados. Solicitudes remotas: 36 (historia completa de 12 series, no versionada). Harness 1990–2026 semanal: BSS vs climatología alerta 24/72/240 h ≈ 0,94/0,86/0,56 en Corrientes, 0,94/0,90/0,73 Goya, 0,98/0,90/0,81 Esquina; vs persistencia menor y con IC que a menudo cruza 0. Hallazgo: la abstención (2–8 %) se concentra en crecidas (Corrientes: 35 fechas abstenidas con ≥ alerta en 240 h vs 54 puntuadas) → decisión pendiente para niveles fuera de rango antes de T6/T8. Empedrado sin excedencias puntuadas (revisar umbral/escala). Sensibilidad: tol 0,5 / ±45 d levemente mejor a 240 h en ambos períodos; v1 no se ajustó sobre el retenido. Doc `docs/motor-v0.4/modelo-temporal.md`.
- T5b — ruta: delegated direct (writer trigger: modelo + evaluador + doc). `analogos-v2`: K vecinos más cercanos por distancia `|Δh| + 1·|Δτ3d| + 0,005 m/día·|Δdoy|` dentro de ±30 d, empates por fecha, abstención sólo por nivel vencido, < K candidatos o miembro a > 6 m (`analogos_lejanos`); diagnóstico `distanciaMaxNivelM`/`fueraDeRangoHistorico` sin alterar P; `ensambleConjuntoV2` reutiliza el ensamble conjunto (estimador inyectable); v1 sin cambios de comportamiento. Evaluador: abstenciones registradas con climatología, `metricasCompletas` (Brier/BSS completo, cobertura y p media de positivos). RED: `analogos-v2.test.ts` falla por módulo inexistente, `metricasCompletas` no existe; GREEN: hidrología 24/24. Checks: vitest `riesgo+hidrometria` 911/911 (2 skip) con `--maxWorkers=6`; `tsc --noEmit` ok; eslint ok. Parámetros elegidos sólo con fechas 1960–1989 (76 combinaciones, criterio BSS completo medio): K 20, tope 6 m (menor valor de la meseta; el resultado mejora monótonamente al subir el tope, abstenerse por distancia nunca le ganó a la climatología). Retenido 1990→2026-10-06 semanal, promedio de estaciones: alerta 240 h BSS clim completo 0,27 → 0,63, positivos con pronóstico 851/1.217 → 1.217/1.217; evacuación 240 h 0,14 → 0,53, 269/526 → 526/526; BSS en fechas puntuadas también mejora (alerta 240 h 0,47 → 0,63); vs persistencia ventaja chica (alerta 240 h 0,17 → 0,20). Corrientes alerta 240 h: 54 → 89/89 positivos con pronóstico, BSS clim 0,72 [0,60, 0,78]. Sin solicitudes remotas nuevas (series de T5). Doc: sección `analogos-v2` en `docs/motor-v0.4/modelo-temporal.md`.

- T6 — ruta: delegated direct (writer trigger: transferencia + superación + puerto + job + doc). `transferencia-nivel.ts`: tramo aprobado de la localidad → estación propia (nunca cercanía); la proyección equirectangular sobre los segmentos adyacentes a la estación propia da t∈[0,1] y el km; la cota en el sitio es la interpolación por km de cero+h; motivos `sin_tramo_aprobado`, `rio_sin_transferencia`, `sin_cero_escala`, `sin_km_rio`, `estacion_sin_coordenadas`, `fuera_de_tramo_interpolable` (más allá de un extremo del tramo; recodo junto a una estación interior → nivel de esa estación). `superacion-terreno.ts`: ensamble conjunto v2 (ref = estación del tramo, compañera = el otro hidrómetro, mismas fechas), P por miembro para 24/72/240 h, principal (Copernicus p10) y conservador (mín. admisible), método `analogos-v2+transferencia-km`, versión `superacion-terreno-v1`, diagnóstico (`kmRio`, `t`, `distanciaEjeKm`, `miembros`, `fueraDeRangoHistorico`, `datumCeroSupuesto`, `conexionHidraulicaSupuesta`, `defensasNoModeladas`). h0: A5 diario + lectura Prefectura posterior al último diario (≤ asOf, UTC−3); vigencia ≤ 2 d por el modelo. Contrato: `diagnostico` opcional en la estimación (refinamientos intactos). Puerto `terreno-adaptador.ts` (lote, no lanza) y job: cada escuela × horizonte llena `superacionTerreno`, ensamble memoizado por par, `insumosHash` con catálogo/tramos/última fecha, contador `conSuperacionTerreno`; `interrupcionEducativa` sigue como en T1; nivel/score heredados sin tocar. RED: 2 módulos inexistentes + caso del job fallando; GREEN: transferencia 8/8, superación 9/9, job 7/7. Checks: vitest `riesgo+hidrometria+db` 983/983 (2 skip) con `--maxWorkers=6`; `tsc --noEmit` ok; eslint ok. ~880 líneas autoradas (~300 tests, 70 doc); supera la heurística porque une dos módulos puros, puerto, integración en el job y doc. Cobertura: según el padrón de `data/natalidad`, como máximo ~432 CUE en 7 localidades (CORRIENTES 287, GOYA 61, BELLA VISTA 30, ESQUINA 26, EMPEDRADO 15, RIACHUELO 8, PUERTO BOCA 5); las de Corrientes aguas arriba de la estación y las de Esquina aguas abajo quedan fuera; la cifra real se conoce con una corrida. Sin solicitudes remotas. Doc `docs/motor-v0.4/superacion-terreno.md`.
- T8 — ruta: delegated direct (writer trigger: cálculo + extracción compartida + job + comparación + doc). Motor único: `calcularRiesgoEscuela` acepta `rioProbabilistico` opcional; sin él (o `principal` null) el resultado es idéntico al de v0.3 (test de referencia con `toEqual`). Con P estimable: componente `100×P_principal` con peso `rioPrefectura`, factor `rio-v04`/`superacion_terreno`/`probabilidad` (metadatos y piso aplicado en `explicacion`; no hay columna JSON), el factor `altura_rio` deja de persistirse pero los pisos observados de v0.3 siguen. Pisos probabilísticos PROVISORIOS (pendientes de decisión del usuario, `motor/config.ts`, `rio-v04-mapeo-provisorio-1`): `P_principal ≥ 0,5` → riesgo ≥ 50; `P_conservador ≥ 0,2` → riesgo ≥ 25. `jobs/compartido-riesgo.ts`: puertos reales con caché, `calcularFilasEscuela`, `insertarEnChunks` (los usan el operativo y el candidato). El candidato corre v0.3 completo por escuela con coordenadas (nivel/score/factores llenos), `resultado_v04` intacto; sin coordenadas conserva la fila T1 con nivel null. `motor-v04/comparacion.ts` (conteos, transiciones y causa por cambio, para T9). `explicar-snapshot` muestra el nuevo factor. RED: 4 casos de cálculo, 2 del job, módulo de comparación inexistente, 1 de explicar; GREEN. Checks: vitest `riesgo+hidrometria+db+app` 1509/1509 (2 skip) con `--maxWorkers=6`; `tsc --noEmit` ok; eslint ok. ~990 líneas en el diff (de ellas ~230 son código movido de `calcular-riesgo.ts` a `compartido-riesgo.ts`; ~170 tests, 60 doc). Supera la heurística porque une el cálculo, la extracción, el job, la comparación y el doc. `MOTOR_VERSION` sigue en `motor-v0.3`. Doc `docs/motor-v0.4/integracion-v03.md`.

## Próximo paso

T9 (informe de evaluación y comparación v0.3/v0.4) y decisión del usuario sobre los umbrales provisorios del río v0.4.
