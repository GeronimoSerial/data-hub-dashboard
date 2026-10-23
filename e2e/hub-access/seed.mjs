import { registerTsResolver } from '../../scripts/lib/register-ts-resolver.mjs'

const root = process.cwd()
registerTsResolver(root)

// Provision local-only credential accounts with Better Auth's password hash.
// The report/GE fixture runs separately because it deliberately closes its DB.
const [{ auth }, { getDb }, { user, account }, { ensureSeeded }] = await Promise.all([
  import('../../lib/auth.ts'),
  import('../../lib/db/index.ts'),
  import('../../lib/db/schema.ts'),
  import('../../lib/db/seed.ts'),
])
await ensureSeeded()
const db = getDb()
const context = await auth.$context

async function createCredentialUser({ id, email, name, role, password }) {
  const created = await context.internalAdapter.createUser({
    id,
    email,
    name,
    role,
    emailVerified: true,
  }, { method: 'admin' })
  await db.insert(account).values({
    id: crypto.randomUUID(),
    issuer: 'local:credential',
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await context.password.hash(password),
  })
  return created
}

await createCredentialUser({
  id: 't7b-local-admin',
  email: 't7b-admin@example.test',
  name: 'T7b Local Admin',
  role: 'admin',
  password: process.env.T7B_ADMIN_PASSWORD,
})

const restricted = await createCredentialUser({
  id: 't7b-local-infra',
  email: 't7b-infra@example.test',
  name: 'T7b Infrastructure User',
  role: 'consulta',
  password: process.env.T7B_INFRA_PASSWORD,
})
await db.update(user).set({
  hubSecciones: ['infrastructure'],
  hubLanding: false,
  hubDestino: '/mapas/infraestructura',
}).where((await import('drizzle-orm')).eq(user.id, restricted.id))

const mobile = await createCredentialUser({
  id: 't7b-local-mobile',
  email: 't7b-mobile@example.test',
  name: 'T7b Mobile Infrastructure User',
  role: 'consulta',
  password: process.env.T7B_MOBILE_PASSWORD,
})
await db.update(user).set({
  hubSecciones: ['infrastructure'],
  hubLanding: false,
  hubDestino: '/mapas/infraestructura',
}).where((await import('drizzle-orm')).eq(user.id, mobile.id))

for (const fixture of [
  { id: 't7b-local-maps', email: 't7b-maps@example.test', name: 'T7b Maps User', section: 'maps', destination: '/mapas', password: process.env.T7B_MAPS_PASSWORD },
  { id: 't7b-local-reports', email: 't7b-reports@example.test', name: 'T7b Reports User', section: 'reports', destination: '/reportes', password: process.env.T7B_REPORTS_PASSWORD },
  { id: 't7b-local-dashboards', email: 't7b-dashboards@example.test', name: 'T7b Dashboards User', section: 'dashboards', destination: '/tableros', password: process.env.T7B_DASHBOARDS_PASSWORD },
]) {
  const created = await createCredentialUser({ ...fixture, role: 'consulta' })
  await db.update(user).set({
    hubSecciones: [fixture.section],
    hubLanding: false,
    hubDestino: fixture.destination,
  }).where((await import('drizzle-orm')).eq(user.id, created.id))
}

const client = await import('../../lib/db/index.ts').then(({ getRawClient }) => getRawClient())
if (typeof client.close === 'function') await client.close()
else await client.end()
