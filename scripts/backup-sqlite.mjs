#!/usr/bin/env node
/**
 * Backup consistente de la base sqlite operativa. Usa VACUUM INTO, que es la
 * forma nativa de sqlite para backups: produce un archivo íntegro en una sola
 * sentencia atómica, consistente incluso bajo escritura concurrente. El
 * enfoque anterior (checkpoint WAL + copyFileSync) tenía una ventana real: si
 * la app disparaba un auto-checkpoint mientras se copiaba el archivo, el
 * backup podía quedar con páginas mezcladas (corrupto) y eso sólo se
 * descubría al restaurar. VACUUM INTO no requiere un checkpoint manual previo.
 * Usage: node scripts/backup-sqlite.mjs [sqlitePath] [destinoDir]
 */
import { createClient } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export async function backupSqlite({ sqlitePath, destinoDir }) {
  mkdirSync(destinoDir, { recursive: true })
  const nombre = `hub-${new Date().toISOString().replace(/:/g, '-')}.sqlite`
  const destino = join(destinoDir, nombre)

  const client = createClient({ url: `file:${sqlitePath}` })
  try {
    await client.execute(
      "VACUUM INTO '" + destino.replace(/'/g, "''") + "'",
    )
  } finally {
    client.close()
  }

  return destino
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataDir = process.env.DATA_DIR ?? '.data'
  const sqlitePath = process.argv[2] ?? join(dataDir, 'hub.sqlite')
  const destinoDir = process.argv[3] ?? join(dataDir, 'backups')
  const destino = await backupSqlite({ sqlitePath, destinoDir })
  console.log(destino)
}
