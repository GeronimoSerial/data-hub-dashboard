import { describe, expect, it } from 'vitest'
import { esquemaSalidaVeredicto } from './esquema'

const frase = (texto: string, refs: string[] = []) => ({ texto, refs })
const veredicto = (frases: { texto: string; refs: string[] }[]) => ({
  fecha: '2026-10-13',
  ambito: 'provincia',
  frases,
})
const dosFrases = [frase('Primera frase.'), frase('Segunda frase.')]

describe('esquemaSalidaVeredicto', () => {
  it('acepta una salida válida con un ámbito de dos frases', () => {
    const resultado = esquemaSalidaVeredicto.safeParse({
      veredictos: [veredicto([frase('Hay 2 mm.', ['lluvia.a']), frase('Sin cifras.')])],
    })

    expect(resultado.success).toBe(true)
  })

  it('rechaza un ámbito con una sola frase', () => {
    const resultado = esquemaSalidaVeredicto.safeParse({
      veredictos: [veredicto([frase('Solo una.')])],
    })

    expect(resultado.success).toBe(false)
  })

  it('rechaza un ámbito con más de tres frases', () => {
    const resultado = esquemaSalidaVeredicto.safeParse({
      veredictos: [veredicto([...dosFrases, frase('Tercera.'), frase('Cuarta.')])],
    })

    expect(resultado.success).toBe(false)
  })

  it('rechaza una fecha que no es YYYY-MM-DD', () => {
    const resultado = esquemaSalidaVeredicto.safeParse({
      veredictos: [{ ...veredicto(dosFrases), fecha: '13/10/2026' }],
    })

    expect(resultado.success).toBe(false)
  })

  it('rechaza textos vacíos o de más de 400 caracteres', () => {
    const vacio = esquemaSalidaVeredicto.safeParse({
      veredictos: [veredicto([frase(''), frase('ok')])],
    })
    const largo = esquemaSalidaVeredicto.safeParse({
      veredictos: [veredicto([frase('a'.repeat(401)), frase('ok')])],
    })

    expect(vacio.success).toBe(false)
    expect(largo.success).toBe(false)
  })

  it('rechaza más de seis refs en una frase', () => {
    const resultado = esquemaSalidaVeredicto.safeParse({
      veredictos: [
        veredicto([
          frase('Uno.', ['a', 'b', 'c', 'd', 'e', 'f', 'g']),
          frase('Dos.'),
        ]),
      ],
    })

    expect(resultado.success).toBe(false)
  })

  it('rechaza una lista de veredictos vacía o de más de cuarenta', () => {
    const vacia = esquemaSalidaVeredicto.safeParse({ veredictos: [] })
    const demasiados = esquemaSalidaVeredicto.safeParse({
      veredictos: Array.from({ length: 41 }, () => veredicto(dosFrases)),
    })

    expect(vacia.success).toBe(false)
    expect(demasiados.success).toBe(false)
  })
})
