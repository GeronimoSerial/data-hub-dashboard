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
- [ ] T2 (U2) Altimetría por fuente: tabla + importador del CSV conservador (1.994 candidatas, 7 observadas, 4 ausentes), adaptador de puerto, cota principal (Copernicus) y conservadora (mínimo admisible).
- [ ] T3 (U3a) INA A5: cliente/parser zod, catálogo de estaciones (`cero_ign`, alerta, evacuación, km de río) como dataset versionado, serie diaria histórica de alturas con raw hash.
- [ ] T4 (U3b) INA pronósticos 499/289: corridas, valores, `qualifier`, soporte semanal, dedupe por corrida/emisión, raw inmutable.
- [ ] T5 (U4) Modelo temporal por estación: distribución empírica condicional del máximo en 24/72/240 h (análogos históricos, trayectorias conjuntas entre estaciones), evaluación retrospectiva por años excluidos.
- [ ] T6 (U5) Transferencia por km de río entre estaciones con cero y P(superación del terreno) principal y conservadora, sólo tramos aprobados del cauce principal; resto `no_estimable` con motivo.
- [ ] T7 (U6) Contexto de acceso: cruces por tipo de curso, vados sobre río aforado; `interrupcionEducativa` `no_estimable` con motivo hasta tener umbrales.
- [ ] T8 (U7) Vista candidata: API `app/api/infraestructura/riesgo/candidato/` y admin, sin tocar rutas operativas.
- [ ] T9 (U8) Informe de evaluación: calibración de excedencia de alerta/evacuación por estación, cobertura, abstenciones, comparación con v0.3; condiciones de promoción (sin promover).

## Slices (feature-branch-chain)

Tracker: `GeronimoSerial/motor-v0.4` (base `origin/dev` f07002f7). Cada tarea = una rama hija encadenada `motor-v0.4/NN-<tema>` desde la anterior. Forecast: ~3.500–4.500 líneas autoradas en total.

| Slice | Rama | Tareas | Commits |
|---|---|---|---|
| 01 | `motor-v0.4/01-contratos-candidato` | T1 | 853f4e88 (+ registro ODD) |
| 02 | `motor-v0.4/02-altimetria` | T2 | — |

## Progreso y evidencia

(Por tarea: ruta, trigger, RED/GREEN, checks observados, commit.)

- T1 — ruta: delegated direct (writer trigger: 2+ archivos no triviales). RED/GREEN por comportamiento: contratos 14/14, publicador + CHECK 8/8, padrón, job candidato 5/5, registro; `calcular-riesgo.test.ts` 5/5 tras usar el publicador. Checks: `tsc --noEmit` ok; eslint 0 errores; vitest suite `riesgo+hidrometria+db` 892/892 (2 skip) con `--maxWorkers=6` — sin ese flag fallan hooks `beforeAll` por timeout bajo carga de la máquina, igual en checkout limpio (ambiental). Re-ejecución del padre: 5 archivos de T1, 33/33. Commit 853f4e88 (`feat(riesgo): isolate v0.4 contracts and candidate runs`), ~1.340 líneas autoradas (~550 tests) + snapshot drizzle generado; supera la heurística porque une U0+U1. Excepción: "entradas posteriores a `asOf`" sin insumos fechados en T1 → se prueba en T3/T4. Decisiones: snapshot legado con scores/nivel null, `evidenciaValida=false`, `confianza='baja'` (NOT NULL); publicador sólo acepta `motor-v0.3` operativo.
- Seguimiento: el universo usa todo `ge.ge_localizacion`; prod (lectura 2026-10-17) tiene publicación `localizaciones` que contiene los 2.005 CUE, así que hoy coincide con el filtro de `parte-mapa.ts:650`. Si divergen, alinear.
- RDD off → sin review nativa; candidato de revisión = commit del slice.

## Próximo paso

T2 en `motor-v0.4/02-altimetria`.
