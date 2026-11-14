import type { Idioma } from './idioma'

// Number formatting locale per dictionary language. es keeps the shipped
// es-AR output (Corrientes) and must not change without a product request.
const LOCALE_NUMERO: Record<Idioma, string> = {
  es: 'es-AR',
  pt: 'pt-BR',
}

export function localeNumero(idioma: Idioma): string {
  return LOCALE_NUMERO[idioma]
}
