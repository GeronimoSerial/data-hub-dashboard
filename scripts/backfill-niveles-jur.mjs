// Backfill único de niveles legados → niveles jurisdiccionales (ver
// lib/niveles-jur-mapeo.ts). Idempotente: una segunda corrida inserta 0 filas.
// No se engancha a seedHub porque corre en cada arranque y reinsertaría
// niveles que un admin quite después desde la nueva UI.
//
// Uso: node scripts/backfill-niveles-jur.mjs  (usa la misma DATABASE_URL/DATA_DIR
// que la app).
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

registerTsResolver(root)

const { getDb, migrarDb } = await import('../lib/db/index.ts')
const { backfillNivelesJur } = await import('../lib/db/backfill-niveles-jur.ts')

await migrarDb()
const resultado = await backfillNivelesJur(getDb())

console.log(JSON.stringify(resultado, null, 2))
process.exit(0)
