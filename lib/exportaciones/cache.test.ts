import { describe, expect, it, vi } from 'vitest'
import { crearCacheExportaciones } from './cache'

describe('caché de exportaciones', () => {
  it('comparte el trabajo simultáneo y permite reintentar errores', async () => {
    const cache = crearCacheExportaciones<number>(2)
    const cargar = vi.fn().mockRejectedValueOnce(new Error('temporal')).mockResolvedValue(4)
    const uno = cache.obtener('a', cargar)
    const dos = cache.obtener('a', cargar)
    expect(uno).toBe(dos)
    await expect(uno).rejects.toThrow('temporal')
    await expect(cache.obtener('a', cargar)).resolves.toBe(4)
    expect(cargar).toHaveBeenCalledTimes(2)
  })

  it('acota la memoria, vence entradas y admite invalidación explícita', async () => {
    const reloj = vi.spyOn(Date, 'now').mockReturnValue(1000)
    try {
      const cache = crearCacheExportaciones<number>(2, 100)
      const cargar = vi.fn().mockResolvedValue(1)
      await cache.obtener('a', cargar)
      await cache.obtener('b', cargar)
      await cache.obtener('c', cargar)
      await cache.obtener('a', cargar)
      expect(cargar).toHaveBeenCalledTimes(4)
      reloj.mockReturnValue(1100)
      await cache.obtener('a', cargar)
      expect(cargar).toHaveBeenCalledTimes(5)
      cache.limpiar()
      await cache.obtener('a', cargar)
      expect(cargar).toHaveBeenCalledTimes(6)
    } finally {
      reloj.mockRestore()
    }
  })
})
