import { describe, expect, it } from 'vitest'
import { esMismoCueBase, normalizeCue } from './cue'

describe('normalizeCue', () => {
  it('parses a CUE with anexo', () => {
    expect(normalizeCue('1801605-04')).toEqual({
      kind: 'anexo',
      base: '1801605',
      anexo: '04',
      value: '1801605-04',
    })
  })

  it('parses a base CUE without converting it to anexo 00', () => {
    expect(normalizeCue('1801605')).toEqual({
      kind: 'base',
      base: '1801605',
      value: '1801605',
    })
  })

  it('keeps the anexo 00 exactly as provided', () => {
    expect(normalizeCue('1800001-00')).toEqual({
      kind: 'anexo',
      base: '1800001',
      anexo: '00',
      value: '1800001-00',
    })
  })

  it('returns null for an empty string', () => {
    expect(normalizeCue('')).toBeNull()
  })

  it('returns null for non-numeric input', () => {
    expect(normalizeCue('abc')).toBeNull()
  })

  it('returns null for a 6-digit base', () => {
    expect(normalizeCue('180160-04')).toBeNull()
  })

  it('returns null for a 1-digit anexo', () => {
    expect(normalizeCue('1801605-4')).toBeNull()
  })

  it('returns null for a 3-digit anexo', () => {
    expect(normalizeCue('1801605-004')).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(normalizeCue(undefined as unknown as string)).toBeNull()
  })
})

describe('esMismoCueBase', () => {
  it('is true across anexo and base with the same base', () => {
    expect(
      esMismoCueBase(
        { kind: 'anexo', base: '1801605', anexo: '04', value: '1801605-04' },
        { kind: 'base', base: '1801605', value: '1801605' },
      ),
    ).toBe(true)
  })

  it('is false for different bases', () => {
    expect(
      esMismoCueBase(
        { kind: 'anexo', base: '1801605', anexo: '04', value: '1801605-04' },
        { kind: 'base', base: '1800001', value: '1800001' },
      ),
    ).toBe(false)
  })
})
