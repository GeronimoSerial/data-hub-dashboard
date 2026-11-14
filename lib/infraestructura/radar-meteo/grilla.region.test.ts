import { describe, expect, it } from 'vitest'
import { GRID_VERSION } from './grilla'

describe('GRID_VERSION', () => {
  it('keeps the Corrientes grid version', () => {
    expect(GRID_VERSION).toBe('corrientes-0.2-v1')
  })
})
