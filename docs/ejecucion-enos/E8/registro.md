# E8 — IA narrativa opcional y acotada (briefing asistido)

Registro único del batch (plan-ejecución §7). Worktree: `enos-e8`, rama `feat/enos-e8`, base `ebe0a9d`.

## Baseline (antes de tocar código)

Ejecutado 2026-09-27 sobre `ebe0a9d`, `--maxWorkers=2`, sin secretos productivos:

| Comando | Exit | Notas |
|---|---|---|
| `pnpm test -- --maxWorkers=2` | 1 | 1503 passed / 1 failed (178/179 archivos OK). Falla preexistente: `components/infraestructura/actualizacion-form.test.tsx:721` (timeout esperando confirmación de guardado offline), no relacionada con E8. Ver `/tmp/e8-baseline-test.log`. |
| `pnpm lint` | 0 | limpio |
| `pnpm exec tsc --noEmit` | 0 | limpio |
| `pnpm build` | 0 | limpio |

## Decisiones locales (N2)

1. **Flag de UI**: el repo ya reserva `AI_BRIEFING_ENABLED` / `aiBriefingEnabled()` en `lib/infraestructura/riesgo/flags.ts` (comentario explícito: "única fuente de lectura... ninguna otra parte del repo debe leer... AI_BRIEFING_ENABLED"), expuesto ya en `/api/infraestructura/operacion/salud`. Se usa ESE flag existente para gobernar `BriefingPanel`, en vez de introducir `BRIEFING_IA_ENABLED` como decía el brief original — mismo propósito, nombre ya establecido por el propio repo antes de este batch. No requiere `ask`: es una convención de nomenclatura ya fijada, no un contrato de producto.
2. **Contrato del corte**: `PuertoCorteSituacion` en `lib/infraestructura/briefing-ia/puertos.ts`, con el `CorteSituacion` espejo de E5 tal como lo definió N1. Adaptador `puertoCorteSituacionNoDisponible` (siempre `null`) hasta que E5 mergee la tabla real.
3. **Proveedor IA**: OpenRouter vía `fetch` nativo (sin SDK nuevo — cumple "sin dependencias nuevas sin justificación"). `zod` ya está en el repo, se reutiliza para el esquema de salida estructurada.
4. **Lease/idempotencia del job**: se reutiliza `adquirirLease`/`publicarResultado` de `lib/infraestructura/riesgo/job-run.ts` (tabla `infra_job_run` genérica por `tipo`), con `tipo='briefing-ia'` y `claveIdempotente=<corteId>`. No se crea infraestructura de lease nueva.
5. **Reintento ante bloqueos**: se envuelve la escritura de `infra_briefing` con `conReintentoPorBloqueo` de `lib/db/reintento.ts`.
6. **UI mount point**: `components/infraestructura/briefing-panel.tsx` (mismo directorio que el resto de componentes de ficha/estado; no se toca `components/mapas` ni ninguna ruta de E5).

## Despachos N3

### Ola 1 — esquema + contratos (2 N3 en paralelo, archivos disjuntos)

1. **N3-Schema** (`lib/db/schema.ts`, `lib/db/seed.ts`): agregó `infraBriefing` (tabla `infra_briefing`) al final de `schema.ts` y su `CREATE TABLE`/índices al final de `HUB_DDL` en `seed.ts`, en bloques `// E8:` / `-- E8:`. Verificado con `git diff`: sólo agrega, no toca ninguna tabla existente. `pnpm exec tsc --noEmit` (completo, ola posterior) confirmó que parsea sin errores.
2. **N3-Dominio** (`lib/infraestructura/briefing-ia/puertos.ts`, `metricas.ts`, `metricas.test.ts`, `esquema.ts`, `esquema.test.ts`): creó `PuertoCorteSituacion`/`CorteSituacion` (campo por campo igual al contrato fijado por N1), `derivarMetricasAutorizadas` (lista blanca de métricas, sin datos nominales ni texto de fuentes) y el esquema Zod de salida del LLM. Verificado por mí re-corriendo `pnpm exec vitest run lib/infraestructura/briefing-ia/ --maxWorkers=2`: 2 archivos / 11 tests, todos passed.

Nota: el N3-Dominio reportó (correctamente, por prudencia) que detectó cambios concurrentes en `schema.ts`/`seed.ts` que no eran suyos — es el N3-Schema corriendo en paralelo en el mismo worktree, comportamiento esperado de esta ola.

## Pruebas reales fechadas

_(pendiente — comando exacto documentado, no se ejecuta con key real en este worktree)_

## UX

_(pendiente — revisión interna + walkthrough)_

## Verificaciones finales

_(pendiente — se repiten los 4 comandos de baseline al cerrar el batch)_

## Gate

_(la completa N1)_
