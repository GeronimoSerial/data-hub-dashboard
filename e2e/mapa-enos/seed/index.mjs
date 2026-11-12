import { existsSync } from 'node:fs'
import path from 'node:path'
import { registerTsResolver } from '../../../scripts/lib/register-ts-resolver.mjs'

// Runs inside the ephemeral project copy (cwd = project root).
const root = process.cwd()
registerTsResolver(root)

const { getRawClient, migrarDb } = await import('../../../lib/db/index.ts')
const { ensureSeeded } = await import('../../../lib/db/seed.ts')

try {
  // getDb() does not migrate on its own; migrations must run before any seed step.
  console.log('[seed] migraciones')
  await migrarDb()

  console.log('[seed] datos base')
  await ensureSeeded()

  // Add further seed steps here, one `await` per step, in dependency order.
  const cuentasPath = path.join(root, 'e2e/mapa-enos/seed/cuentas.ts')
  if (existsSync(cuentasPath)) {
    console.log('[seed] cuentas QA')
    const { sembrarCuentas } = await import('./cuentas.ts')
    await sembrarCuentas()
  } else {
    console.warn('[seed] WARNING: seed/cuentas.ts is missing; QA accounts were NOT seeded')
  }

  console.log('[seed] datasets del mapa')
  const { publicarDatasetsMapa } = await import('./datasets.ts')
  await publicarDatasetsMapa()
} finally {
  const client = getRawClient()
  if (typeof client.close === 'function') await client.close()
  else await client.end()
}
