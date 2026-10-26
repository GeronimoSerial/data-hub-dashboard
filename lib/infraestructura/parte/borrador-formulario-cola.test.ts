import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTRATO_VERSION } from '../reportes-offline-contratos'

// Un almacén que nunca responde a la primera escritura: la cola no puede quedar bloqueada.
const almacen = vi.hoisted(() => ({
  guardarBorrador: vi.fn(),
  eliminarBorradorSiGeneracion: vi.fn(),
}))

vi.mock('./almacen-indexeddb', () => ({ abrirAlmacenParte: async () => almacen }))

import {
  eliminarBorradorFormulario,
  guardarBorradorFormulario,
  vaciarEscriturasBorrador,
  type BorradorFormulario,
} from './borrador-formulario'

const borrador: BorradorFormulario<{ paso: number }> = {
  registro: { draftId: 'parte-nuevo:draft:colgado', generacion: 1, version: CONTRATO_VERSION, datos: { paso: 1 }, actualizadoEn: '2026-10-25T10:00:00.000Z' },
  datos: { paso: 1 },
}

beforeEach(() => {
  vi.useFakeTimers()
  almacen.guardarBorrador.mockReset().mockReturnValue(new Promise(() => undefined))
  almacen.eliminarBorradorSiGeneracion.mockReset().mockResolvedValue(true)
})

afterEach(async () => {
  await vi.runOnlyPendingTimersAsync()
  vi.useRealTimers()
})

describe('cola de escrituras del borrador con operación colgada', () => {
  it('la escritura colgada vence con error y la siguiente se ejecuta igual', async () => {
    const guardado = guardarBorradorFormulario(borrador, borrador.datos)
    const error = expect(guardado).rejects.toThrow('tardó demasiado')
    const eliminado = eliminarBorradorFormulario(borrador)

    await vi.advanceTimersByTimeAsync(10_000)

    await error
    await expect(eliminado).resolves.toBe(true)
    expect(almacen.eliminarBorradorSiGeneracion).toHaveBeenCalledWith('parte-nuevo:draft:colgado', 1)
    await expect(vaciarEscriturasBorrador()).resolves.toBeUndefined()
  })
})
