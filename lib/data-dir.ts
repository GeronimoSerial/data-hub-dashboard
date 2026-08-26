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

export function getUploadsDir() {
  return path.join(getDataDir(), 'uploads')
}
