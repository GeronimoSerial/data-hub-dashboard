import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { register } from '../../../instrumentation'
import { __reiniciarRegionActivaParaPruebas } from './activa'

const originalRegion = process.env.REGION
const originalRuntime = process.env.NEXT_RUNTIME

const fijarRegion = (valor: string | undefined) => {
  if (valor === undefined) delete process.env.REGION
  else process.env.REGION = valor
}

describe('instrumentation register', () => {
  beforeEach(() => __reiniciarRegionActivaParaPruebas())
  afterEach(() => {
    fijarRegion(originalRegion)
    if (originalRuntime === undefined) delete process.env.NEXT_RUNTIME
    else process.env.NEXT_RUNTIME = originalRuntime
    __reiniciarRegionActivaParaPruebas()
  })

  it('rejects boot when REGION is unknown on the nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    fijarRegion('x')
    const salir = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(register()).rejects.toThrow('REGION desconocida')
      expect(salir).toHaveBeenCalledWith(1)
      expect(log).toHaveBeenCalledWith(expect.stringContaining('REGION desconocida'))
    } finally {
      salir.mockRestore()
      log.mockRestore()
    }
  })

  it('resolves when REGION is unset on the nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    fijarRegion(undefined)
    await expect(register()).resolves.toBeUndefined()
  })

  it('does not validate REGION outside the nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge'
    fijarRegion('x')
    await expect(register()).resolves.toBeUndefined()
  })
})
