# Integración Motor v0.4 + estado-datos + datos-prod + staging

Branch `GeronimoSerial/motor-v0.4-integracion` from `origin/dev` a6914f16. Not pushed.

## Merges (merge commits, no squash/rebase)
- [x] be8a2597 — motor-v0.4/09-correccion-v03 @ 83c97a67 (slices 01–09)
- [x] abf24e81 — GeronimoSerial/estado-datos @ 72521e2d (clean)
- [x] 34a0f43b — GeronimoSerial/normalizar-datos-prod @ f757a7af
- [x] c9c637b9 — GeronimoSerial/staging-consume-prod @ 60005d94
- [x] ca46f703 — motor-v0.4/09-correccion-v03 @ 8e473729 (new tip appeared after first merge; clean)

## Conflicts and resolutions
- drizzle: dev owns 0024_acceso_osm_edificio. Motor migrations renamed (SQL untouched):
  0024_motor_v04_candidato→0025, 0025_altimetria_escolar_v04→0026, 0026_ina_serie_diaria→0027,
  0027_ina_pronostico→0028. Snapshots 0025–0028 = motor snapshot + dev's `infra_acceso_osm_geometria.edificio`,
  prevId chained from dev 0024. Journal `when` set after dev 0024 (+1..4 min) so the migrator, which
  compares against the last applied timestamp, does not skip them on DBs that already ran dev 0024.
  `drizzle-kit generate` → "No schema changes". lib/db/schema.ts auto-merged.
- jobs-esperados.test.ts (datos-prod): disabled list = union (v0.4 candidate, altimetry, INA jobs, retired climatologies).
- jobs-esperados.ts (staging): kept `JOBS_ESPERADOS_PRODUCTOR` (role split) with dev's radar-meteo 360 min + Coolify comment.
- runbook-scheduler.md: merged quota-budget link and consumer-role sentence.
- Semantic: situacion route test used retired `climatologia-caudal`; fixture moved to `climatologia-imerg` (d58b4530).

## Follow-up commits
- [x] cdcfc5ad — `reservarCupo` calls `asegurarProductorOpenMeteo()` first; test proves no fetch in consumer role.
- [x] 83a540fd — sync-pronostico-caudal: any cell/point without data → job-run `fallido`, `cobertura_parcial` (rows still persisted).
- [x] 6470afd0 — build: insignias-mapa.tsx no longer imports react-dom/server (root cause ca43f5b4); lucide iconNode serialized, byte-identical markup.

## Checks
- Deletions vs a6914f16 and per merge: none.
- vitest full: 4796 pass; failures pre-existing/environmental: app/typography-scale (fails on a6914f16), scripts/backup-postgres (podman).
- tsc: clean. eslint: 6 errors/17 warnings, identical count on a6914f16 (pre-existing).
- pnpm build: OK. geo-static pytest: not run (no pytest/uv in env).

## Open items
- Prod/dev DBs that already applied motor migrations under old tags will re-run them under new tags (idempotent guards).
- Install uv to run geo-static pytest.

## T11 — Promote Motor v0.4 as operational engine (code part)
Route: delegated direct (single bounded writer). Not pushed; prod scheduled tasks NOT applied.
- [x] ddc0bea4 — `MOTOR_VERSION = motor-v0.4` (`MODELO_VERSION_V04` alias, `MOTOR_VERSION_V03` for rollback). `calcular-riesgo` (same TIPO_JOB/block/lease) runs reglas v0.4 via `jobs/insumos-operativo-v04.ts` (padrón, altimetría, terreno/serie INA → `prepararRioV04`), writes `resultado_v04`, run `metadatos` (reglas, insumos, `degradacion`), cobertura keeps its 3 keys. Universe unchanged (`listarCuesConPerfil`). Missing/stale inputs degrade (`padron_no_disponible`, `altimetria_no_disponible`, `terreno_no_disponible`, `serie_ina_desactualizada` > 3 days) to v0.3 river, never crash. Flag `RIESGO_REGLAS_MOTOR` (`flags.ts`, default v0.4; `v0.3` = one-cycle rollback, byte-identical golden test). `publicar-run.ts` accepts both versions, still rejects candidates.
- [x] cb623a6a — jobs-esperados: candidate removed (code kept for manual evaluation runs: smaller change, harness reuse); `sync-ina-serie-diaria` (1440) and `sync-ina-pronostico` (360) enabled with `tipo: null` (they do not write `infra_job_run`; freshness via `hazard_source_health`). Consumers run INA jobs themselves (no shared quota; not in `JOBS_OPEN_METEO`). Altimetry import stays manual.
- [x] (ops commit) — `scripts/configurar-riesgo-v04-operacion.py` + `test_riesgo_v04_operacion.py` + `.github/workflows/riesgo-v04-operacion.yml` (`inspeccionar` default/read-only diff, `configurar` idempotent, `estado`); guards `DATABASE_URL` = `hub_prod`; secrets `COOLIFY_TOKEN`, `COOLIFY_APP_UUID`.
- [x] 3475881c — runbook-scheduler table + `docs/motor-v0.4/promocion.md` (changes, degradation, rollback, SQL checks).
- RED observed: 10 failing tests (flags, publicar-run, operational v0.4) before implementation; GREEN after.
- Checks: vitest riesgo/hidrometria/app/scripts 1843 pass, failures only known env (typography-scale, backup-postgres); tsc clean; eslint riesgo clean; python unittest 4 OK; pnpm build OK.
- Pending (user): run workflow `inspeccionar` then `configurar` on prod; deploy; verify with promocion.md queries; remove rollback flag after one verified cycle.
