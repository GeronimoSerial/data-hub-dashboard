import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SEED_PUBLIC_FILES,
  copySeedPublicFile,
  seedStorageKey,
  shouldReplaceWithSeedFile,
} from './seed-files'

describe('SEED_PUBLIC_FILES', () => {
  it('covers every catalog HTML and PDF, and leaves matrícula as ruta', () => {
    const ids = SEED_PUBLIC_FILES.map((s) => s.id)
    expect(ids).toEqual(['r2', 'r3', 'r13', 'r14', 'r15', 'r16', 'r17'])
    expect(ids).not.toContain('r1')
    expect(SEED_PUBLIC_FILES.every((s) => s.publicRel && s.mime && s.nombreOriginal)).toBe(
      true,
    )
  })
})

describe('shouldReplaceWithSeedFile', () => {
  it('converts rows that still use an internal ruta', () => {
    expect(
      shouldReplaceWithSeedFile({
        id: 'r2',
        ruta: '/tablero',
        storageKey: null,
      }),
    ).toBe(true)
  })

  it('leaves matrícula and later admin uploads alone', () => {
    expect(
      shouldReplaceWithSeedFile({
        id: 'r1',
        ruta: '/mapas/matricula',
        storageKey: null,
      }),
    ).toBe(false)
    expect(
      shouldReplaceWithSeedFile({
        id: 'r2',
        ruta: null,
        storageKey: 'r2/abc-uploaded',
      }),
    ).toBe(false)
  })

  it('uses a stable seed storage key', () => {
    expect(seedStorageKey('r2')).toBe('r2/seed')
  })
})

describe('copySeedPublicFile', () => {
  it('copies the public HTML into DATA_DIR/uploads', () => {
    const prev = process.env.DATA_DIR
    const dir = `/tmp/seed-files-${process.pid}`
    process.env.DATA_DIR = dir
    try {
      const spec = SEED_PUBLIC_FILES.find((s) => s.id === 'r2')!
      const copied = copySeedPublicFile(spec)
      expect(copied.storageKey).toBe('r2/seed')
      expect(copied.size).toBeGreaterThan(1000)
      expect(existsSync(join(dir, 'uploads', 'r2', 'seed'))).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.DATA_DIR
      else process.env.DATA_DIR = prev
    }
  })
})
