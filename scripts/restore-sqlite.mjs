#!/usr/bin/env node
/**
 * Restaura un backup de la base sqlite operativa sobre el archivo destino.
 * Asume un solo host sin escrituras concurrentes durante el restore (no hay
 * coordinación de locks entre procesos): correr sólo con el servicio Next y
 * los jobs detenidos, dentro de una ventana de mantenimiento.
 * Usage: node scripts/restore-sqlite.mjs <ruta-backup> [sqlitePath]
 */
import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export async function restoreSqlite({ backupPath, sqlitePath }) {
  if (!existsSync(backupPath)) {
    throw new Error(`No existe el backup: ${backupPath}`)
  }

  // Copia atómica: primero el backup a un temporal en el mismo directorio.
  // Si esta copia falla, el destino y sus -wal/-shm quedan intactos.
  const temporal = `${sqlitePath}.tmp-restore-${Date.now()}`
  copyFileSync(backupPath, temporal)

  // Un -wal/-shm del destino anterior mezclado con el archivo restaurado
  // puede corromper la base o revivir escrituras ya descartadas.
  for (const sufijo of ['-wal', '-shm']) {
    const huerfano = `${sqlitePath}${sufijo}`
    if (existsSync(huerfano)) rmSync(huerfano)
  }

  renameSync(temporal, sqlitePath)
  return sqlitePath
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const backupPath = process.argv[2]
  if (!backupPath) {
    console.error('Uso: node scripts/restore-sqlite.mjs <ruta-backup> [sqlitePath]')
    process.exit(1)
  }
  const dataDir = process.env.DATA_DIR ?? '.data'
  const sqlitePath = process.argv[3] ?? join(dataDir, 'hub.sqlite')
  const destino = await restoreSqlite({ backupPath, sqlitePath })
  console.log(destino)
}
