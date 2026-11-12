import type { Idioma } from './idioma'

// Client-side language set by IdiomaProvider during render. Plain module (no
// 'use client') so non-component code can read it, as region publica.ts does.
let idiomaCliente: Idioma | undefined

export function fijarIdiomaCliente(idioma: Idioma): void {
  idiomaCliente = idioma
}

export function idiomaClienteFijado(): Idioma | undefined {
  return idiomaCliente
}

export function __reiniciarIdiomaClienteParaPruebas(): void {
  idiomaCliente = undefined
}
