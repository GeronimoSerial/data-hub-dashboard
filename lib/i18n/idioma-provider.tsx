'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { idiomaActual, textos, textosActuales, type Diccionario, type Idioma } from './index'
import { fijarIdiomaCliente } from './idioma-cliente'

const IdiomaContext = createContext<Idioma | undefined>(undefined)

export function IdiomaProvider({
  idioma,
  children,
}: {
  idioma: Idioma
  children: ReactNode
}) {
  fijarIdiomaCliente(idioma)
  return <IdiomaContext.Provider value={idioma}>{children}</IdiomaContext.Provider>
}

// Texts for the language of the nearest IdiomaProvider. Without a provider it
// falls back to textosActuales().
export function useTextos(): Diccionario {
  const idioma = useContext(IdiomaContext)
  return idioma ? textos(idioma) : textosActuales()
}

// Language of the nearest IdiomaProvider; without one, the browser language.
export function useIdioma(): Idioma {
  const idioma = useContext(IdiomaContext)
  return idioma ?? idiomaActual()
}
