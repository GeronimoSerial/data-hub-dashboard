# ge-cortes-chunked-delete
Objective: stop `eliminarCorte` from holding the booklet eligibility source lock across a whole historic-cut delete.
Branch: fix/ge-cortes-chunked-delete (from origin/main). Delivery: single commit, no push. Test runner: vitest (PGlite).

## Specs
- S1: Never hold the eligibility source lock across chunks. Each 50,000-row chunk of ge_alumno_seccion deletes in its own short transaction; the closing transaction (ge_seccion + ge_corte) is separate.
- S2: The vigente cut is never deleted. Checks (estado in permitted list, no infra_parte reference, FOR UPDATE on ge_corte) run in every chunk transaction and in the closing one.
- S3: Resumable after failure. If the process dies between chunks the cut remains with fewer memberships; a later call finishes without errors. Function signatures unchanged.
- Assumption: no reader needs a historic cut with partial membership. Partial cuts stay estado 'historico' (no marker exists; no migration added).

## Tasks
- T1 (S1, S2, S3) inline. RED: 2 tests failed on the single-transaction code (failure leaves 50,001 rows; no COMMIT between chunks). GREEN: per-chunk transactions + closing transaction. Commit: see git log.

## Log
- L1 (user request, verbatim summary): fix the lock held by `eliminarCorte` for the whole multi-chunk delete; keep safety checks; resumable; add PGlite tests; commit `fix(ge): delete historic cuts in per-chunk transactions`.
- Verification: `vitest run lib/infraestructura` -> 293 files, 2948 passed, 4 skipped, 0 failed. `tsc --noEmit -p .` -> exit 0.
- Readers of partially emptied historic cuts: none found. Historic cuts are read only through infra_parte.corte_id (which blocks deletion); all other readers resolve getCorteVigente. reconstruir-staging-plan copies historic cuts only when referenced by partes.
- Residual: between chunks an 'importando' orphan could in theory be activated by its own import; orphan detection (age > 6 h, no live import) makes this negligible. Not guarded.
