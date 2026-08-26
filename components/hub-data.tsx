'use client'

import * as React from 'react'
import {
  type Categoria,
  type Nivel,
  type Recurso,
  type Tag,
  type Tipo,
  categorias as seedCategorias,
  niveles as seedNiveles,
  recursos as seedRecursos,
  tags as seedTags,
  tipos as seedTipos,
} from '@/lib/model'

interface HubData {
  recursos: Recurso[]
  niveles: Nivel[]
  tipos: Tipo[]
  categorias: Categoria[]
  tags: Tag[]
  upsertRecurso: (r: Recurso) => void
  removeRecurso: (id: string) => void
  upsertNivel: (n: Nivel) => void
  removeNivel: (id: string) => void
  upsertTipo: (t: Tipo) => void
  removeTipo: (id: string) => void
  upsertCategoria: (c: Categoria) => void
  removeCategoria: (id: string) => void
  upsertTag: (t: Tag) => void
  removeTag: (id: string) => void
}

const HubDataContext = React.createContext<HubData | null>(null)

export function useHubData() {
  const ctx = React.useContext(HubDataContext)
  if (!ctx) throw new Error('useHubData must be used within HubDataProvider')
  return ctx
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id)
  if (idx === -1) return [...list, item]
  const next = [...list]
  next[idx] = item
  return next
}

export function HubDataProvider({ children }: { children: React.ReactNode }) {
  const [recursos, setRecursos] = React.useState<Recurso[]>(seedRecursos)
  const [niveles, setNiveles] = React.useState<Nivel[]>(seedNiveles)
  const [tipos, setTipos] = React.useState<Tipo[]>(seedTipos)
  const [categorias, setCategorias] = React.useState<Categoria[]>(seedCategorias)
  const [tags, setTags] = React.useState<Tag[]>(seedTags)

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/hub')
      .then((res) => res.json())
      .then(
        (data: {
          recursos: Recurso[]
          niveles: Nivel[]
          tipos: Tipo[]
          categorias: Categoria[]
          tags: Tag[]
        }) => {
          if (cancelled) return
          setRecursos(data.recursos)
          setNiveles(data.niveles)
          setTipos(data.tipos)
          setCategorias(data.categorias)
          setTags(data.tags)
        },
      )
    return () => {
      cancelled = true
    }
  }, [])

  const value: HubData = {
    recursos,
    niveles,
    tipos,
    categorias,
    tags,
    upsertRecurso: (r) => setRecursos((l) => upsert(l, r)),
    removeRecurso: (id) => setRecursos((l) => l.filter((x) => x.id !== id)),
    upsertNivel: (n) => setNiveles((l) => upsert(l, n)),
    removeNivel: (id) => setNiveles((l) => l.filter((x) => x.id !== id)),
    upsertTipo: (t) => setTipos((l) => upsert(l, t)),
    removeTipo: (id) => setTipos((l) => l.filter((x) => x.id !== id)),
    upsertCategoria: (c) => setCategorias((l) => upsert(l, c)),
    removeCategoria: (id) => setCategorias((l) => l.filter((x) => x.id !== id)),
    upsertTag: (t) => setTags((l) => upsert(l, t)),
    removeTag: (id) => setTags((l) => l.filter((x) => x.id !== id)),
  }

  return (
    <HubDataContext.Provider value={value}>{children}</HubDataContext.Provider>
  )
}
