import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupSqlite } from './backup-sqlite.mjs'
import { restoreSqlite } from './restore-sqlite.mjs'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'restore-sqlite-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('restoreSqlite', () => {
  it('vuelve al contenido del backup, sin las escrituras posteriores', async () => {
    const sqlitePath = path.join(dir, 'hub.sqlite')
    const client1 = createClient({ url: `file:${sqlitePath}` })
    await client1.execute('CREATE TABLE prueba (id TEXT PRIMARY KEY, valor TEXT)')
    await client1.execute({
      sql: 'INSERT INTO prueba (id, valor) VALUES (?, ?)',
      args: ['1', 'original'],
    })
    client1.close()

    const backupPath = await backupSqlite({
      sqlitePath,
      destinoDir: path.join(dir, 'backups'),
    })

    // Escritura posterior al backup: se debe perder al restaurar.
    const client2 = createClient({ url: `file:${sqlitePath}` })
    await client2.execute({
      sql: 'INSERT INTO prueba (id, valor) VALUES (?, ?)',
      args: ['2', 'posterior-al-backup'],
    })
    client2.close()

    await restoreSqlite({ backupPath, sqlitePath })

    const client3 = createClient({ url: `file:${sqlitePath}` })
    const res = await client3.execute('SELECT id, valor FROM prueba ORDER BY id')
    client3.close()

    expect(res.rows).toHaveLength(1)
    expect(res.rows[0]?.valor).toBe('original')
  })
})
