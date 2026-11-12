# Region proof: one build, Corrientes and an empty Manaos

Local proof for B11 (CA1/CA3 in `docs/propuestas/plan-batches-enos.md`): the same build runs
Corrientes and an empty Manaos, with no real Manaos infrastructure. Not part of CI yet.

## Run

```bash
pnpm test:e2e:region          # default: REGION_PROOF_MODE=standalone
pnpm test:e2e:region:docker   # REGION_PROOF_MODE=docker, the repository Dockerfile image
```

Requires Docker (for `postgres:16` only in standalone mode), the Playwright Chromium browser, and network access
(pnpm and npm install packages). Standalone mode also needs enough memory for `pnpm build` with
`--max-old-space-size=6144`.

## Modes

- `standalone` (default): builds once on the host and runs the same build artifact as the Dockerfile runner stage,
  as three plain `node server.js` processes. Use it when Docker cannot build: Docker Desktop with about 7.7 GiB VM
  memory fails `pnpm build` inside the image ("cannot allocate memory", Next starts 27 workers).
  It proves the same thing as docker mode, but not the image itself (base image, user, `HEALTHCHECK`, volume).
- `docker`: builds the repository `Dockerfile` and runs three containers from that image. This is the stronger proof;
  use it on a machine with enough memory.

Environment:

- `REGION_PROOF_MODE=standalone|docker`: default `standalone`.
- `REGION_PROOF_BUILD_DIR=<dir>` (standalone): reuse a build dir from a previous run and skip install and build.
  The dir must contain `.next/standalone/server.js`. A dir passed this way is never deleted.
- `REGION_PROOF_KEEP_BUILD=1` (standalone): keep the build dir this run created. Its path is printed at the end.
- `REGION_PROOF_IMAGE=<tag>` (docker): reuse an existing image instead of building one.
- `REGION_PROOF_KEEP_IMAGE=1` (docker): keep the image after the run (only applies to an image this run built).
- `REGION_PROOF_SHOTS=<dir>`: where screenshots and failure artifacts go. Default: a temp directory printed at the end.
- Extra arguments after `--` go to Playwright, e.g. `pnpm test:e2e:region -- --grep health`.

## What the run does

Standalone mode:

1. Starts `postgres:16` with a published loopback port and an empty `build` database. Static generation needs a
   `DATABASE_URL`: without one, PGlite is shared by 27 Next workers and the build aborts.
2. Copies the repository (no `.git`, `.next`, `node_modules`, `.env*`) to a throwaway dir under the OS temp dir,
   runs `pnpm install --frozen-lockfile` and `pnpm build` there (`NODE_ENV=production`, throwaway `BETTER_AUTH_*`,
   `DATABASE_URL` pointing at `build`, `NODE_OPTIONS=--max-old-space-size=6144`, no `NEXT_PUBLIC_E2E`).
3. Assembles a runner dir with exactly the Dockerfile runner stage's set: `public/`, `.next/standalone/*` at the root,
   `.next/static`, `scripts/`, `config/`, `lib/`, `tsconfig.json`, `drizzle/`, `LICENSE`, `THIRD-PARTY-NOTICES.md`,
   and the dbtools packages (`drizzle-orm`, `zod`, `@electric-sql/pglite`, `h5wasm`, pinned as in the Dockerfile).
   Nothing else from the repo is copied, so a file missing from the runner is missing from the image too.
4. Creates three empty databases in the same container: `region_manaos`, `region_corrientes`,
   `region_atlantida`. No schools, no jobs.
6. Runs `node server.js` in the runner dir three times, with `PORT`, `HOSTNAME=127.0.0.1`, `DATA_DIR` in the temp dir,
   and the same env as docker mode. `REGION=manaos`, `REGION` unset, and `REGION=atlantida`.
7. Waits for `/api/health` to return `{"ok":true}` on Manaos and Corrientes, then warms the first-admin seed.
8. Runs `node scripts/jobs.mjs sync-prefectura-alturas` from the runner dir:
   - `REGION=manaos` must exit 2 with `does not apply to region manaos` on stderr. This proves `config/` is read from the
     runner layout.
   - `REGION` unset must not fail on config lookup (no `REGION desconocida`, no `does not apply`). It may still fail
     later for network or DB reasons, and the run only checks stderr.
9. Atlantida must exit non-zero within 60 s with `REGION desconocida` in its log. No port is served.
10. Runs Playwright, then kills the server process groups, removes the postgres container and the temp dirs,
   even on failure or Ctrl-C.

Docker mode: the same steps with the repository image and containers on a private Docker network.
Atlantida is checked with `docker wait`, and its container publishes no port.

Common to both modes:

1. Waits for `/api/health` on Manaos and Corrientes, then warms the first-admin seed with one unauthenticated
   `GET /api/mapas/infraestructura`. The route runs `ensureSeeded()` before its ACL check (`lib/infraestructura/mapa-ruta.ts`).
   That creates the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and the app's catalog (resources, reasons, ENOS period,
   jurisdiction levels). It inserts no schools and no jobs.
2. Runs Playwright (`playwright.config.ts`, projects `manaos` and `corrientes-vacio`, 1 worker).

## What it proves

- `manaos.spec.ts`: health; map in Portuguese with the `selector-idioma` set to Português; switching to Español
  persists across reload and switches back (stored in `user.idioma`); the school API returns zero schools with
  status 200; the Situation Center shows "Sin datos" and never the "chain verified" line; the Corrientes name does
  not appear in the Manaos map text.
- `portugues.spec.ts` (project `manaos-pt`, M1 CA1): the map tabs, the Camadas panel, `/situacion` and
  `/admin/operacion` render Portuguese with no Spanish marker. The Radar tab is not walked: with an empty database its
  panel crashes the page on `origin/dev` too (open problem). Page content only; the hub shell is still Spanish.
- `corrientes-vacio.spec.ts`: health; the Corrientes tablist label; no language selector.
- `run.mjs`: an invalid `REGION` refuses to boot; in standalone mode, the CLI reads `config/` from the runner layout.

Screenshots: `manaos-mapa-pt.png`, `manaos-mapa-es.png`, `manaos-situacion.png` in `REGION_PROOF_SHOTS`.

## Not verified by this file

- Standalone mode does not prove the Docker image: base image, `USER nextjs`, `/data` volume, `HEALTHCHECK`,
  and `APP_REVISION` are not exercised. Run docker mode for that.
- Whether `REGION=atlantida` makes Next exit (rather than log and stay up). The run asserts it; if it does not,
  the run fails with the process logs.
- The Corrientes-name assertion on the Manaos map has not run yet. If a legitimate mention appears, list its exact
  text in `specs/manaos.spec.ts` instead of relaxing the check.
- Whether the Manaos map needs files under `/data` (for example `mascara-manaos.geojson`) to render. No volume is mounted.

## Files

- `run.mjs`: orchestration and cleanup, both modes.
- `playwright.config.ts`: projects and base URLs from the environment.
- `specs/sesion.ts`: one UI sign-in per project, cookies reused per test, screenshot helper.
- `specs/manaos.spec.ts`, `specs/portugues.spec.ts`, `specs/corrientes-vacio.spec.ts`: the assertions above.
