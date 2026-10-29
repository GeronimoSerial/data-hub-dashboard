import type { Pool } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migrarPostgres } from './migrar-postgres'

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  db: {},
  drizzle: vi.fn(),
  migrate: vi.fn(),
}))
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: estado.drizzle }))
vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate: estado.migrate }))
beforeEach(() => {
  estado.orden = []
  estado.drizzle.mockReset().mockImplementation(() => { estado.orden.push('drizzle'); return estado.db })
  estado.migrate.mockReset().mockImplementation(async () => { estado.orden.push('migrate') })
})

function conexion() {
  const client = {
    query: vi.fn(async (sql: string, _params: unknown[]) => { estado.orden.push(sql.includes('unlock') ? 'unlock' : 'lock') }),
    release: vi.fn(() => { estado.orden.push('release') }),
  }
  const pool = { connect: vi.fn(async () => { estado.orden.push('connect'); return client }) }
  return { pool: pool as unknown as Pool, client }
}

describe('Postgres migrations use a dedicated session lock', () => {
  it('orders connect -> lock -> migrate -> unlock -> release on the same client', async () => {
    const { pool, client } = conexion()
    await migrarPostgres(pool)
    expect(estado.orden).toEqual(['connect', 'lock', 'drizzle', 'migrate', 'unlock', 'release'])
    expect(estado.drizzle).toHaveBeenCalledWith(client, expect.objectContaining({ schema: expect.any(Object) }))
    expect(estado.migrate).toHaveBeenCalledWith(estado.db, { migrationsFolder: './drizzle' })
    expect(client.query.mock.calls[0][0]).toBe('SELECT pg_advisory_lock($1::bigint)')
    expect(client.query.mock.calls[1][0]).toBe('SELECT pg_advisory_unlock($1::bigint)')
    expect(client.query.mock.calls[0]).toHaveLength(2)
    expect(client.query.mock.calls[0][1]).toEqual(client.query.mock.calls[1][1])
    expect(client.release).toHaveBeenCalledWith(false)
  })
  it('unlocks and releases when migrate fails', async () => {
    const { pool, client } = conexion()
    estado.migrate.mockImplementationOnce(async () => { estado.orden.push('migrate'); throw new Error('migration failed') })
    await expect(migrarPostgres(pool)).rejects.toThrow('migration failed')
    expect(estado.orden).toEqual(['connect', 'lock', 'drizzle', 'migrate', 'unlock', 'release'])
    expect(client.release).toHaveBeenCalledWith(false)
  })
  it('discards the connection when unlock fails', async () => {
    const { pool, client } = conexion()
    client.query.mockImplementationOnce(async () => { estado.orden.push('lock') })
      .mockRejectedValueOnce(new Error('unlock failed'))
    await expect(migrarPostgres(pool)).rejects.toThrow('unlock failed')
    expect(client.release).toHaveBeenCalledWith(true)
  })
  it('discards the connection without migrating when lock acquisition fails', async () => {
    const { pool, client } = conexion()
    client.query.mockRejectedValueOnce(new Error('lock failed'))
    await expect(migrarPostgres(pool)).rejects.toThrow('lock failed')
    expect(estado.migrate).not.toHaveBeenCalled()
    expect(client.query).toHaveBeenCalledTimes(1)
    expect(client.release).toHaveBeenCalledWith(true)
  })
})
