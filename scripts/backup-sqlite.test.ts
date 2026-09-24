import { createClient } from '@libsql/client'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupSqlite } from './backup-sqlite.mjs'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'backup-sqlite-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('backupSqlite', () => {
  it('crea un archivo de backup legible con el contenido de la base original', async () => {
    const sqlitePath = path.join(dir, 'hub.sqlite')
    const origen = createClient({ url: `file:${sqlitePath}` })
    await origen.execute('CREATE TABLE prueba (id TEXT PRIMARY KEY, valor TEXT)')
    await origen.execute({
      sql: 'INSERT INTO prueba (id, valor) VALUES (?, ?)',
      args: ['1', 'dato-original'],
    })
    origen.close()

    const destinoDir = path.join(dir, 'backups')
    const backupPath = await backupSqlite({ sqlitePath, destinoDir })

    expect(existsSync(backupPath)).toBe(true)

    const respaldo = createClient({ url: `file:${backupPath}` })
    const res = await respaldo.execute({
      sql: 'SELECT valor FROM prueba WHERE id = ?',
      args: ['1'],
    })
    respaldo.close()

    expect(res.rows[0]?.valor).toBe('dato-original')
  })

  it('el backup pasa integrity_check y conserva las filas insertadas antes del backup', async () => {
    const sqlitePath = path.join(dir, 'hub.sqlite')
    const origen = createClient({ url: `file:${sqlitePath}` })
    await origen.execute('CREATE TABLE prueba (id TEXT PRIMARY KEY, valor TEXT)')
    await origen.execute({
      sql: 'INSERT INTO prueba (id, valor) VALUES (?, ?)',
      args: ['a', 'fila-a'],
    })
    await origen.execute({
      sql: 'INSERT INTO prueba (id, valor) VALUES (?, ?)',
      args: ['b', 'fila-b'],
    })
    origen.close()

    const destinoDir = path.join(dir, 'backups')
    const backupPath = await backupSqlite({ sqlitePath, destinoDir })

    const respaldo = createClient({ url: `file:${backupPath}` })
    const integridad = await respaldo.execute('PRAGMA integrity_check')
    const filas = await respaldo.execute('SELECT id, valor FROM prueba ORDER BY id')
    respaldo.close()

    expect(integridad.rows[0]?.[0]).toBe('ok')
    expect(filas.rows.map((f) => f.valor)).toEqual(['fila-a', 'fila-b'])
  })

  it('incluye escrituras en WAL sin checkpoint manual previo', async () => {
    const sqlitePath = path.join(dir, 'hub.sqlite')
    const origen = createClient({ url: `file:${sqlitePath}` })
    await origen.execute('PRAGMA journal_mode = WAL')
    await origen.execute('CREATE TABLE prueba (id TEXT PRIMARY KEY, valor TEXT)')
    await origen.execute({
      sql: 'INSERT INTO prueba (id, valor) VALUES (?, ?)',
      args: ['1', 'en-wal'],
    })
    // El origen queda abierto a propósito: la fila vive sólo en el -wal, sin
    // checkpoint manual. VACUUM INTO debe leerla igual.
    const destinoDir = path.join(dir, 'backups')
    const backupPath = await backupSqlite({ sqlitePath, destinoDir })

    const respaldo = createClient({ url: `file:${backupPath}` })
    const res = await respaldo.execute({
      sql: 'SELECT valor FROM prueba WHERE id = ?',
      args: ['1'],
    })
    respaldo.close()
    origen.close()

    expect(res.rows[0]?.valor).toBe('en-wal')
  })

  it('crea el destino (que no existía) y deja el origen intacto y legible', async () => {
    const sqlitePath = path.join(dir, 'hub.sqlite')
    const origen = createClient({ url: `file:${sqlitePath}` })
    await origen.execute('CREATE TABLE prueba (id TEXT PRIMARY KEY, valor TEXT)')
    await origen.execute({
      sql: 'INSERT INTO prueba (id, valor) VALUES (?, ?)',
      args: ['1', 'origen'],
    })
    origen.close()

    const destinoDir = path.join(dir, 'backups')
    const nombreEsperado = `hub-${new Date().toISOString().replace(/:/g, '-')}.sqlite`
    const destinoEsperado = path.join(destinoDir, nombreEsperado)
    expect(existsSync(destinoEsperado)).toBe(false)

    const backupPath = await backupSqlite({ sqlitePath, destinoDir })

    expect(path.basename(backupPath)).toMatch(/^hub-.*\.sqlite$/)
    expect(existsSync(backupPath)).toBe(true)

    const relecturaOrigen = createClient({ url: `file:${sqlitePath}` })
    const res = await relecturaOrigen.execute('SELECT valor FROM prueba WHERE id = ?', ['1'])
    relecturaOrigen.close()

    expect(res.rows[0]?.valor).toBe('origen')
  })
})
