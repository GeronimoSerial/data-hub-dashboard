import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { backupPostgres } from './backup-postgres.mjs'

const execFileAsync = promisify(execFile)

const CONTENEDOR = 'enos-db1f5-backuptest'
const PUERTO = '55433'
const URL_TEST = 'postgres://postgres:test@127.0.0.1:55433/enos_test'
const URL_RESTORE = 'postgres://postgres:test@127.0.0.1:55433/enos_restore_test'

const dirs: string[] = []

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stderrDe(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error) {
    return String((error as { stderr?: unknown }).stderr ?? '')
  }
  return ''
}

// El `pg_dump` del host es 18 y el server del contenedor es 16. pg_dump 18
// emite incondicionalmente `SET transaction_timeout = 0;` (GUC introducido en
// PG17), que el server 16 rechaza. Es el único error del restore y los datos
// se restauran igual; cualquier otro fallo debe propagarse.
async function restaurar(destino: string) {
  try {
    await execFileAsync('pg_restore', ['--clean', '--if-exists', '-d', URL_RESTORE, destino])
  } catch (error) {
    if (!stderrDe(error).includes('transaction_timeout')) throw error
  }
}

async function pgIsReady(): Promise<boolean> {
  try {
    await execFileAsync('pg_isready', ['-h', '127.0.0.1', '-p', PUERTO, '-U', 'postgres'])
    return true
  } catch {
    return false
  }
}

async function conectar(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString })
  await client.connect()
  return client
}

async function seed(connectionString: string) {
  const client = await conectar(connectionString)
  try {
    await client.query('DROP TABLE IF EXISTS prueba')
    await client.query('CREATE TABLE prueba (id serial PRIMARY KEY, valor text)')
    await client.query("INSERT INTO prueba (valor) VALUES ('dato-original')")
  } finally {
    await client.end()
  }
}

async function valores(connectionString: string): Promise<string[]> {
  const client = await conectar(connectionString)
  try {
    const res = await client.query('SELECT valor FROM prueba ORDER BY id')
    return res.rows.map((fila) => fila.valor as string)
  } finally {
    await client.end()
  }
}

function nuevoDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'backup-pg-'))
  dirs.push(dir)
  return dir
}

beforeAll(async () => {
  await execFileAsync('podman', ['rm', '-f', CONTENEDOR]).catch(() => {})
  await execFileAsync('podman', [
    'run', '--rm', '-d', '--name', CONTENEDOR,
    '-e', 'POSTGRES_PASSWORD=test',
    '-e', 'POSTGRES_DB=enos_test',
    '-p', `${PUERTO}:5432`,
    'docker.io/library/postgres:16',
  ])

  let listo = false
  for (let intento = 0; intento < 20 && !listo; intento++) {
    listo = await pgIsReady()
    if (!listo) await sleep(1000)
  }
  if (!listo) {
    throw new Error('Postgres del contenedor no respondió tras 20 intentos (~20s)')
  }
}, 60000)

afterAll(async () => {
  await execFileAsync('podman', ['rm', '-f', CONTENEDOR]).catch(() => {})
})

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop() as string, { recursive: true, force: true })
  }
})

describe('backupPostgres', () => {
  it('crea un archivo .dump en disco', async () => {
    await seed(URL_TEST)
    const destinoDir = nuevoDir()

    const destino = await backupPostgres({ connectionString: URL_TEST, destinoDir })

    expect(existsSync(destino)).toBe(true)
    expect(path.basename(destino)).toMatch(/^hub-.*\.dump$/)
  })

  it('el .dump pasa pg_restore --list con salida no vacía', async () => {
    await seed(URL_TEST)
    const destinoDir = nuevoDir()

    const destino = await backupPostgres({ connectionString: URL_TEST, destinoDir })
    const { stdout } = await execFileAsync('pg_restore', ['--list', destino])

    expect(stdout.trim().length).toBeGreaterThan(0)
  })

  it('restaurado en una base nueva conserva los datos insertados antes del backup', async () => {
    await seed(URL_TEST)
    const destinoDir = nuevoDir()
    const destino = await backupPostgres({ connectionString: URL_TEST, destinoDir })

    await execFileAsync('podman', [
      'exec', CONTENEDOR, 'dropdb', '--if-exists', '-U', 'postgres', 'enos_restore_test',
    ])
    await execFileAsync('podman', [
      'exec', CONTENEDOR, 'createdb', '-U', 'postgres', 'enos_restore_test',
    ])
    await restaurar(destino)

    expect(await valores(URL_RESTORE)).toEqual(['dato-original'])
  })

  it('rota backups viejos por cantidad retenida y conserva los más recientes', async () => {
    await seed(URL_TEST)
    const destinoDir = nuevoDir()

    const primero = await backupPostgres({ connectionString: URL_TEST, destinoDir, retener: 2 })
    const segundo = await backupPostgres({ connectionString: URL_TEST, destinoDir, retener: 2 })
    const tercero = await backupPostgres({ connectionString: URL_TEST, destinoDir, retener: 2 })

    const archivos = readdirSync(destinoDir).filter((n) => n.endsWith('.dump'))

    expect(archivos).toHaveLength(2)
    expect(existsSync(primero)).toBe(false)
    expect(existsSync(segundo)).toBe(true)
    expect(existsSync(tercero)).toBe(true)
  })
})
