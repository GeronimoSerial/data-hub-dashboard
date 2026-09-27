# E7b — Replay y evaluación temporal (backend + dataset)

Objetivo: implementar el batch E7b del plan ENOS 2026/2027 (replay de solo lectura,
export, evaluación de anticipación, dataset desidentificado versionado). La UI de
replay sobre el mapa queda para después de E4 y NO se construye acá.

Rama: feat/enos-e7b (worktree propio). N1 commitea; N2/N3 no hacen commit/push/PR.

## Decisiones locales de N2 (registradas, no requieren `ask`)

- Índices nuevos (decisión #6 del brief): en bloque propio `// E7b:` al final de
  schema.ts (NO tocar los arrays de índice de las tablas existentes):
  - `infra_afectacion_creada_en_idx_e7b` sobre `creadaEn` (vista "conocido")
  - `infra_afectacion_rige_desde_idx_e7b` sobre `rigeDesde` (vista "reconstruido")
  - `infra_risk_run_publicado_en_idx_e7b` sobre `publicadoEn` (snapshot de riesgo
    vigente a instante t)
  Mismas columnas ya existentes en las tablas (creada_en, rige_desde,
  publicado_en) — ninguna columna agregada por una migración `ensure*` posterior.
- Dataset desidentificado: archivos CSV bajo `${DATA_DIR}/dataset-replay-e7b/`
  (DATA_DIR ya resuelto por `lib/data-dir.ts`, ya bajo `.data/` en `.gitignore`;
  no hace falta tocar `.gitignore`).
- Flag de UI: no se crea flag nuevo en este batch (no hay UI). El futuro
  consumidor de UI de replay reusará `RISK_ENGINE_ENABLED` (E0) por analogía con
  `/admin/riesgo`; documentado en el registro, decisión final la toma el batch
  de UI (post-E4).
- As-of "conocido en ese momento" filtra por `creadaEn <= t` en infra_afectacion
  (fix del follow-up de E7a), NUNCA por `rigeDesde`. "Vigencia reconstruida" usa
  `rigeDesde`/`retiradaEn` ignorando cuándo se cargó.
- Export sin manifiesto ni hashes (decisión de producto ya registrada en el plan
  2026-09-26).

## Tareas

- [x] T1 — Índices temporales en schema.ts + seed.ts (N3-Datos, escritor único de
      schema.ts/seed.ts esta ola). Archivos: `lib/db/schema.ts`, `lib/db/seed.ts`.
- [x] T2 — Tipos y fixture base de replay (N3, en paralelo con T1, archivos
      disjuntos). Archivos: `lib/infraestructura/replay/tipos.ts`,
      `lib/infraestructura/replay/fixtures.ts`.
- [x] T3 — Motor de consulta replay (dos vistas, cuadros por paso temporal,
      vacíos explícitos, as-of sin fuga). Archivos:
      `lib/infraestructura/replay/consulta.ts`,
      `lib/infraestructura/replay/consulta.test.ts`.
- [x] T4 — API GET /api/infraestructura/replay (N3, en paralelo con T5).
      Archivos: `app/api/infraestructura/replay/route.ts`,
      `app/api/infraestructura/replay/route.test.ts`.
- [x] T5 — API GET /api/infraestructura/replay/export (N3, en paralelo con T4).
      Archivos: `app/api/infraestructura/replay/export/route.ts`,
      `app/api/infraestructura/replay/export/route.test.ts`.
- [x] T6 — Evaluación de anticipación (N3, en paralelo con T7). Archivos:
      `lib/infraestructura/evaluacion/anticipacion.ts`,
      `lib/infraestructura/evaluacion/anticipacion.test.ts`.
- [x] T7 — Dataset desidentificado versionado (N3, en paralelo con T6). Archivos:
      `lib/infraestructura/dataset/export-desidentificado.ts`,
      `lib/infraestructura/dataset/export-desidentificado.test.ts`.
- [x] T8 — Script CLI reproducible de evaluación. Archivo:
      `scripts/evaluar-replay.mjs` (+ `scripts/perf-replay-30d.mjs` para T10).
- [x] T9 — Revisión (sin delegación a un tercero en esta sesión; relectura
      manual dirigida — ver registro.md §3/T9). Sin escritura de código nueva
      más allá de lo ya cubierto por T3/T6/T7.
- [x] T10 — Pruebas reales fechadas (as-of sin fuga: `.data` real sin volumen
      todavía, documentado como pendiente; rendimiento replay 30 días/1 depto
      con datos sintéticos a escala real) + verificaciones finales + registro.md.
      Ver docs/ejecucion-enos/E7b/registro.md.

## Verificación

Cada N3 corre sólo el vitest focalizado de sus archivos. N2 corre
`pnpm exec tsc --noEmit`, `pnpm lint` y el suite completo al final de cada ola
relevante, y de nuevo al cierre.

## Baseline (antes de tocar código)

- `pnpm test`: EXIT=0 con 4 fallas preexistentes no relacionadas (lib/auth.test.ts
  por una condición de carrera de DATA_DIR entre tests, y 2 timeouts en
  components/mapas/map-infraestructura-page.test.tsx — archivo de E4, batch
  hermano, no tocar). 1400 passed / 4 failed / 1404 total.
- `pnpm lint`: EXIT=0.
- `pnpm exec tsc --noEmit`: EXIT=0.
- `pnpm build`: EXIT=0.

## Hallazgo inesperado

Directorio no rastreado `.atl/` presente en el worktree al empezar. No creado por
esta tarea, no tocar; se reporta en el registro y en el worker_done.
