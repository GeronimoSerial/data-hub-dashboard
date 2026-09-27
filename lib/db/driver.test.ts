import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveDriver } from './driver'

describe('resolveDriver', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env.DATABASE_URL
  })

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATABASE_URL
    } else {
      process.env.DATABASE_URL = original
    }
  })

  it('devuelve pglite cuando DATABASE_URL no está definida', () => {
    delete process.env.DATABASE_URL
    expect(resolveDriver()).toBe('pglite')
  })

  it('devuelve pglite cuando DATABASE_URL está vacía', () => {
    process.env.DATABASE_URL = ''
    expect(resolveDriver()).toBe('pglite')
  })

  it('devuelve postgres cuando DATABASE_URL empieza con postgres://', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db'
    expect(resolveDriver()).toBe('postgres')
  })

  it('devuelve postgres cuando DATABASE_URL empieza con postgresql://', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
    expect(resolveDriver()).toBe('postgres')
  })

  it('devuelve pglite cuando DATABASE_URL es un valor no reconocido (p. ej. un archivo)', () => {
    process.env.DATABASE_URL = 'file:./hub.db'
    expect(resolveDriver()).toBe('pglite')
  })
})
