import { describe, expect, it, vi } from 'vitest'
import { conReintentoPorBloqueo, esErrorLockOcupado } from './reintento'

describe('esErrorLockOcupado', () => {
  it('reconoce un error con code SQLITE_BUSY', () => {
    expect(esErrorLockOcupado({ code: 'SQLITE_BUSY' })).toBe(true)
  })

  it('reconoce un Error cuyo mensaje contiene "database is locked"', () => {
    expect(esErrorLockOcupado(new Error('SqliteError: database is locked'))).toBe(true)
  })

  it('reconoce el caso drizzle-orm: el texto real está en err.cause.message', () => {
    const err = new Error('DrizzleQueryError: Failed query')
    err.cause = new Error('SQLITE_BUSY: database is locked')
    expect(esErrorLockOcupado(err)).toBe(true)
  })

  it('reconoce los códigos de lock de Postgres directos (40001, 40P01, 55P03)', () => {
    expect(esErrorLockOcupado({ code: '40001' })).toBe(true)
    expect(esErrorLockOcupado({ code: '40P01' })).toBe(true)
    expect(esErrorLockOcupado({ code: '55P03' })).toBe(true)
  })

  it('reconoce el caso drizzle-orm: el código de Postgres está anidado en err.cause', () => {
    for (const code of ['40001', '40P01', '55P03']) {
      const err = new Error('DrizzleQueryError: Failed query')
      err.cause = Object.assign(new Error('postgres error'), { code })
      expect(esErrorLockOcupado(err)).toBe(true)
    }
  })

  it('no reconoce otros errores (constraint, genérico)', () => {
    expect(esErrorLockOcupado(new Error('UNIQUE constraint failed: infra_movimiento.idempotency_key'))).toBe(
      false,
    )
    expect(esErrorLockOcupado(new Error('algo salió mal'))).toBe(false)
    expect(esErrorLockOcupado('no es ni siquiera un Error')).toBe(false)
  })
})

describe('conReintentoPorBloqueo', () => {
  it('devuelve el resultado sin reintentar si el primer intento no lanza', async () => {
    const fn = vi.fn(async () => 'ok')
    const resultado = await conReintentoPorBloqueo(fn, { calcularEsperaMs: () => 0 })
    expect(resultado).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('reintenta ante SQLITE_BUSY hasta que un intento posterior tiene éxito', async () => {
    let intentos = 0
    const fn = vi.fn(async () => {
      intentos += 1
      if (intentos < 3) {
        const err = new Error('database is locked') as Error & { code?: string }
        err.code = 'SQLITE_BUSY'
        throw err
      }
      return 'listo'
    })

    const resultado = await conReintentoPorBloqueo(fn, { maxIntentos: 8, calcularEsperaMs: () => 0 })
    expect(resultado).toBe('listo')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('reintenta ante "database is locked" aunque no tenga code SQLITE_BUSY', async () => {
    let intentos = 0
    const fn = vi.fn(async () => {
      intentos += 1
      if (intentos < 2) throw new Error('SqliteError: database is locked')
      return 42
    })

    const resultado = await conReintentoPorBloqueo(fn, { calcularEsperaMs: () => 0 })
    expect(resultado).toBe(42)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('NO reintenta otros errores: relanza en el primer intento', async () => {
    const errorOriginal = new Error('UNIQUE constraint failed: infra_movimiento.idempotency_key')
    const fn = vi.fn(async () => {
      throw errorOriginal
    })

    await expect(conReintentoPorBloqueo(fn, { calcularEsperaMs: () => 0 })).rejects.toBe(errorOriginal)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('se rinde tras maxIntentos y relanza el error original de lock ocupado', async () => {
    const fn = vi.fn(async () => {
      const err = new Error('database is locked') as Error & { code?: string }
      err.code = 'SQLITE_BUSY'
      throw err
    })

    await expect(
      conReintentoPorBloqueo(fn, { maxIntentos: 4, calcularEsperaMs: () => 0 }),
    ).rejects.toMatchObject({ code: 'SQLITE_BUSY' })
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it('llama a alFallarIntento en cada intento fallido, antes de decidir reintentar o relanzar', async () => {
    const llamadas: number[] = []
    let intentos = 0
    const fn = vi.fn(async () => {
      intentos += 1
      if (intentos < 2) {
        const err = new Error('database is locked') as Error & { code?: string }
        err.code = 'SQLITE_BUSY'
        throw err
      }
      return 'ok'
    })

    const resultado = await conReintentoPorBloqueo(fn, {
      calcularEsperaMs: () => 0,
      alFallarIntento: (_err, intento) => {
        llamadas.push(intento)
      },
    })

    expect(resultado).toBe('ok')
    expect(llamadas).toEqual([0])
  })
})
