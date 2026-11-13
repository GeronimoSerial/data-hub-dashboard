// Loads the booklet catalog (one product per published cuadernillo in data/materiales.json) and one
// active campaign, so planning can register stock and quotas and cabeceras can request material.
// Idempotent: existing rows are never modified. Dry run by default; --apply writes.
//
//   DATABASE_URL=postgres://... node scripts/cargar-catalogo-cuadernillos.mjs [--apply]
//
// Quantities (stock, quotas) are not loaded here: planning registers them from the UI.
// GE source mappings (booklet_product_mapping) are a separate, human-confirmed step and are not created.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apply = process.argv.includes('--apply')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

const CAMPAIGN = { id: 'cuadernillos-2026', name: 'Cuadernillos de asistencia pedagógica 2026' }
const catalog = JSON.parse(await readFile(path.join(root, 'data/materiales.json'), 'utf8'))
const products = catalog.filter((item) => item.coleccion === 'cuadernillos').map((item) => {
  const special = { 'cuadernillo-nivel-inicial': 'inicial', 'cuadernillo-nivel-superior': 'superior' }[item.id]
  const grade = special ?? item.id.match(/^cuadernillo-(\d)-grado$/)?.[1]
  if (!grade) throw new Error(`unexpected cuadernillo id ${item.id}`)
  return { id: item.id, name: item.titulo, levelCode: special ?? 'primaria', gradeCode: grade }
})

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
console.log(`${products.length} products, campaign "${CAMPAIGN.name}"`)
for (const product of products) console.log(`  ${product.id} · ${product.levelCode}/${product.gradeCode} · ${product.name}`)
if (!apply) { console.log('dry run: nothing written. Re-run with --apply.'); await client.end(); process.exit(0) }

await client.query('BEGIN')
try {
  for (const product of products) {
    await client.query('INSERT INTO booklet_product (id, name, level_code, grade_code) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
      [product.id, product.name, product.levelCode, product.gradeCode])
  }
  await client.query(
    `INSERT INTO booklet_campaign (id, name, status, distribution_enabled, overassignment_allowed)
     VALUES ($1,$2,'active',true,false) ON CONFLICT (id) DO NOTHING`, [CAMPAIGN.id, CAMPAIGN.name])
  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
}
const { rows } = await client.query('SELECT (SELECT count(*) FROM booklet_product) AS products, (SELECT count(*) FROM booklet_campaign WHERE status = \'active\') AS campaigns')
console.log(`applied: ${rows[0].products} products, ${rows[0].campaigns} active campaigns`)
await client.end()
