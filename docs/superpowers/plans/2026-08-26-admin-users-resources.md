# Admin Users, Roles, and Resource Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the hub catalog in SQLite, add Better Auth local users with three roles, let editors upload files (or keep an internal `ruta`), and gate opening with `puedeAbrir`.

**Architecture:** One Next.js process. Drizzle + `@libsql/client` (file SQLite) and `uploads/` live under `DATA_DIR`. Better Auth (`emailAndPassword`, plugin `admin`, `nextCookies` last) owns sessions. Catalog titles stay public; `/recursos/[id]`, file streams, `/mapas/matricula`, and static `ruta` targets require session + ACL. `HubDataProvider` reads/writes via Route Handlers instead of in-memory seeds.

**Tech Stack:** Next.js 16 App Router, Fluent UI 9, Better Auth, Drizzle ORM, `@libsql/client`, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-26-admin-users-resources-design.md`

## Global Constraints

- Identidad: cuentas locales, email + contraseña, alta solo desde Administración. Sin SSO, sin registro público.
- Better Auth: `emailAndPassword.disableSignUp: true`. Plugin `admin` para `role` y `banned`. `adminRoles: ['admin']`. Roles: `admin` | `editor` | `consulta`.
- Catálogo: títulos publicados públicos. Abrir = login + `puedeAbrir`.
- Audiencia vacía (0 niveles y 0 personas) = cualquier usuario logueado abre.
- `recursos.nivelId` (clasificación del contenido) ≠ `recurso_audiencia_niveles` (quién abre).
- Archivo XOR `ruta` en un recurso publicable. Borrador puede no tener ninguno.
- Tope 50 MB. MIME visor: pdf, html, png, jpeg, webp, gif. También xlsx/docx (solo descarga). Sin SVG.
- HTML: iframe `sandbox="allow-scripts allow-forms"` sin `allow-same-origin`. Nunca `dangerouslySetInnerHTML` con HTML de usuario. HTML de un solo archivo.
- Editor: CRUD recursos + archivo + audiencia. Admin: eso + usuarios + taxonomías. Consulta: no `/admin`.
- Sin SMTP. Primer Admin: `ADMIN_EMAIL` + `ADMIN_PASSWORD` si no hay usuarios. Admin resetea contraseñas. Ban = desactivar. No eliminar el último Admin activo.
- Persistencia: `$DATA_DIR/hub.sqlite` + `$DATA_DIR/uploads/`. Un contenedor, un volumen. Default local: `.data` (gitignored).
- Copy 403: “No tenés acceso a este recurso”. Login error genérico: “No se pudo iniciar sesión”.
- Existing seed `ruta` values stay as rutas (PDFs in `public/recursos/`, HTML apps `/tablero`, MapLibre `/mapas/matricula`). New uploads use `/recursos/[id]` + `/api/recursos/[id]/archivo`.
- Do not commit `.atl/`. Do not put secrets in git.

---

## File structure

| File | Responsibility |
|------|----------------|
| `lib/data-dir.ts` | Resolve `DATA_DIR`, sqlite path, uploads dir |
| `lib/upload.ts` | MIME allowlist + size check |
| `lib/acl.ts` | `puedeAbrir` + `SessionUser` / `RecursoAccess` types |
| `lib/auth-permissions.ts` | Better Auth access control roles |
| `lib/auth.ts` | Better Auth server instance |
| `lib/auth-client.ts` | Better Auth browser client |
| `lib/session.ts` | `getSessionUser()` for RSC / route handlers |
| `lib/db/index.ts` | LibSQL client + Drizzle `db` |
| `lib/db/schema.ts` | Hub tables + Better Auth tables + `user_niveles` |
| `lib/db/seed.ts` | Seed taxonomías/recursos from `lib/model.ts` + first admin |
| `lib/model.ts` | Keep FORMATOS + types; Recurso gains file + audiencia fields; keep seed arrays for `seed.ts` |
| `vitest.config.ts` | Test runner + `@/` alias |
| `app/api/auth/[...all]/route.ts` | Better Auth handler |
| `app/api/hub/route.ts` | GET published catalog + taxonomies (public) |
| `app/api/hub/admin/route.ts` | GET all rows (editor/admin) |
| `app/api/recursos/route.ts` | POST create recurso (editor/admin) |
| `app/api/recursos/[id]/route.ts` | PUT/DELETE recurso |
| `app/api/recursos/[id]/archivo/route.ts` | POST replace file, GET stream |
| `app/api/taxonomia/[kind]/route.ts` | Admin-only taxonomy upsert/delete |
| `app/api/usuarios/route.ts` | Admin list/create |
| `app/api/usuarios/[id]/route.ts` | Admin update/ban/password/niveles |
| `app/api/gate/[...path]/route.ts` | ACL + stream for static `ruta` files |
| `app/login/page.tsx` | Fluent login |
| `app/recursos/[id]/page.tsx` | In-page viewer |
| `app/forbidden/page.tsx` | 403 copy |
| `middleware.ts` | Cookie gate + rewrite static rutas to `/api/gate/...` |
| `components/hub-data.tsx` | Fetch APIs instead of React seed state |
| `components/admin-page.tsx` | File + audiencia fields; Users tab; hide taxonomy tabs for editor |
| `components/app-shell.tsx` | Login/logout; Admin tab by role |
| `components/resource-card.tsx` | Login callback; `/recursos/[id]` vs `ruta` |
| `app/mapas/matricula/page.tsx` | Server ACL wrapper |
| `app/admin/page.tsx` | Server role gate |
| `Dockerfile` + `docs/DEPLOY.md` | Volume `DATA_DIR=/data` |
| `.gitignore` | `.data/` |

---

### Task 1: Upload allowlist + Vitest

**Files:**
- Create: `lib/upload.ts`
- Create: `lib/upload.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + devDependency `vitest`)
- Modify: `.gitignore` (add `.data/`)

**Interfaces:**
- Consumes: nothing
- Produces: `MAX_UPLOAD_BYTES`, `VIEWER_MIMES`, `DOWNLOAD_MIMES`, `isAllowedUpload({ type, size, name })`

- [ ] **Step 1: Add Vitest**

```bash
pnpm add -D vitest
```

Add to `package.json` scripts: `"test": "vitest run"`.

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

Append `.data/` to `.gitignore`.

- [ ] **Step 2: Write the failing test**

`lib/upload.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, isAllowedUpload } from './upload'

describe('isAllowedUpload', () => {
  it('accepts pdf under 50MB', () => {
    const r = isAllowedUpload({
      type: 'application/pdf',
      size: 1024,
      name: 'a.pdf',
    })
    expect(r).toEqual({ ok: true, mime: 'application/pdf' })
  })

  it('maps .html name to text/html when type is empty', () => {
    const r = isAllowedUpload({ type: '', size: 10, name: 't.html' })
    expect(r).toEqual({ ok: true, mime: 'text/html' })
  })

  it('rejects svg', () => {
    const r = isAllowedUpload({ type: 'image/svg+xml', size: 10, name: 'x.svg' })
    expect(r.ok).toBe(false)
  })

  it('rejects over 50MB', () => {
    const r = isAllowedUpload({
      type: 'application/pdf',
      size: MAX_UPLOAD_BYTES + 1,
      name: 'a.pdf',
    })
    expect(r.ok).toBe(false)
  })

  it('accepts xlsx as download mime', () => {
    const r = isAllowedUpload({
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 100,
      name: 'a.xlsx',
    })
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test lib/upload.test.ts`

Expected: FAIL — cannot find module `./upload`

- [ ] **Step 4: Write minimal implementation**

`lib/upload.ts`:

```ts
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export const VIEWER_MIMES = [
  'application/pdf',
  'text/html',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export const DOWNLOAD_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function isAllowedUpload(file: {
  type: string
  size: number
  name: string
}): { ok: true; mime: string } | { ok: false; error: string } {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'El archivo supera 50 MB' }
  }
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
    return { ok: false, error: 'SVG no permitido' }
  }
  const ext = lower.slice(lower.lastIndexOf('.'))
  const mime = file.type || EXT_MIME[ext] || ''
  const allowed = new Set<string>([...VIEWER_MIMES, ...DOWNLOAD_MIMES])
  if (!allowed.has(mime)) {
    return { ok: false, error: 'Tipo de archivo no permitido' }
  }
  return { ok: true, mime }
}

export function isViewerMime(mime: string) {
  return (VIEWER_MIMES as readonly string[]).includes(mime)
}
```

- [ ] **Step 5: Run tests and make sure they pass**

Run: `pnpm test lib/upload.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/upload.ts lib/upload.test.ts vitest.config.ts package.json pnpm-lock.yaml .gitignore
git commit -m "$(cat <<'EOF'
test: add upload MIME allowlist and Vitest.

EOF
)"
```

---

### Task 2: `puedeAbrir`

**Files:**
- Create: `lib/acl.ts`
- Create: `lib/acl.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:

```ts
export type Role = 'admin' | 'editor' | 'consulta'

export type SessionUser = {
  id: string
  role: Role
  banned: boolean
  nivelIds: string[]
}

export type RecursoAccess = {
  estado: 'publicado' | 'borrador'
  audienciaNivelIds: string[]
  audienciaUserIds: string[]
}

export function puedeAbrir(
  user: SessionUser | null,
  recurso: RecursoAccess,
): boolean
```

- [ ] **Step 1: Write the failing test**

`lib/acl.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { puedeAbrir, type RecursoAccess, type SessionUser } from './acl'

const pub: RecursoAccess = {
  estado: 'publicado',
  audienciaNivelIds: [],
  audienciaUserIds: [],
}

const consulta = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 'u1',
  role: 'consulta',
  banned: false,
  nivelIds: [],
  ...over,
})

describe('puedeAbrir', () => {
  it('denies anonymous', () => {
    expect(puedeAbrir(null, pub)).toBe(false)
  })

  it('allows consulta when audience is empty', () => {
    expect(puedeAbrir(consulta(), pub)).toBe(true)
  })

  it('allows consulta when nivel intersects', () => {
    expect(
      puedeAbrir(consulta({ nivelIds: ['primario', 'secundario'] }), {
        ...pub,
        audienciaNivelIds: ['primario'],
      }),
    ).toBe(true)
  })

  it('denies consulta when nivel misses and not nominated', () => {
    expect(
      puedeAbrir(consulta({ nivelIds: ['inicial'] }), {
        ...pub,
        audienciaNivelIds: ['primario'],
      }),
    ).toBe(false)
  })

  it('allows nominated consulta without matching nivel', () => {
    expect(
      puedeAbrir(consulta({ id: 'u9', nivelIds: [] }), {
        ...pub,
        audienciaNivelIds: ['primario'],
        audienciaUserIds: ['u9'],
      }),
    ).toBe(true)
  })

  it('denies consulta on borrador', () => {
    expect(
      puedeAbrir(consulta(), { ...pub, estado: 'borrador' }),
    ).toBe(false)
  })

  it('allows editor and admin on borrador', () => {
    expect(
      puedeAbrir(consulta({ role: 'editor' }), { ...pub, estado: 'borrador' }),
    ).toBe(true)
    expect(
      puedeAbrir(consulta({ role: 'admin' }), { ...pub, estado: 'borrador' }),
    ).toBe(true)
  })

  it('denies banned users', () => {
    expect(puedeAbrir(consulta({ banned: true }), pub)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/acl.test.ts`

Expected: FAIL — cannot find module `./acl`

- [ ] **Step 3: Write minimal implementation**

`lib/acl.ts`:

```ts
export type Role = 'admin' | 'editor' | 'consulta'

export type SessionUser = {
  id: string
  role: Role
  banned: boolean
  nivelIds: string[]
}

export type RecursoAccess = {
  estado: 'publicado' | 'borrador'
  audienciaNivelIds: string[]
  audienciaUserIds: string[]
}

export function puedeAbrir(
  user: SessionUser | null,
  recurso: RecursoAccess,
): boolean {
  if (!user) return false
  if (user.banned) return false
  if (recurso.estado === 'borrador' && user.role === 'consulta') return false
  if (user.role === 'admin' || user.role === 'editor') return true
  const noAudience =
    recurso.audienciaNivelIds.length === 0 &&
    recurso.audienciaUserIds.length === 0
  if (noAudience) return true
  if (recurso.audienciaUserIds.includes(user.id)) return true
  return user.nivelIds.some((id) => recurso.audienciaNivelIds.includes(id))
}

export function isStaff(role: Role) {
  return role === 'admin' || role === 'editor'
}
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `pnpm test`

Expected: PASS (upload + acl)

- [ ] **Step 5: Commit**

```bash
git add lib/acl.ts lib/acl.test.ts
git commit -m "$(cat <<'EOF'
feat: add puedeAbrir ACL for resource audience.

EOF
)"
```

---

### Task 3: SQLite schema, seed, Hub GET

**Files:**
- Create: `lib/data-dir.ts`
- Create: `lib/db/schema.ts`
- Create: `lib/db/index.ts`
- Create: `lib/db/seed.ts`
- Create: `app/api/hub/route.ts`
- Modify: `package.json` — add `drizzle-orm`, `@libsql/client`, `drizzle-kit`; `onlyBuiltDependencies` in `pnpm-workspace.yaml` include `libsql` if install requires it
- Modify: `next.config.mjs` — `serverExternalPackages: ['@libsql/client', 'libsql']`
- Modify: `lib/model.ts` — extend `Recurso` with optional file + audiencia fields (keep seed arrays)

**Interfaces:**
- Consumes: seed arrays `niveles`, `tipos`, `categorias`, `tags`, `recursos` from `@/lib/model`
- Produces: `getDb()`, `ensureSeeded()`, `schema` tables listed below; `GET /api/hub` JSON

`Recurso` additions in `lib/model.ts`:

```ts
export interface Recurso {
  id: string
  titulo: string
  descripcion: string
  formato: Formato
  nivelId: string
  tipoId: string
  categoriaId: string
  tagIds: string[]
  area: string
  actualizado: string
  estado: 'publicado' | 'borrador'
  ruta?: string
  storageKey?: string
  mime?: string
  nombreOriginal?: string
  size?: number
  audienciaNivelIds?: string[]
  audienciaUserIds?: string[]
}
```

- [ ] **Step 1: Install DB deps**

```bash
pnpm add drizzle-orm @libsql/client
pnpm add -D drizzle-kit
```

`lib/data-dir.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'

export function getDataDir() {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), '.data')
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true })
  return dir
}

export function getSqlitePath() {
  return path.join(getDataDir(), 'hub.sqlite')
}

export function getUploadsDir() {
  return path.join(getDataDir(), 'uploads')
}
```

- [ ] **Step 2: Schema**

`lib/db/schema.ts` (hub tables only in this task; auth tables added in Task 4 — use `text` user ids without FK for audiencia users):

```ts
import { integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core'

export const niveles = sqliteTable('niveles', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  orden: integer('orden').notNull(),
})

export const tipos = sqliteTable('tipos', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  aplicaA: text('aplica_a', { mode: 'json' }).$type<string[]>().notNull(),
})

export const categorias = sqliteTable('categorias', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  color: text('color').notNull(),
})

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
})

export const recursos = sqliteTable('recursos', {
  id: text('id').primaryKey(),
  titulo: text('titulo').notNull(),
  descripcion: text('descripcion').notNull(),
  formato: text('formato').notNull(),
  nivelId: text('nivel_id').notNull().references(() => niveles.id),
  tipoId: text('tipo_id').notNull().references(() => tipos.id),
  categoriaId: text('categoria_id').notNull().references(() => categorias.id),
  area: text('area').notNull(),
  actualizado: text('actualizado').notNull(),
  estado: text('estado').notNull(),
  ruta: text('ruta'),
  storageKey: text('storage_key'),
  mime: text('mime'),
  nombreOriginal: text('nombre_original'),
  size: integer('size'),
})

export const recursoTags = sqliteTable(
  'recurso_tags',
  {
    recursoId: text('recurso_id')
      .notNull()
      .references(() => recursos.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.recursoId, t.tagId] })],
)

export const recursoAudienciaNiveles = sqliteTable(
  'recurso_audiencia_niveles',
  {
    recursoId: text('recurso_id')
      .notNull()
      .references(() => recursos.id, { onDelete: 'cascade' }),
    nivelId: text('nivel_id')
      .notNull()
      .references(() => niveles.id),
  },
  (t) => [primaryKey({ columns: [t.recursoId, t.nivelId] })],
)

export const recursoAudienciaUsuarios = sqliteTable(
  'recurso_audiencia_usuarios',
  {
    recursoId: text('recurso_id')
      .notNull()
      .references(() => recursos.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.recursoId, t.userId] })],
)
```

`lib/db/index.ts`:

```ts
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { getSqlitePath } from '@/lib/data-dir'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (_db) return _db
  const url = `file:${getSqlitePath()}`
  const client = createClient({ url })
  _db = drizzle(client, { schema })
  return _db
}
```

- [ ] **Step 3: Seed + GET /api/hub**

`lib/db/seed.ts`: if `niveles` count is 0, insert `lib/model.ts` seeds (niveles, tipos, categorias, tags, recursos, recursoTags from `tagIds`). Do not insert audiencia rows (empty audience). Call `ensureSeeded()` from `GET /api/hub`.

`app/api/hub/route.ts`: after seed, join recursos with tag ids and audiencia arrays; **filter `estado === 'publicado'`**; return `{ recursos, niveles, tipos, categorias, tags }`.

Add `serverExternalPackages: ['@libsql/client', 'libsql']` to `next.config.mjs`.

- [ ] **Step 4: Point HubDataProvider GET at the API (read-only for now)**

In `components/hub-data.tsx`, on mount `fetch('/api/hub')` and set state. Keep upsert/remove as in-memory until Task 6 (catalog must show DB seed after refresh).

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm build`

Expected: PASS. `pnpm dev` → GET `/api/hub` returns published seed recursos including r1 with `ruta: "/mapas/matricula"`.

- [ ] **Step 6: Commit**

```bash
git add lib/data-dir.ts lib/db lib/model.ts app/api/hub/route.ts components/hub-data.tsx next.config.mjs package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "$(cat <<'EOF'
feat: persist hub catalog seed in SQLite.

EOF
)"
```

---

### Task 4: Better Auth + login + first admin

**Files:**
- Create: `lib/auth-permissions.ts`
- Create: `lib/auth.ts`
- Create: `lib/auth-client.ts`
- Create: `lib/session.ts`
- Create: `app/api/auth/[...all]/route.ts`
- Create: `app/login/page.tsx`
- Create: `.env.example`
- Modify: `lib/db/schema.ts` — append Better Auth tables + `user_niveles` (generate with CLI then keep in repo)
- Modify: `lib/db/seed.ts` — create first admin when `user` table is empty
- Modify: `components/app-shell.tsx` — Iniciar sesión / Salir

**Interfaces:**
- Consumes: `getDb()`, `Role` from `lib/acl.ts`
- Produces: `auth`, `authClient`, `getSessionUser(): Promise<SessionUser | null>`

- [ ] **Step 1: Install Better Auth**

```bash
pnpm add better-auth
```

`.env.example`:

```
BETTER_AUTH_SECRET=replace-with-32+chars
BETTER_AUTH_URL=http://localhost:3000
ADMIN_EMAIL=admin@localhost
ADMIN_PASSWORD=changeme-admin
DATA_DIR=.data
```

Copy to `.env.local` (never commit).

- [ ] **Step 2: Permissions + auth server**

`lib/auth-permissions.ts` — use Better Auth admin access control so custom roles exist:

```ts
import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access'

export const ac = createAccessControl({ ...defaultStatements })

export const admin = ac.newRole({ ...adminAc.statements })
export const editor = ac.newRole({ user: [] })
export const consulta = ac.newRole({ user: [] })
```

`lib/auth.ts`:

```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin as adminPlugin } from 'better-auth/plugins'
import { getDb } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { ac, admin, editor, consulta } from '@/lib/auth-permissions'

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: 'sqlite',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  plugins: [
    adminPlugin({
      ac,
      roles: { admin, editor, consulta },
      defaultRole: 'consulta',
      adminRoles: ['admin'],
    }),
    nextCookies(),
  ],
})
```

`app/api/auth/[...all]/route.ts`:

```ts
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { POST, GET } = toNextJsHandler(auth)
```

Run Better Auth generate **once**, merge user/session/account/verification into `lib/db/schema.ts`, add:

```ts
export const userNiveles = sqliteTable(
  'user_niveles',
  {
    userId: text('user_id').notNull(),
    nivelId: text('nivel_id')
      .notNull()
      .references(() => niveles.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.nivelId] })],
)
```

Ensure generated `user.role` and `user.banned` columns exist (admin plugin).

- [ ] **Step 3: Session helper + first admin seed**

`lib/session.ts`:

```ts
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { userNiveles } from '@/lib/db/schema'
import type { Role, SessionUser } from '@/lib/acl'

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const role = (session.user.role as Role | undefined) ?? 'consulta'
  const banned = Boolean(session.user.banned)
  const rows = await getDb()
    .select({ nivelId: userNiveles.nivelId })
    .from(userNiveles)
    .where(eq(userNiveles.userId, session.user.id))
  return {
    id: session.user.id,
    role,
    banned,
    nivelIds: rows.map((r) => r.nivelId),
  }
}
```

In `ensureSeeded()`, after hub seed, if no rows in `user`: use `auth.$context` internal adapter to create user `role: 'admin'` + credential account with `ctx.password.hash(process.env.ADMIN_PASSWORD)`. Require both env vars; if missing, log and skip (dev catalog still works, login will not).

- [ ] **Step 4: Login page + shell**

`lib/auth-client.ts`:

```ts
import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'
import { ac, admin, editor, consulta } from '@/lib/auth-permissions'

export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles: { admin, editor, consulta } })],
})
```

`app/login/page.tsx` — `'use client'`, Fluent `Field`+`Input`+`Button`. `authClient.signIn.email({ email, password })`. On error show “No se pudo iniciar sesión”. On success `router.replace(callbackUrl)` where `callbackUrl` is the `searchParams` value if it starts with `/`, else `/`. No register link.

`components/app-shell.tsx`: `authClient.useSession()`. If no user, Button “Iniciar sesión” → `/login`. If user, Caption1 with name + Button “Salir” calling `authClient.signOut()` then `router.replace('/')`.

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm build`

Manual: `pnpm dev`, open `/login`, sign in as `ADMIN_EMAIL`. Session cookie present. Sign out.

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts lib/auth-client.ts lib/auth-permissions.ts lib/session.ts lib/db/schema.ts lib/db/seed.ts app/api/auth app/login components/app-shell.tsx .env.example
git commit -m "$(cat <<'EOF'
feat: add Better Auth email login and first admin seed.

EOF
)"
```

---

### Task 5: Persist admin writes + role-gate `/admin`

**Files:**
- Create: `app/api/hub/admin/route.ts`
- Create: `app/api/recursos/route.ts`
- Create: `app/api/recursos/[id]/route.ts`
- Create: `app/api/taxonomia/[kind]/route.ts`
- Modify: `components/hub-data.tsx` — mutations call APIs then refetch
- Modify: `app/admin/page.tsx` — server gate
- Modify: `components/admin-page.tsx` — hide taxonomy tabs unless admin; keep recurso dialog fields from today

**Interfaces:**
- Consumes: `getSessionUser()`, `isStaff()`, `getDb()`, schema tables
- Produces: REST as below

`GET /api/hub/admin` — 401 if anonymous, 403 if `consulta`, else all recursos (including borrador) + taxonomies.

`POST /api/recursos` body: Recurso without file. 403 unless staff. Enforce: if both `ruta` and `storageKey` set, 400.

`PUT /api/recursos/[id]` same. `DELETE` staff only.

`POST /api/taxonomia/[kind]` kind ∈ `niveles|tipos|categorias|tags` — **403 unless `role === 'admin'`**. Delete blocked when `inUse > 0` (same rule as UI today).

- [ ] **Step 1: Implement routes with explicit 401/403/400 JSON `{ error: string }`**

Shared helper in `lib/session.ts`:

```ts
export function staffGuard(user: SessionUser | null) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || !isStaff(user.role))
    return { status: 403 as const, error: 'No tenés acceso a este recurso' }
  return null
}
```

(`isStaff` imported from `lib/acl.ts`.)

- [ ] **Step 2: Wire HubDataProvider**

If `authClient.useSession()` role is staff, fetch `/api/hub/admin`, else `/api/hub`. `upsertRecurso` → PUT/POST then refetch. Taxonomy upserts → taxonomia API; on 403 surface Fluent MessageBar.

- [ ] **Step 3: Gate admin page**

`app/admin/page.tsx` (server):

```ts
import { redirect } from 'next/navigation'
import { AdminPage } from '@/components/admin-page'
import { getSessionUser } from '@/lib/session'
import { isStaff } from '@/lib/acl'

export default async function Admin() {
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/admin')
  if (!isStaff(user.role)) redirect('/forbidden')
  return <AdminPage />
}
```

`app/forbidden/page.tsx`: Title3 “No tenés acceso a este recurso” + Link to `/`.

In `admin-page.tsx`, if session role is `editor`, only render the Recursos tab (no Categorías/Etiquetas/Niveles/Tipos).

App shell: show Administración tab when `role` is `admin` or `editor` (do **not** add `/admin` to `READY_HREFS` — that would mark admin as a public hub section in `hub-page.tsx`). Filter: `NAV.filter(n => n.value !== '/admin' ? isReadyHref(n.value) : isStaff(role))`.

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm build`

Manual: consulta hitting `/admin` → forbidden. Editor can create recurso in DB (refresh persists). Editor cannot open taxonomy APIs (403). Admin can.

- [ ] **Step 5: Commit**

```bash
git add app/api/hub/admin app/api/recursos app/api/taxonomia app/admin/page.tsx app/forbidden components/hub-data.tsx components/admin-page.tsx components/app-shell.tsx lib/session.ts
git commit -m "$(cat <<'EOF'
feat: persist admin catalog writes and gate /admin by role.

EOF
)"
```

---

### Task 6: File upload and authenticated stream

**Files:**
- Create: `app/api/recursos/[id]/archivo/route.ts`
- Modify: `app/api/recursos/[id]/archivo/route.ts` — `export const runtime = 'nodejs'` so the POST is not capped by Server Actions (1 MB). Coolify/proxy must allow 50 MB.
- Modify: `components/admin-page.tsx` RecursoDialog — radio Archivo | Ruta interna; file input

**Interfaces:**
- Consumes: `isAllowedUpload`, `getUploadsDir`, `puedeAbrir`, `getSessionUser`
- Produces: `GET/POST /api/recursos/[id]/archivo`

Storage path: `path.join(getUploadsDir(), recursoId, fileId)` where `fileId` is `crypto.randomUUID()`. Save `storageKey` as `{recursoId}/{fileId}`. If `ruta` is set, POST file returns 400 unless `ruta` is cleared in the same PUT. XOR: updating file nulls `ruta`; setting `ruta` deletes blob + nulls file columns.

- [ ] **Step 1: GET stream**

`GET`: `getSessionUser()`, load recurso + audiencia arrays, `puedeAbrir` or 401/403. `fs.createReadStream` the storageKey. Headers:

- `X-Content-Type-Options: nosniff`
- `Cache-Control: private, no-store`
- `Content-Security-Policy: frame-ancestors 'self'`
- `Content-Type: recurso.mime`
- If `searchParams.download === '1'` or mime is in `DOWNLOAD_MIMES`: `Content-Disposition: attachment; filename="nombreOriginal"`
- Else: `Content-Disposition: inline; filename="nombreOriginal"`

- [ ] **Step 2: POST multipart**

Staff only. `formData.get('file')` as `File`. `isAllowedUpload`. Write disk then update row. Replace: unlink old file if present. At the top of the route file:

```ts
export const runtime = 'nodejs'
export const maxDuration = 60
```

Do not use Server Actions for the file (their default body cap is 1 MB). Note in `docs/DEPLOY.md` that the reverse proxy must allow 50 MB uploads.

- [ ] **Step 3: Dialog UI**

Radio: Archivo vs Ruta interna. File field required for new published recurso without ruta. Show `nombreOriginal` + size. Hint audiencia added in Task 7; this task only XOR file/ruta.

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm build`

Manual: login admin, upload PDF, `GET /api/recursos/{id}/archivo` as consulta with empty audience succeeds; logged-out GET is 401.

- [ ] **Step 5: Commit**

```bash
git add app/api/recursos/[id]/archivo/route.ts components/admin-page.tsx
git commit -m "$(cat <<'EOF'
feat: store resource files and stream them with ACL.

EOF
)"
```

---

### Task 7: Audience UI + users tab

**Files:**
- Modify: `components/admin-page.tsx` — audiencia multiselect; Users tab
- Create: `app/api/usuarios/route.ts`
- Create: `app/api/usuarios/[id]/route.ts`
- Modify: `lib/db/seed.ts` unchanged

**Interfaces:**
- Consumes: Better Auth `auth.api` admin methods via **server** using the request headers (admin session required)
- Produces: user CRUD + `user_niveles` replace-set

- [ ] **Step 1: Audience on recurso dialog**

Fields: Combobox multiselect niveles (from hub niveles) bound to `audienciaNivelIds`; Combobox usuarios from `GET /api/usuarios` (admin+editor can **list** id/name/email for picking; only admin can mutate users). Hint text: “Si no elegís nadie ni niveles, cualquier usuario logueado puede abrir.” Persist via PUT `audienciaNivelIds` / `audienciaUserIds` (replace join rows).

- [ ] **Step 2: Users API (admin only)**

`GET /api/usuarios`: if `!user` 401; if `user.role === 'consulta'` 403; staff can list `{ id, name, email, role, banned, nivelIds }`.

`POST /api/usuarios`: **403 unless admin**. Body `{ email, name, password, role, nivelIds }`. Call `auth.api.createUser` with the incoming headers so Better Auth checks admin plugin. Then replace `user_niveles`.

`PATCH /api/usuarios/[id]`: admin only. `role` via `auth.api.setRole`. `banned: true` via `auth.api.banUser`; `banned: false` via `auth.api.unbanUser`. `password` via `auth.api.setUserPassword`. `nivelIds` replace join. Before ban/role-downgrade: count admins with `role='admin' AND banned=0`; if this user is the last such admin, 400 `{ error: 'No se puede quitar el último administrador' }`.

- [ ] **Step 3: Users tab UI**

Only if session role is `admin`. Table: nombre, email, rol, niveles, estado. Dialog create/edit. Ban switch. Reset password field. Do not show this tab to editor.

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm build`

Manual: admin creates consulta with nivel primario; recurso with audiencia primario opens; consulta without that nivel gets 403 on GET archivo (Task 8 page will consume this). Cannot ban last admin.

- [ ] **Step 5: Commit**

```bash
git add app/api/usuarios components/admin-page.tsx
git commit -m "$(cat <<'EOF'
feat: add resource audience and admin user management.

EOF
)"
```

---

### Task 8: Viewer, cards, 403, login callback

**Files:**
- Create: `app/recursos/[id]/page.tsx`
- Create: `components/recurso-viewer.tsx`
- Modify: `components/resource-card.tsx`
- Modify: `app/forbidden/page.tsx` if not already created

**Interfaces:**
- Consumes: `getSessionUser`, `puedeAbrir`, `isViewerMime`, recurso row
- Produces: in-page viewer at `/recursos/[id]`

- [ ] **Step 1: Server page**

`app/recursos/[id]/page.tsx`:

```ts
import { redirect, notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { getSessionUser } from '@/lib/session'
import { puedeAbrir } from '@/lib/acl'
import { loadRecursoAccess } from '@/lib/db/recurso-access'
import { RecursoViewer } from '@/components/recurso-viewer'

export default async function RecursoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [row] = await getDb().select().from(recursos).where(eq(recursos.id, id))
  if (!row) notFound()
  const user = await getSessionUser()
  if (!user) redirect(`/login?callbackUrl=/recursos/${id}`)
  const access = await loadRecursoAccess(id)
  if (!access || !puedeAbrir(user, access)) redirect('/forbidden')
  if (row.ruta && !row.storageKey) redirect(row.ruta)
  return <RecursoViewer recurso={row} />
}
```

Create `lib/db/recurso-access.ts`:

```ts
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  recursos,
  recursoAudienciaNiveles,
  recursoAudienciaUsuarios,
} from '@/lib/db/schema'
import type { RecursoAccess } from '@/lib/acl'

export async function loadRecursoAccess(
  id: string,
): Promise<RecursoAccess | null> {
  const db = getDb()
  const [row] = await db.select().from(recursos).where(eq(recursos.id, id))
  if (!row) return null
  const niveles = await db
    .select()
    .from(recursoAudienciaNiveles)
    .where(eq(recursoAudienciaNiveles.recursoId, id))
  const users = await db
    .select()
    .from(recursoAudienciaUsuarios)
    .where(eq(recursoAudienciaUsuarios.recursoId, id))
  return {
    estado: row.estado as RecursoAccess['estado'],
    audienciaNivelIds: niveles.map((n) => n.nivelId),
    audienciaUserIds: users.map((u) => u.userId),
  }
}

export async function loadRecursoAccessByRuta(
  ruta: string,
): Promise<{ id: string; access: RecursoAccess } | null> {
  const db = getDb()
  const [row] = await db.select().from(recursos).where(eq(recursos.ruta, ruta))
  if (!row) return null
  const access = await loadRecursoAccess(row.id)
  if (!access) return null
  return { id: row.id, access }
}
```

- [ ] **Step 2: Viewer chrome**

`components/recurso-viewer.tsx` `'use client'`: show titulo. If mime is viewer html: `<iframe sandbox="allow-scripts allow-forms" src={/api/recursos/${id}/archivo} title={titulo} />` (full width, minHeight 70vh). Image: `img`. PDF: iframe without sandbox to the same URL. Download mimes: Body1 + Button linking to `?download=1`. **Do not** set `dangerouslySetInnerHTML`.

- [ ] **Step 3: ResourceCard**

If `recurso.storageKey`: `href = /recursos/${id}` using Next `Link`. Else if `ruta`: keep `isStaticHref` vs Link, but wrap click for anonymous: if no session (`authClient.useSession()`), `href=/login?callbackUrl=${encodeURIComponent(target)}` where target is `/recursos/id` or `ruta`. Staff/consulta with session use the real target. Do not add lock icons.

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm build`

Manual: anonymous catalog titles visible; click upload PDF → login → viewer. Consulta outside audience → forbidden page copy exact.

- [ ] **Step 5: Commit**

```bash
git add app/recursos lib/db/recurso-access.ts components/recurso-viewer.tsx components/resource-card.tsx
git commit -m "$(cat <<'EOF'
feat: add in-page resource viewer with sandboxed HTML.

EOF
)"
```

---

### Task 9: Gate internal rutas (matrícula + static) + Docker

**Files:**
- Modify: `app/mapas/matricula/page.tsx` — split server gate
- Create: `app/mapas/matricula/map-client.tsx` — move current `'use client'` page body
- Create: `app/api/gate/[...path]/route.ts`
- Create: `middleware.ts`
- Modify: `lib/nav.ts` — `GATED_STATIC_PREFIXES`
- Modify: `Dockerfile`
- Modify: `docs/DEPLOY.md`

**Interfaces:**
- Consumes: `loadRecursoAccessByRuta`, `getSessionUser`, `puedeAbrir`, `STATIC_HREFS`
- Produces: same ACL as viewer for `/mapas/matricula` and static `ruta` files

- [ ] **Step 1: Matrícula server page**

Replace `app/mapas/matricula/page.tsx` with a **server** component (no `'use client'`):

```ts
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { puedeAbrir } from '@/lib/acl'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { MatriculaMapClient } from './map-client'

export default async function MatriculaMapRoute() {
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/mapas/matricula')
  const found = await loadRecursoAccessByRuta('/mapas/matricula')
  if (!found || !puedeAbrir(user, found.access)) redirect('/forbidden')
  return <MatriculaMapClient />
}
```

Move the current dynamic import into `map-client.tsx` (`'use client'`).

- [ ] **Step 2: Static gate**

`lib/nav.ts` add:

```ts
export const GATED_STATIC_PREFIXES = [
  '/tablero',
  '/mapa_interactivo',
  '/mapa_sobreedad',
  '/mapa_notas',
] as const

export function gatedStaticPath(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0] || '/'
  if (/\.(html|pdf)$/i.test(path) && path.startsWith('/recursos/')) return path
  const hit = GATED_STATIC_PREFIXES.find(
    (p) => path === p || path.startsWith(`${p}/`),
  )
  return hit ? path : null
}
```

`middleware.ts`: if `gatedStaticPath(pathname)` is set, rewrite to `/api/gate/${pathname.replace(/^\//, '')}` (keep query). Matcher those prefixes + `/recursos/:file.pdf`. Do **not** rewrite `/recursos/[id]` viewer (no file extension).

`app/api/gate/[...path]/route.ts`: reconstruct `/${path.join('/')}`, `getSessionUser()` 401→redirect login is not possible in some fetch; return 401 JSON is wrong for HTML navigation — use `NextResponse.redirect` to `/login?callbackUrl=`. Lookup recurso: exact `ruta` match, or for `/recursos/foo.pdf` match `ruta` equal to that path. If no recurso row, 404. `puedeAbrir` else redirect `/forbidden`. Stream from `path.join(process.cwd(), 'public', relative)` with `nosniff`. For HTML, `Content-Type: text/html; charset=utf-8`.

- [ ] **Step 3: Docker volume**

`Dockerfile` runner stage before `USER nextjs`:

```
ENV DATA_DIR=/data
RUN mkdir -p /data/uploads && chown nextjs:nodejs /data
VOLUME ["/data"]
```

Keep `USER nextjs`. Document that Coolify must mount a volume at `/data`.

`docs/DEPLOY.md` add section **Datos persistentes**:

| Variable | Uso |
|----------|-----|
| `DATA_DIR` | `/data` en el contenedor |
| `BETTER_AUTH_SECRET` | Obligatorio |
| `BETTER_AUTH_URL` | URL pública del FQDN |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Solo primer boot |

Backup = copiar el volumen. Alcance: reportes y admin ahora persisten; no reintroducir Postgres. El proxy de Coolify debe permitir cuerpos de **50 MB** (POST `/api/recursos/:id/archivo`).

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm build`

Manual: logged-out `/mapas/matricula` → login. Consulta not in audience → forbidden. Logged-in allowed user sees MapLibre. `/recursos/reporte-sobreedad-inicial.pdf` through gate. `docker build` still succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/mapas/matricula middleware.ts app/api/gate lib/nav.ts Dockerfile docs/DEPLOY.md
git commit -m "$(cat <<'EOF'
feat: gate internal maps and static rutas; persist DATA_DIR volume.

EOF
)"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Local email/password, disableSignUp | 4 |
| Roles admin/editor/consulta, admin plugin banned | 4, 7 |
| Public published titles | 3 (GET /api/hub filter) |
| `puedeAbrir` rules + empty audience | 2 |
| nivelId ≠ audiencia niveles | 3 schema |
| File XOR ruta, 50MB, MIME, no SVG | 1, 6 |
| Stream headers + HTML sandbox | 6, 8 |
| Editor vs admin surfaces | 5, 7 |
| Users + multi nivel | 7 |
| Viewer + card callback + 403 copy | 8 |
| Map matrícula + static ruta ACL | 9 |
| First admin env, no SMTP, volume | 4, 9 |
| Tests MIME + ACL + `pnpm build` | 1, 2, every later verify step |

No placeholders. Types `SessionUser`, `RecursoAccess`, `puedeAbrir`, `isAllowedUpload`, `loadRecursoAccess`, `loadRecursoAccessByRuta`, `getSessionUser` are named the same in every task.
