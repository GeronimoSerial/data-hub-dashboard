# Enrollment and RENAPER integration
Objective: scoped CGE enrollment and independently sourced RENAPER births. Branch: feat/natalidad-matricula-renaper.
Delivery: two independent consecutive main PRs, then feature-only cherry-picks into staging and prod. Runner: pnpm exec vitest run.
## Specs
S1: "Podemos añadir la información de matricula al mapa de natalidad?" Workbook CGE Inicial/Primario 2021–2026, school and administrative totals including unmatched coordinates.
S2: "podemos añadir la información de natalidad actualiazada hasta el 2025? https://estadisticas.renaper.gob.ar/app_myn/" Independent RENAPER series, never spliced onto DEIS.
S3: "Dale, hacelo" Implementation authorized.
S4: "ok podemos promover a main staging prod? vas a tener que cherrypickear los commits en otro worktree porque aca hay cambios" Isolated promotion; subsequent "si" explicitly authorized GitHub publishing/deployments and GeronimoSerial account.
S5: "sigo viendo hasta 2023 nomas en natalidad"; "Dios mio como lo vas a hacer incompleto. Dejame el mapa completo"; "y promovelo a prod cuando esté". RENAPER must drive the complete map and statistics through2025 by default; DEIS remains an explicitly separate alternative.
## Tasks
T4 S5 inline reopened: shared source selection and adapter, complete map/statistics/year/variation behavior with integration regression tests, then main→staging→prod correction.
T1 S1 complete: d06baa6a, main PR199 merged855d3c8b; focused tests passed.
T2 S2 complete:5aaebe17, main PR201 mergeddba7a49e; complete GitHub CI passed.
T3 S4 complete: staging PR202 merge6120dc2e; prod PR203 mergec996100e. Feature-only cherry-picks; both Coolify deployments and HTTP smoke passed.
## Log
L1: User requested enrollment and births2025 analysis, then "Dale, hacelo". Existing DEIS2014–2023 retained; prior288-school panel not reused.
L2: Workbook37754 rows1181CUEs;17 unmatched retained in totals. Coverage CGE Inicial/Primario only; CUD not published.
L3: Separate RENAPER2012–2025 public Shiny snapshot25 departments×14 years, reverse-order independent replay350/350.2025 provincial12077 vs department12076 reconciled, not redistributed. Risk:item4 asynchronous extraction; independent review no blockers, identity assertion advisory.
L4: User authorized feature-only remote promotion with GeronimoSerial. Original dirty checkout preserved. Clean origin/main61f67fd worktree used; no whole-main merge into environments.
L5: Fresh Node24.15.0 pnpm11.21.0 frozen install0;81 focused tests pass;types0;lint0(36warnings);build0. Full suite6088passed27skipped, sole failure backup-postgres spawn podman ENOENT reproduced on clean base. Generated next-env change restored, no package/lock changes. RDD globally off. Risk:item5 promotion.

L6: T1 committed d06baa6a (384 lines including generated JSON). T2 isolated snapshot/UI prepared; parent spot-check19 tests passed.

L7: Main PR199/201 CI success runs41763394094/41764218981. Staging cherry-picks9a3501b6,94ba04b8 deployed successfully run41765165982; production4a8e32b4,a3056cc5 deployed successfully run41765812735. Coolify logs explicitly finished in both environments.
L8: Staging and production public matrícula/RENAPER snapshots HTTP200 and byte-identical to verified outputs; both healthchecks200 oktrue. Original dirty checkout status and tracked diff byte-identical to prepromotion capture. No SSH or database mutation. This final delivery log is local to promotion worktree; deployed feature commits unchanged.

L9: User reported still2023. Confirmed production DEIS default file2014–2023 and RENAPER2012–2025 only collapsed panel. Original acceptance was incomplete: new correction must test actual map year control/data and statistics, not snapshot availability alone.

L10: T4 observed RED on old actual map2023/errorfallback, then GREEN: adapter validates25departments/14years; actual map controls/colors/popup/sparkline/variation/stats2025 and DEIS switch/no remount tested. Independent88focused tests,types/lint/build pass. Full suite609files pass; known missing-Podman failure and expected resource metadata snapshot mismatch; snapshot corrected only2fields and93tests independently rechecked. Browser actual client+MapLibre controls2025,total12077,stats2025,DEIS2023,page_errors empty; geography proof separately pending (standalone harness lacks production styling). Risk:item1 resource description metadata,item5 deployment. RDD globally off.
