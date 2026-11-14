// Seeds demo stock and one cabecera quota so the booklet flow can be exercised end to end in a
// non-production environment. It goes through the same services the planning UI uses (addStock,
// setQuota), so movements and idempotency records are written. Idempotent: a product that already
// has stock is left untouched. Dry run by default; --apply writes.
//
//   DATABASE_URL=postgres://... node scripts/sembrar-stock-cuadernillos.mjs [--apply]
//
// Options: --stock=500 (global stock per product) --quota=100 (quota per product for the cabecera).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
registerTsResolver(root)

const apply = process.argv.includes('--apply')
const option = (name, fallback) => Number(process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback)
const STOCK = option('stock', 500)
const QUOTA = option('quota', 100)
if (!Number.isSafeInteger(STOCK) || STOCK <= 0 || !Number.isSafeInteger(QUOTA) || QUOTA < 0 || QUOTA > STOCK) throw new Error('invalid --stock/--quota')

const [{ getDb }, schema, drizzle, { addStock, setQuota }] = await Promise.all([
  import('../lib/db/index.ts'), import('../lib/db/schema.ts'), import('drizzle-orm'), import('../lib/cuadernillos/inventory.ts'),
])
const { and, eq, isNull } = drizzle
const db = getDb()

const [campaign] = await db.select().from(schema.bookletCampaign).where(eq(schema.bookletCampaign.status, 'active')).limit(1)
if (!campaign) throw new Error('no active campaign: run scripts/cargar-catalogo-cuadernillos.mjs first')
const [planner] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, 'planeamiento@mec.gob.ar')).limit(1)
if (!planner) throw new Error('planeamiento@mec.gob.ar does not exist: run scripts/crear-cuentas-cuadernillos.mjs first')
const [head] = await db.select({ cueAnexo: schema.bookletSchoolAssignment.cueAnexo, name: schema.bookletSchoolAssignment.schoolName })
  .from(schema.bookletSchoolAssignment).where(eq(schema.bookletSchoolAssignment.relationship, 'cabecera')).limit(1)
if (!head) throw new Error('no confirmed cabecera assignment')
const products = await db.select({ id: schema.bookletProduct.id, name: schema.bookletProduct.name }).from(schema.bookletProduct).orderBy(schema.bookletProduct.id)
const stocked = new Set((await db.select({ id: schema.bookletStock.productId }).from(schema.bookletStock).where(eq(schema.bookletStock.campaignId, campaign.id))).map((row) => row.id))

console.log(`campaign "${campaign.name}", cabecera ${head.cueAnexo} ${head.name}, stock ${STOCK}, quota ${QUOTA}`)
const planning = { id: planner.id, role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
for (const product of products) {
  if (stocked.has(product.id)) { console.log(`  skip ${product.id}: stock already registered`); continue }
  console.log(`  ${product.id}: stock ${STOCK}, quota ${QUOTA}`)
  if (!apply) continue
  await addStock(planning, { campaignId: campaign.id, productId: product.id, quantity: STOCK, movement: 'initial', idempotencyKey: `seed-stock-${campaign.id}-${product.id}` })
  await setQuota(planning, { campaignId: campaign.id, cabeceraCueAnexo: head.cueAnexo, productId: product.id, quantity: QUOTA })
}
console.log(apply ? 'applied' : 'dry run: nothing written. Re-run with --apply.')
process.exit(0)
