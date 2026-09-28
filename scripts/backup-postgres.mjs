#!/usr/bin/env node
/**
 * Backup consistente de la base Postgres operativa. Usa `pg_dump` en formato
 * custom (-Fc): es el formato lógico nativo de Postgres, comprimido y
 * restaurable de forma selectiva con `pg_restore`. Después de cada backup
 * exitoso verifica el archivo con `pg_restore --list` (un dump custom expone
 * su tabla de contenidos sin necesidad de una base destino), y rota los
 * backups viejos por cantidad retenida. Si la verificación falla, el dump
 * recién creado se borra para no dejar basura corrupta en la rotación.
 * Usage: node scripts/backup-postgres.mjs [destinoDir] [retener]
 */
import { execFile } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function fechaISO() {
  return new Date().toISOString().replace(/:/g, '-')
}

// pg_dump/pg_restore escriben el detalle real en stderr; execFile lo adjunta
// al error. Lo propagamos tal cual para que el fallo sea diagnosticable.
function mensajeConStderr(error) {
  const stderr = error?.stderr?.toString().trim()
  const base = error?.message ?? String(error)
  return stderr ? `${base}\n${stderr}` : base
}

export async function backupPostgres({ connectionString, destinoDir, retener = 10 }) {
  if (!connectionString) {
    throw new Error('backupPostgres requiere connectionString')
  }

  mkdirSync(destinoDir, { recursive: true })
  const destino = join(destinoDir, `hub-${fechaISO()}.dump`)

  try {
    await execFileAsync('pg_dump', [
      '--format=custom',
      `--file=${destino}`,
      connectionString,
    ])
  } catch (error) {
    throw new Error(`pg_dump falló: ${mensajeConStderr(error)}`, { cause: error })
  }

  try {
    const { stdout } = await execFileAsync('pg_restore', ['--list', destino])
    if (!stdout || stdout.trim() === '') {
      throw new Error('pg_restore --list no devolvió contenido')
    }
  } catch (error) {
    rmSync(destino, { force: true })
    throw new Error(`verificación falló: ${mensajeConStderr(error)}`, { cause: error })
  }

  rotar(destinoDir, destino, retener)

  return destino
}

// El timestamp ISO ordena lexicográficamente igual que cronológico, así que
// ordenar por nombre basta para identificar los más viejos. Nunca borra el
// backup recién creado, aunque `retener` sea menor que 1.
function rotar(destinoDir, recienCreado, retener) {
  const backups = readdirSync(destinoDir)
    .filter((n) => n.startsWith('hub-') && n.endsWith('.dump'))
    .sort()

  const sobrantes = backups.length - retener
  if (sobrantes <= 0) return

  for (const nombre of backups.slice(0, sobrantes)) {
    const ruta = join(destinoDir, nombre)
    if (ruta === recienCreado) continue
    rmSync(ruta, { force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('Falta DATABASE_URL en el entorno')
    process.exit(1)
  }
  const destinoDir = process.argv[2] ?? '.data/backups'
  const retener = process.argv[3] ? Number(process.argv[3]) : 10
  const destino = await backupPostgres({ connectionString, destinoDir, retener })
  console.log(destino)
}
