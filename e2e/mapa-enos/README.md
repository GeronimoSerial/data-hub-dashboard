# Map e2e suite (ENOS)

End-to-end and API contract tests for the infrastructure map. The plan is in `docs/propuestas/plan-tests-e2e-mapa-enos.md`.

## Layout

| Path | Contents |
|---|---|
| `run.mjs` | Runner: builds the app in an isolated copy, starts a throwaway PostgreSQL, seeds it, runs Playwright. |
| `playwright.config.ts` | Projects: `setup`, `chromium`, `mobile`, `chromium-sin-radar`. |
| `setup/auth.setup.ts` | Logs in every QA account once and stores its `storageState` in `.auth/` (git-ignored). |
| `cuentas-qa.ts` | Fixed QA accounts (email, password, role, scope). Test-only credentials. |
| `seed/` | Seed steps run in order by `seed/index.mjs`. `escuelas.ts` is the school roster. |
| `seed/esperados.ts` | Manifest of expected values, plus `verificarCoherencia()`. |
| `contratos/` | API contract helpers: `base.ts` (fixtures per account), `normalizar.ts`, `snapshot.ts`. |
| `contratos/snapshots/` | Versioned JSON snapshots of API responses. |
| `specs/` | Playwright specs for the `chromium` and `mobile` projects. |
| `specs-sin-radar/` | Specs for the server started without the radar. |
| `fixtures/base.ts` | Extended `test`: map helpers and external-request isolation. |

## Running

```sh
pnpm test:e2e:mapa                                        # full suite
pnpm test:e2e:mapa -- e2e/mapa-enos/specs/humo.spec.ts    # one spec (args go to Playwright)
MAPA_E2E_KEEP_DIR=/path/to/out pnpm test:e2e:mapa         # keep the HTML report and artifacts
```

A run takes a few minutes: build, seed, then tests. Each run has its own port, container, and workspace, so runs can happen in parallel. Set `E2E_DATABASE_URL` to use an existing database (CI).

## QA accounts

Same email and password on every run. Passwords are for the ephemeral database only.

| Account | Role | Scope |
|---|---|---|
| `qa-admin@e2e.local` | admin | total |
| `qa-admin-ge@e2e.local` | admin_ge | total |
| `qa-director-nivel@e2e.local` | director_nivel | level 1 (12 schools) |
| `qa-director-sin-alcance@e2e.local` | director_nivel | no level, map denied |
| `qa-consulta-infra@e2e.local` | consulta | infrastructure section |
| `qa-consulta-sin-infra@e2e.local` | consulta | no infrastructure section |
| `qa-operador@e2e.local` | operador_establecimiento | one school |

Better Auth allows 3 sign-ins per 10 s per IP. Only the `setup` project signs in.

## Seed manifest

`seed/esperados.ts` exports `ESPERADOS`: school counts (total, with and without coordinates, per department and per level), the level-1 scope, partes by filter and category, the risk levels, stations, radar, comedor, and history. It re-exports the per-seed constants. Headline counts are literals. `verificarCoherencia()` checks them against the roster and throws if they disagree. Change a value in the same commit that changes the seed.

## API contracts and snapshots

Specs read responses with the account fixtures from `contratos/base.ts`: `apiAdmin`, `apiDirector`, `apiConsultaInfra`, `apiOperador`, `apiAnonimo`.

`compararSnapshot(nombre, valor)` normalizes the value (`contratos/normalizar.ts`: UUIDs become `<uuid:N>`, ISO dates become `<fecha>`, keys are sorted, arrays keep their order) and compares it with `contratos/snapshots/<nombre>.json`. A difference fails the test with a diff.

To change a snapshot on purpose:

```sh
pnpm test:e2e:mapa:snapshots -- e2e/mapa-enos/specs/<spec>.spec.ts
```

This sets `MAPA_E2E_ACTUALIZAR_SNAPSHOTS=1`. The specs write the files in the workspace copy, and `run.mjs` copies `contratos/snapshots/` back into the repository. Review the diff of the snapshot files before committing. Never run the update mode in CI.

## Quality rules (plan section 3)

1. Each test asserts one concrete observable effect: a value, a count, a text, or persisted state.
2. Tests use known seed data and name the expected value (for example 4 high-risk schools), not "more than zero".
3. Tests go through the public interface: clicks, keyboard, navigation, and HTTP responses of the public API.
4. Tests are independent. Tests that write data restore it or use their own records.
5. Each test is checked by mutation when written: break the feature or change the seed, confirm the test fails, then restore.
6. No `waitForTimeout`. Wait for a response, a visible element, or a map event.
