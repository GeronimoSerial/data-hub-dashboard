import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { episodiosDerivadosEnabled } from './flags'

const CLAVE = 'EPISODIOS_DERIVADOS_ENABLED'

let original: string | undefined

beforeEach(() => {
  original = process.env[CLAVE]
})

afterEach(() => {
  if (original === undefined) delete process.env[CLAVE]
  else process.env[CLAVE] = original
})

describe('episodiosDerivadosEnabled', () => {
  it('devuelve false sin la variable seteada', () => {
    delete process.env[CLAVE]
    expect(episodiosDerivadosEnabled()).toBe(false)
  })

  it('devuelve true con el valor exacto "true"', () => {
    process.env[CLAVE] = 'true'
    expect(episodiosDerivadosEnabled()).toBe(true)
  })

  it('devuelve false con un valor arbitrario tipo "1" o "yes"', () => {
    process.env[CLAVE] = '1'
    expect(episodiosDerivadosEnabled()).toBe(false)
    process.env[CLAVE] = 'yes'
    expect(episodiosDerivadosEnabled()).toBe(false)
  })
})
