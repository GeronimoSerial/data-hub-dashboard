import { expect, it, vi } from 'vitest'
import { GET, dynamic } from './route'

vi.mock('@/lib/db', () => { throw new Error('Health must not load DB') })
vi.mock('@/lib/auth', () => { throw new Error('Health must not load auth') })

it('reports health without DB, session or sensitive data', async () => {
  const response = GET()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ ok: true })
  expect(dynamic).toBe('force-dynamic')
})
