import { describe, expect, it } from 'vitest'
import { VERSION_BORRADOR_ACTUAL, migrarPasoBorrador } from './borrador-migracion'

describe('migrarPasoBorrador', () => {
  it('la versión vigente es la 2', () => {
    expect(VERSION_BORRADOR_ACTUAL).toBe(2)
  })

  it('un borrador sin versión (numeración vieja) mueve Confirmar del paso 4 al 5', () => {
    expect(migrarPasoBorrador(4, undefined)).toBe(5)
  })

  it('un borrador sin versión conserva los pasos 1, 2 y 3', () => {
    expect(migrarPasoBorrador(1, undefined)).toBe(1)
    expect(migrarPasoBorrador(2, undefined)).toBe(2)
    expect(migrarPasoBorrador(3, undefined)).toBe(3)
  })

  it('un borrador de la versión vigente no cambia', () => {
    for (const paso of [1, 2, 3, 4, 5]) {
      expect(migrarPasoBorrador(paso, VERSION_BORRADOR_ACTUAL)).toBe(paso)
    }
  })
})
