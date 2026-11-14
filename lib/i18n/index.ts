import { regionActiva } from '@/lib/infraestructura/region/activa'
import { es } from './diccionarios/es'
import { pt } from './diccionarios/pt'
import type { Diccionario } from './diccionarios/tipos'
import { idiomaDeLocale, type Idioma } from './idioma'
import { idiomaClienteFijado } from './idioma-cliente'

export type { Diccionario, Idioma }

const DICCIONARIOS: Record<Idioma, Diccionario> = { es, pt }

export function textos(idioma: Idioma): Diccionario {
  return DICCIONARIOS[idioma]
}

// Language for code that is not a hook. On the server it follows the active
// region's locale; in the browser it is the value IdiomaProvider set (Spanish if none).
export function idiomaActual(): Idioma {
  if (typeof window === 'undefined') return idiomaDeLocale(regionActiva().locale)
  return idiomaClienteFijado() ?? 'es'
}

export function textosActuales(): Diccionario {
  return textos(idiomaActual())
}
