import { registerTsResolver } from '../../scripts/lib/register-ts-resolver.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
registerTsResolver(root)

const [{ auth }, { getDb, getRawClient }, { resolveDriver }, schema] = await Promise.all([
  import('../../lib/auth.ts'),
  import('../../lib/db/index.ts'),
  import('../../lib/db/driver.ts'),
  import('../../lib/db/schema.ts'),
])
const { ensureSeeded } = await import('../../lib/db/seed.ts')
const rawClient = getRawClient()
if (resolveDriver() === 'postgres') {
  const target = new URL(process.env.DATABASE_URL ?? '')
  const socket = target.searchParams.get('host')
  const expectedSocket = process.env.T8_E2E_PG_SOCKET
  if (!expectedSocket || socket !== expectedSocket
    || !(socket.startsWith('/tmp/cuadernillos-pg-proof-') || socket.startsWith('/tmp/cuadernillos-pg-e2e.'))) {
    throw new Error('T8 fixture requires the explicit disposable PostgreSQL Unix socket')
  }
  const { rows } = await rawClient.query(`
    SELECT current_database() AS database, inet_server_addr()::text AS address,
           current_setting('server_version_num')::integer AS version
  `)
  if (rows[0]?.database !== 'cuadernillos_e2e' || rows[0]?.address !== null || rows[0]?.version < 150000) {
    throw new Error('T8 PostgreSQL fixture must use database cuadernillos_e2e on a local socket with PostgreSQL 15+')
  }
}
await ensureSeeded()
const db = getDb()
const context = await auth.$context
const { eq } = await import('drizzle-orm')

// Users: planning, cabecera and supervisor are capability holders; admin is a role, not a membership.
const ids = {
  planning: 't8-fixture-planning',
  cabecera: 't8-fixture-cabecera',
  supervisor: 't8-fixture-supervisor',
  admin: 't8-fixture-admin',
}
const roleOf = { planning: 'consulta', cabecera: 'consulta', supervisor: 'consulta', admin: 'admin' }

for (const [capability, userId] of Object.entries(ids)) {
  const created = await context.internalAdapter.createUser({
    id: userId,
    email: `${userId}@example.test`,
    name: `Fixture ${capability}`,
    role: roleOf[capability],
    emailVerified: true,
  }, { method: 'admin' })
  await db.insert(schema.account).values({
    id: `account-${userId}`,
    issuer: 'local:credential',
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await context.password.hash(process.env[`T8_${capability.toUpperCase()}_PASSWORD`]),
  })
  await db.update(schema.user).set({
    hubSecciones: ['cuadernillos'],
    hubLanding: false,
    hubDestino: '/cuadernillos',
  }).where(eq(schema.user.id, userId))
  if (capability !== 'admin') {
    await db.insert(schema.bookletMembership).values({
      id: `membership-${capability}`,
      userId,
      capability,
      grantedByUserId: ids.planning,
    })
  }
}

const now = new Date()
const campaignId = 't8-fixture-campaign'
const productId = 't8-fixture-product'
const productExtraId = 't8-fixture-product-extra'
const requestId = 't8-fixture-pending'
const rand9 = () => String(100_000_000 + Math.floor(Math.random() * 900_000_000))
const headCue = rand9()
// Consejo schools whose current map severity is Crítica. Only the cabecera has an assignment row;
// the Anexo school is the requested recipient and the other two are searchable but unrequested.
const criticalCues = []
while (criticalCues.length < 3) {
  const cue = rand9()
  if (cue !== headCue && !criticalCues.includes(cue)) criticalCues.push(cue)
}
const [recipientCue, criticalB, criticalC] = criticalCues
const criticalNames = ['Escuela Anexo de prueba', 'Escuela Crítica B de prueba', 'Escuela Crítica C de prueba']

await db.insert(schema.bookletCampaign).values({
  id: campaignId, name: 'Campaña de prueba aislada', status: 'active',
  distributionEnabled: true, overassignmentAllowed: false,
})
for (const [id, name, level] of [
  [productId, 'Cuadernillo de prueba', 'FIXTURE'],
  [productExtraId, 'Cuadernillo Ampliado de prueba', 'FIXTURE2'],
]) {
  await db.insert(schema.bookletProduct).values({ id, name, levelCode: level, gradeCode: level })
  await db.insert(schema.bookletProductMapping).values({
    productId: id, sourceLevelCode: level, sourceGradeCode: level,
    confirmedByUserId: ids.planning, confirmedAt: now,
  })
}

// Confirmed cabecera assignment through the same staging/confirm path the app uses, so the
// hash bindings stay valid for approvalAuthorityReady.
const cabeceraProvenance = [{ sourceId: 'synthetic-fixture', location: 'e2e/cuadernillos/seed.mjs!cabecera' }]
const sourceRows = [
  { cue: headCue, schoolName: 'Escuela Cabecera de prueba', relationship: 'cabecera', supervisorName: 'Supervisor de prueba', cabeceraCue: headCue, provenance: cabeceraProvenance },
]
const { stageAssignmentSourceManifest, confirmStagedAssignmentSource } = await import('../../lib/cuadernillos/assignment-source.ts')
const plannerActor = { id: ids.planning, role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
const staged = await stageAssignmentSourceManifest(plannerActor, 't8-synthetic-source', sourceRows, db)
await confirmStagedAssignmentSource(plannerActor, staged.previewHash, staged.preview.accepted.map((assignment) => ({
  cueAnexo: assignment.cueAnexo,
  sourceRowHash: staged.sourceRowHashes[assignment.cueAnexo],
  supervisorUserId: ids.supervisor,
  cabeceraUserId: ids.cabecera,
})), db)

// Map severity: GE localization, a vigente infra_parte with an active Crítica afectación, and a
// nivel 9 (Consejo) row in ge_escuela_nivel_jur. Same shape the postgres workflow test uses.
const { ensureGeSchema, crearEjecutorSql } = await import('../../lib/infraestructura/ge-db.ts')
await ensureGeSchema(crearEjecutorSql(rawClient))
const affectationAt = new Date()
const { rows: activePeriods } = await rawClient.query(`SELECT id FROM infra_periodo WHERE estado = 'vigente' LIMIT 1`)
let periodId = activePeriods[0]?.id
if (!periodId) {
  periodId = 't8-fixture-period'
  await rawClient.query(
    `INSERT INTO infra_periodo (id, nombre, inicio_en, fin_en, estado, creada_en)
     VALUES ($1, 'Cuadernillos T8 fixture', $2, NULL, 'vigente', $2)`,
    [periodId, affectationAt.toISOString()],
  )
}
await rawClient.query(
  `INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES (9, 'Consejo General de Educación')
   ON CONFLICT (id) DO NOTHING`,
)
for (const [index, cue] of criticalCues.entries()) {
  await rawClient.query(
    `INSERT INTO ge.ge_localizacion (cue_anexo, nombre, departamento, localidad)
     VALUES ($1, $2, 'Fixture', 'Fixture')`,
    [cue, criticalNames[index]],
  )
  await rawClient.query(
    `INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo)
     VALUES ($1, 9, $2)`,
    [cue, affectationAt.getFullYear()],
  )
  const partId = `t8-fixture-part-${index}`
  await rawClient.query(
    `INSERT INTO infra_parte (id, periodo_id, cue_anexo, estado_establecimiento,
      estado_establecimiento_rige_desde, corte_id, creada_en, actualizada_en)
     VALUES ($1, $2, $3, 'habitual', $4, 0, $4, $4)`,
    [partId, periodId, cue, affectationAt.toISOString()],
  )
  await rawClient.query(
    `INSERT INTO infra_afectacion (id, parte_id, motivo, categoria, severidad, rige_desde, creada_en, retirada_en)
     VALUES ($1, $2, 'fixture', 'establecimiento', 'Crítica', $3, $3, NULL)`,
    [`t8-fixture-affectation-${index}`, partId, affectationAt.toISOString()],
  )
}

for (const id of [productId, productExtraId]) {
  await db.insert(schema.bookletStock).values({ campaignId, productId: id, quantity: 100 })
  await db.insert(schema.bookletQuota).values({
    campaignId, cabeceraCueAnexo: headCue, productId: id,
    quantity: 50, updatedByUserId: ids.planning,
  })
}
await db.insert(schema.bookletRequest).values({
  id: requestId, campaignId, recipientCueAnexo: recipientCue,
  cabeceraCueAnexo: headCue, parentRequestId: null, rootRequestId: requestId,
  status: 'pending', createdByUserId: ids.cabecera, createdAt: now, submittedAt: now,
})
await db.insert(schema.bookletRequestLine).values([
  { requestId, productId, quantity: 12, approvedQuantity: 0 },
  { requestId, productId: productExtraId, quantity: 5, approvedQuantity: 0 },
])
const rejectedId = 't8-fixture-rejected'
await db.insert(schema.bookletRequest).values({
  id: rejectedId, campaignId, recipientCueAnexo: recipientCue,
  cabeceraCueAnexo: headCue, parentRequestId: null, rootRequestId: rejectedId,
  status: 'rejected', createdByUserId: ids.cabecera, createdAt: now, submittedAt: now,
  rejectedByUserId: ids.supervisor, rejectedAt: now, rejectionReason: 'Fixture rejection; no inventory deduction expected.',
})
await db.insert(schema.bookletRequestLine).values({ requestId: rejectedId, productId, quantity: 3, approvedQuantity: 0 })
if (resolveDriver() !== 'postgres') {
  const approvedAt = new Date(now.getTime() - 60_000)
  const approvedId = 't8-fixture-approved'
  await db.insert(schema.bookletRequest).values({
    id: approvedId, campaignId, recipientCueAnexo: recipientCue,
    cabeceraCueAnexo: headCue, parentRequestId: null, rootRequestId: approvedId,
    status: 'approved', createdByUserId: ids.cabecera, createdAt: approvedAt, submittedAt: approvedAt,
    approvedByUserId: ids.supervisor, approvedAt,
  })
  await db.insert(schema.bookletRequestLine).values([
    { requestId: approvedId, productId, quantity: 12, approvedQuantity: 8 },
    { requestId: approvedId, productId: productExtraId, quantity: 5, approvedQuantity: 5 },
  ])
}

const fixtureStatePath = path.join(root, 'e2e/cuadernillos/.results/fixture-state.json')
await mkdir(path.dirname(fixtureStatePath), { recursive: true })
await writeFile(fixtureStatePath, JSON.stringify({
  campaignId, productId, productExtraId, requestId, rejectedId, headCue, recipientCue,
  criticalCues, ids,
}), 'utf8')

const client = rawClient
if (typeof client.close === 'function') await client.close()
else await client.end()
console.log('T8 fixture seeded in the isolated local database.')
