import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enosJobsEnabled } from './flags'

const CLAVE = 'ENOS_JOBS_ENABLED'
let original: string | undefined

beforeEach(() => {
  original = process.env[CLAVE]
})

afterEach(() => {
  if (original === undefined) delete process.env[CLAVE]
  else process.env[CLAVE] = original
})

describe('enosJobsEnabled', () => {
  it('devuelve true sin la variable seteada (default encendido, a diferencia de los flags de UI)', () => {
    delete process.env[CLAVE]
    expect(enosJobsEnabled()).toBe(true)
  })

  it('devuelve false con el valor exacto "false"', () => {
    process.env[CLAVE] = 'false'
    expect(enosJobsEnabled()).toBe(false)
  })

  it('devuelve true con cualquier otro valor, incluido uno arbitrario', () => {
    process.env[CLAVE] = 'true'
    expect(enosJobsEnabled()).toBe(true)
    process.env[CLAVE] = '0'
    expect(enosJobsEnabled()).toBe(true)
    process.env[CLAVE] = 'no'
    expect(enosJobsEnabled()).toBe(true)
  })
})
