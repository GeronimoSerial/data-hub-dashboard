// Creates the three role accounts of the cuadernillos module (planeamiento, cabecera, supervisor),
// their memberships and the school assignment of one cabecera, from the reviewed list in
// scripts/data/cuentas-cuadernillos-bella-vista.json.
//
// Usage (dry run by default; nothing is written without --apply):
//   CUENTAS_PLANEAMIENTO_PASSWORD=... CUENTAS_CABECERA_PASSWORD=... CUENTAS_SUPERVISOR_PASSWORD=... \
//     node scripts/crear-cuentas-cuadernillos.mjs [--apply]
//
// The target database is the one the app resolves from DATABASE_URL / DATA_DIR. Existing accounts are
// never modified: their password is kept and only the missing membership or assignment is added.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
registerTsResolver(root)

const apply = process.argv.includes('--apply')
const ACCOUNTS = {
  planning: { email: 'planeamiento@mec.gob.ar', name: 'Planeamiento', passwordEnv: 'CUENTAS_PLANEAMIENTO_PASSWORD' },
  cabecera: { email: 'cabecera@mec.gob.ar', name: 'Cabecera', passwordEnv: 'CUENTAS_CABECERA_PASSWORD' },
  supervisor: { email: 'supervisor@mec.gob.ar', name: 'Supervisión', passwordEnv: 'CUENTAS_SUPERVISOR_PASSWORD' },
}

const source = JSON.parse(await readFile(path.join(root, 'scripts/data/cuentas-cuadernillos-bella-vista.json'), 'utf8'))
const passwords = {}
for (const [capability, account] of Object.entries(ACCOUNTS)) {
  const value = process.env[account.passwordEnv]
  if (apply && (!value || value.length < 12)) throw new Error(`${account.passwordEnv} is required (12+ characters) with --apply`)
  passwords[capability] = value
}

const [{ auth }, { getDb, getRawClient }, schema, drizzle] = await Promise.all([
  import('../lib/auth.ts'),
  import('../lib/db/index.ts'),
  import('../lib/db/schema.ts'),
  import('drizzle-orm'),
])
const { and, eq, isNull } = drizzle
const { ensureSeeded } = await import('../lib/db/seed.ts')
await ensureSeeded()
const db = getDb()
const rawClient = getRawClient()

// The reviewed list carries 7-digit CUE bases. The annex is never guessed: it comes from the GE
// padrón and only when the base resolves to exactly one cue_anexo.
const resolved = []
const unresolved = []
for (const school of source.escuelas) {
  const { rows } = await rawClient.query('SELECT cue_anexo FROM ge.ge_localizacion WHERE cue_anexo LIKE $1', [`${school.cue}%`])
  const matches = rows.map((row) => String(row.cue_anexo)).filter((value) => /^\d{9}$/.test(value))
  if (matches.length === 1) resolved.push({ ...school, cueAnexo: matches[0] })
  else unresolved.push({ ...school, matches })
}
const cabecera = resolved.find((school) => school.cue === source.cabecera.cue)
console.log(`schools: ${source.escuelas.length} listed, ${resolved.length} resolved, ${unresolved.length} unresolved`)
for (const school of unresolved) console.log(`  unresolved ${school.cue} ${school.nombre} -> ${school.matches.length} padrón matches`)
if (!cabecera) throw new Error(`cabecera ${source.cabecera.cue} did not resolve to a single cue_anexo`)

const existing = {}
for (const [capability, account] of Object.entries(ACCOUNTS)) {
  const [row] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, account.email)).limit(1)
  existing[capability] = row?.id ?? null
  console.log(`${account.email}: ${row ? 'exists' : 'missing'}`)
}
if (!apply) {
  console.log('dry run: nothing written. Re-run with --apply.')
  process.exit(0)
}

const context = await auth.$context
const ids = { ...existing }
for (const [capability, account] of Object.entries(ACCOUNTS)) {
  if (ids[capability]) continue
  const created = await context.internalAdapter.createUser({
    email: account.email, name: account.name, role: 'consulta', emailVerified: true,
  }, { method: 'admin' })
  await db.insert(schema.account).values({
    id: `account-${created.id}`,
    issuer: 'local:credential',
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await context.password.hash(passwords[capability]),
  })
  await db.update(schema.user).set({ hubSecciones: ['cuadernillos'], hubLanding: false, hubDestino: '/cuadernillos' })
    .where(eq(schema.user.id, created.id))
  ids[capability] = created.id
  console.log(`created ${account.email}`)
}

for (const capability of Object.keys(ACCOUNTS)) {
  const [active] = await db.select({ id: schema.bookletMembership.id }).from(schema.bookletMembership)
    .where(and(eq(schema.bookletMembership.userId, ids[capability]), eq(schema.bookletMembership.capability, capability), isNull(schema.bookletMembership.revokedAt)))
    .limit(1)
  if (active) continue
  await db.insert(schema.bookletMembership).values({
    id: crypto.randomUUID(), userId: ids[capability], capability, grantedByUserId: ids.planning,
  })
  console.log(`membership ${capability} granted`)
}

const { inArray } = drizzle
const present = await db.select({ cueAnexo: schema.bookletSchoolAssignment.cueAnexo }).from(schema.bookletSchoolAssignment)
  .where(inArray(schema.bookletSchoolAssignment.cueAnexo, resolved.map((school) => school.cueAnexo)))
if (present.length > 0) {
  console.log(`assignments: ${present.length} of ${resolved.length} already exist; skipped (nothing is overwritten or partially added)`)
  process.exit(0)
}

const provenance = [{ sourceId: 'CABECERAS.xls', location: source.fuente }]
const sourceRows = resolved.map((school) => ({
  cue: school.cueAnexo,
  schoolName: school.nombre,
  relationship: school.cue === source.cabecera.cue ? 'cabecera' : 'dependiente',
  supervisorName: source.supervisora,
  cabeceraCue: cabecera.cueAnexo,
  provenance,
}))
const { stageAssignmentSourceManifest, confirmStagedAssignmentSource } = await import('../lib/cuadernillos/assignment-source.ts')
const planner = { id: ids.planning, role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
const staged = await stageAssignmentSourceManifest(planner, 'CABECERAS.xls-bella-vista', sourceRows, db)
console.log(`assignments: ${staged.preview.accepted.length} accepted, ${staged.preview.unresolved?.length ?? 0} unresolved, ${staged.preview.conflicts?.length ?? 0} conflicts`)
const result = await confirmStagedAssignmentSource(planner, staged.previewHash, staged.preview.accepted.map((assignment) => ({
  cueAnexo: assignment.cueAnexo,
  sourceRowHash: staged.sourceRowHashes[assignment.cueAnexo],
  supervisorUserId: ids.supervisor,
  cabeceraUserId: ids.cabecera,
})), db)
console.log(`assignments persisted: ${result.persistedCueAnexos.length}, blocked: ${result.blockedCueAnexos.length}, conflicts: ${result.retainedConflictCueAnexos.length}`)
process.exit(0)
