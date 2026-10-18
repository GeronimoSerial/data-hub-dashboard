# Motor v0.4 — reconciliación de la base (U0)

Corte: 17/10/2026. Fuente: lectura de producción en modo sólo lectura y comparación con `origin/dev` (`f07002f7`). Plan: `odd/tasks/motor-v0-4.md` y el paquete local `Motor v0.4/` (no versionado).

## Base operativa

| Aspecto | Estado verificado |
|---|---|
| Modelo publicado | `motor-v0.3` (`lib/infraestructura/riesgo/motor/config.ts`), job `calcular-riesgo` (`TIPO_JOB = 'calcular-riesgo-v0'`) cada 6 h. |
| Corridas | 14 corridas desde el 14/10/2026; vigente del 17/10/2026 20:15 UTC. |
| Filas por corrida | 2.001 escuelas por horizonte (24/72/240 h): 6.003 resultados procesados. |
| Migraciones | 24 migraciones drizzle idénticas a `origin/dev` `f07002f7`; la última es `0023_prefectura_entregas`. |
| Esquema `ge.*` | Fuera de drizzle: lo crea `ensureGeSchema` (`lib/infraestructura/ge-db.ts`) y lo carga `scripts/sync-ge`. |

La diferencia `motor-v0.2` del checkout copiado en el paquete queda resuelta: el código reconciliado es el de `origin/dev`, que declara `motor-v0.3`.

## Universo

- Padrón `ge.ge_localizacion`: 2.005 CUE/anexo; 4 sin coordenadas (`geo_calidad` "Sin georreferenciación", sin lat/lon).
- El job operativo recorre `listarCuesConPerfil` (`motor/adaptadores/territorio.ts`), que filtra `motivo_exclusion IS NULL`: las 4 escuelas sin coordenadas no reciben fila. Por eso producción emite 2.001 × 3 y no 2.005 × 3.
- Motor v0.4 parte del padrón completo por unión por izquierda (`motor-v04/padron.ts`): se esperan 2.005 × 3 = 6.015 resultados, incluidos los no estimables. Las 6.003 filas de producción son la línea histórica de comparación, no el universo objetivo.

## Datos disponibles que condicionan el plan

- Producción no tiene cero de escala, datum, cota de piso ni partes escolares (tablas vacías).
- INA A5 (`/a5/obs/puntual/estaciones`) publica `cero_ign`, alerta y evacuación para las estaciones del Paraná de Itá Ibaté a Esquina (Corrientes: 42,39 m IGN). Faltan Ituzaingó, Paso de la Patria y todo el Uruguay. El datum se supone SRVN71, sin verificar.
- INA A5 publica series diarias de alturas de Prefectura desde ~1901–1912. Producción sólo guarda p10/p50/p90 de 365 días.
- Corridas INA sin autenticación: sólo la última; hay 73 corridas guardadas para el calibrado 289 (2022–2024) y ninguna para el 499.
- El boletín SSPVN publica el km de río de cada hidrómetro (Corrientes 1208, Goya 972, …): precedente oficial para interpolar linealmente por km.
- Producción tiene rutas OSM, 2.940 cruces de agua (puente/vado), alternativas y exposición de ruta a inundación.

## Decisiones vigentes

- Sin cota de piso: el evento de edificio se publica como **superación del terreno**, nunca como agua dentro del edificio.
- Los partes escolares no son insumo del pronóstico.
- El candidato v0.4 no se promueve en esta entrega.

## Aislamiento introducido en U1 (migración 0024)

- `infra_risk_run.modo` (`operativo` por defecto) y `metadatos`; `infra_risk_snapshot.resultado_v04`. Las filas existentes se leen sin cambios.
- Restricciones `infra_risk_run_modo_check` e `infra_risk_run_candidato_no_vigente`: un candidato no puede quedar `vigente` aunque el código fallara. El índice único parcial de vigente se conserva.
- El publicador explícito (`lib/infraestructura/riesgo/publicar-run.ts`) sólo publica runs operativos de `motor-v0.3`.
- El job `calcular-riesgo-v04-candidato` termina en `completado`, está declarado sin programar y no aparece en lectores operativos, que filtran `estado = 'vigente'`.
