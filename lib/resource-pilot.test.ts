import { describe, expect, it } from 'vitest'
import { isTableroSeed } from './resource-pilot'

describe('isTableroSeed', () => {
  it('requires the exact pilot id, seed key, and HTML mime', () => {
    expect(isTableroSeed('r2', 'r2/seed', 'text/html')).toBe(true)
    expect(isTableroSeed('r2', 'r2/uploaded', 'text/html')).toBe(false)
    expect(isTableroSeed('r2', 'r2/seed', 'application/pdf')).toBe(false)
    expect(isTableroSeed('r3', 'r2/seed', 'text/html')).toBe(false)
  })
})
