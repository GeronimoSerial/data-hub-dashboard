import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashDni, requireDniSecret } from './dni'

const SECRETO_PREVIO = process.env.MATRICULA_DNI_SECRET

beforeEach(() => {
  process.env.MATRICULA_DNI_SECRET = 'secreto-de-prueba'
})

afterEach(() => {
  if (SECRETO_PREVIO === undefined) delete process.env.MATRICULA_DNI_SECRET
  else process.env.MATRICULA_DNI_SECRET = SECRETO_PREVIO
})

describe('hashDni', () => {
  it('es determinista y devuelve hex de 64 caracteres', () => {
    const a = hashDni('30123456')
    expect(hashDni('30123456')).toBe(a)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('depende del secreto', () => {
    const con = hashDni('30123456')
    process.env.MATRICULA_DNI_SECRET = 'otro-secreto'
    expect(hashDni('30123456')).not.toBe(con)
  })

  it('no contiene el DNI en claro', () => {
    expect(hashDni('30123456')).not.toContain('30123456')
  })

  it('exige el secreto', () => {
    delete process.env.MATRICULA_DNI_SECRET
    expect(() => hashDni('30123456')).toThrow(/MATRICULA_DNI_SECRET/)
    expect(() => requireDniSecret()).toThrow(/MATRICULA_DNI_SECRET/)
  })

  it('rechaza entradas que no son sólo dígitos', () => {
    expect(() => hashDni('30.123.456')).toThrow()
    expect(() => hashDni('123')).toThrow()
  })
})
