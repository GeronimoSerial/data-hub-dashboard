# Enrollment and RENAPER integration
Objective: scoped CGE enrollment and independently sourced RENAPER births. Branch: feat/natalidad-matricula-renaper.
Delivery: two independent consecutive main PRs, then feature-only cherry-picks into staging and prod. Runner: pnpm exec vitest run.
## Specs
S1: "Podemos añadir la información de matricula al mapa de natalidad?" Workbook CGE Inicial/Primario 2021–2026, school and administrative totals including unmatched coordinates.
S2: "podemos añadir la información de natalidad actualiazada hasta el 2025? https://estadisticas.renaper.gob.ar/app_myn/" Independent RENAPER series, never spliced onto DEIS.
S3: "Dale, hacelo" Implementation authorized.
S4: "ok podemos promover a main staging prod? vas a tener que cherrypickear los commits en otro worktree porque aca hay cambios" Isolated promotion; subsequent "si" explicitly authorized GitHub publishing/deployments and GeronimoSerial account.
## Tasks
T1 S1 delegated implementation complete; isolated enrollment commit prepared. Focused tests passed.
T2 S2 delegated implementation complete; independent RENAPER commit pending after T1.
T3 S4 inline GitHub promotion pending; independent deployment verification completed.
## Log
L1: User requested enrollment and births2025 analysis, then "Dale, hacelo". Existing DEIS2014–2023 retained; prior288-school panel not reused.
L2: Workbook37754 rows1181CUEs;17 unmatched retained in totals. Coverage CGE Inicial/Primario only; CUD not published.
L3: Separate RENAPER2012–2025 public Shiny snapshot25 departments×14 years, reverse-order independent replay350/350.2025 provincial12077 vs department12076 reconciled, not redistributed. Risk:item4 asynchronous extraction; independent review no blockers, identity assertion advisory.
L4: User authorized feature-only remote promotion with GeronimoSerial. Original dirty checkout preserved. Clean origin/main61f67fd worktree used; no whole-main merge into environments.
L5: Fresh Node24.15.0 pnpm11.21.0 frozen install0;81 focused tests pass;types0;lint0(36warnings);build0. Full suite6088passed27skipped, sole failure backup-postgres spawn podman ENOENT reproduced on clean base. Generated next-env change restored, no package/lock changes. RDD globally off. Risk:item5 promotion.

L6: T1 committed d06baa6a (384 lines including generated JSON). T2 isolated snapshot/UI prepared; parent spot-check19 tests passed.
