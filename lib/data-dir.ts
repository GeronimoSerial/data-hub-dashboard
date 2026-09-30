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

// DB1/F2: directorio de datos de PGlite para desarrollo local sin
// DATABASE_URL (persistido, a diferencia de los tests que usan PGlite en
// memoria — ver lib/db/index.ts).
export function getPglitePath() {
  return path.join(getDataDir(), 'pg')
}

export function getUploadsDir() {
  return path.join(getDataDir(), 'uploads')
}
