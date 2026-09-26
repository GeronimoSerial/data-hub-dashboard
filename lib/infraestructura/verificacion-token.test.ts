import { describe, expect, it } from 'vitest'
import {
  calcularVencimientoToken,
  generarToken,
  hashearToken,
  tokenExpirado,
} from './verificacion-token'

const MS_POR_DIA = 24 * 60 * 60 * 1000

describe('generarToken / hashearToken', () => {
  it('produce un token distinto en cada llamada', () => {
    const a = generarToken()
    const b = generarToken()
    expect(a.token).not.toBe(b.token)
  })

  it('el tokenHash es reproducible desde el token en claro', () => {
    const { token, tokenHash } = generarToken()
    expect(hashearToken(token)).toBe(tokenHash)
  })

  it('el token no contiene "+", "/" ni relleno "="', () => {
    const { token } = generarToken()
    expect(token).not.toContain('+')
    expect(token).not.toContain('/')
    expect(token).not.toContain('=')
  })
})

describe('tokenExpirado', () => {
  it('false antes de la fecha de expiración', () => {
    const expira = '2026-01-01T00:00:00.000Z'
    expect(tokenExpirado(expira, new Date('2025-12-31T23:59:59.999Z'))).toBe(false)
  })

  it('true justo en el instante exacto de expiración (borde inclusivo)', () => {
    const expira = '2026-01-01T00:00:00.000Z'
    expect(tokenExpirado(expira, new Date('2026-01-01T00:00:00.000Z'))).toBe(true)
  })

  it('true después de la fecha de expiración', () => {
    const expira = '2026-01-01T00:00:00.000Z'
    expect(tokenExpirado(expira, new Date('2026-01-01T00:00:00.001Z'))).toBe(true)
  })
})

describe('calcularVencimientoToken', () => {
  it('con diasValidez=30 cae exactamente 30 días después, al milisegundo', () => {
    const ahora = new Date('2026-01-01T00:00:00.000Z')
    const vencimiento = calcularVencimientoToken(ahora, 30)
    expect(new Date(vencimiento).getTime() - ahora.getTime()).toBe(30 * MS_POR_DIA)
    expect(vencimiento).toBe('2026-01-31T00:00:00.000Z')
  })

  it('el default equivale a 30 días', () => {
    const ahora = new Date('2026-03-01T12:00:00.000Z')
    expect(calcularVencimientoToken(ahora)).toBe(calcularVencimientoToken(ahora, 30))
  })
})
