import { beforeEach, expect, it, vi } from 'vitest'
import { recursos } from '@/lib/model'
const { getDb, set } = vi.hoisted(() => ({ getDb: vi.fn(), set: vi.fn() }))
vi.mock('@/lib/db', () => ({ getDb }))
import { updateRecurso } from './recursos'

beforeEach(() => {
  vi.clearAllMocks()
  const db = {
    select: () => ({ from: () => ({ where: async () => [{ id: 'html' }] }) }),
    update: () => ({ set: set.mockReturnValue({ where: async () => [] }) }),
    delete: () => ({ where: async () => [] }),
    insert: () => ({ values: async () => [] }),
    transaction: async (callback: (tx: unknown) => Promise<void>) => callback(db),
  }
  getDb.mockReturnValue(db)
})
it('keeps the server upload date when editing resource metadata', async () => {
  await updateRecurso({ ...recursos[0], tagIds: [], storageKey: 'html/uuid', titulo: 'Nuevo título' })
  expect(set.mock.calls[0][0]).not.toHaveProperty('cargadoEn')
})
it('clears the upload date when removing the file', async () => {
  await updateRecurso({ ...recursos[0], tagIds: [], storageKey: undefined })
  expect(set.mock.calls[0][0]).toHaveProperty('cargadoEn', null)
})
