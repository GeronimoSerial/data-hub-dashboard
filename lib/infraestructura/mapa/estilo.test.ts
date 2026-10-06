import { describe, expect, it } from 'vitest'
import { cambioEstiloCargado } from './estilo'

describe('cambioEstiloCargado', () => {
  it('no cuenta la carga inicial ni estilos que todavía cargan', () => {
    expect(cambioEstiloCargado(null, 'bright', true)).toBe(false)
    expect(cambioEstiloCargado('bright', 'dark', false)).toBe(false)
  })

  it('detecta un estilo distinto cuando ya terminó de cargar', () => {
    expect(cambioEstiloCargado('dark', 'bright', true)).toBe(true)
    expect(cambioEstiloCargado('bright', 'bright', true)).toBe(false)
  })
})
