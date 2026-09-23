import { describe, expect, it } from 'vitest'
import { rangoSeveridad } from './severidad-visual'

describe('rangoSeveridad', () => {
  it('respeta el orden de severidad usado en los clusters', () => {
    expect(['Baja', 'Media', 'Alta', 'Crítica'].map(rangoSeveridad)).toEqual([0, 1, 2, 3])
  })

  it('trata un valor desconocido como la severidad más baja', () => {
    expect(rangoSeveridad('Desconocida')).toBe(0)
  })
})
