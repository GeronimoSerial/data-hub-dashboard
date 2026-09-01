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
import { authClient } from '@/lib/auth-client'
import { isStaff, type Role } from '@/lib/acl'
import { deferPublishUntilFile } from '@/lib/recurso-write'

interface HubData {
  recursos: Recurso[]
  niveles: Nivel[]
  tipos: Tipo[]
  categorias: Categoria[]
  tags: Tag[]
  writeError: string | null
  upsertRecurso: (r: Recurso, file?: File | null) => Promise<boolean>
  removeRecurso: (id: string) => Promise<boolean>
  upsertNivel: (n: Nivel) => Promise<boolean>
  removeNivel: (id: string) => Promise<boolean>
  upsertTipo: (t: Tipo) => Promise<boolean>
  removeTipo: (id: string) => Promise<boolean>
  upsertCategoria: (c: Categoria) => Promise<boolean>
  removeCategoria: (id: string) => Promise<boolean>
  upsertTag: (t: Tag) => Promise<boolean>
  removeTag: (id: string) => Promise<boolean>
}

const HubDataContext = React.createContext<HubData | null>(null)

export function useHubData() {
  const ctx = React.useContext(HubDataContext)
  if (!ctx) throw new Error('useHubData must be used within HubDataProvider')
  return ctx
}

type Catalog = {
  recursos: Recurso[]
  niveles: Nivel[]
  tipos: Tipo[]
  categorias: Categoria[]
  tags: Tag[]
}

function catalogPathForRole(role: Role | undefined) {
  return isStaff(role) ? '/api/hub/admin' : '/api/hub'
}

async function readError(res: Response) {
  const data = (await res.json().catch(() => null)) as { error?: unknown }
  return typeof data?.error === 'string' ? data.error : 'No se pudo guardar'
}

export function HubDataProvider({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession()
  const role = (session.data?.user as { role?: Role } | undefined)?.role
  const catalogPath = catalogPathForRole(role)
  const pending = session.isPending

  const [recursos, setRecursos] = React.useState<Recurso[]>(seedRecursos)
  const [niveles, setNiveles] = React.useState<Nivel[]>(seedNiveles)
  const [tipos, setTipos] = React.useState<Tipo[]>(seedTipos)
  const [categorias, setCategorias] = React.useState<Categoria[]>(seedCategorias)
  const [tags, setTags] = React.useState<Tag[]>(seedTags)
  const [writeError, setWriteError] = React.useState<string | null>(null)

  const recursosRef = React.useRef(recursos)
  const catalogPathRef = React.useRef(catalogPath)

  React.useEffect(() => {
    // Keep the refs in sync with latest values for callbacks (not render-safe writes).
    recursosRef.current = recursos
    catalogPathRef.current = catalogPath
  })

  const applyCatalog = React.useCallback((data: Catalog) => {
    setRecursos(data.recursos)
    setNiveles(data.niveles)
    setTipos(data.tipos)
    setCategorias(data.categorias)
    setTags(data.tags)
  }, [])

  const reload = React.useCallback(async () => {
    const res = await fetch(catalogPathRef.current)
    if (!res.ok) return
    applyCatalog((await res.json()) as Catalog)
  }, [applyCatalog])

  React.useEffect(() => {
    if (pending) return
    let cancelled = false
    fetch(catalogPath)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Catalog | null) => {
        if (cancelled || !data) return
        applyCatalog(data)
      })
    return () => {
      cancelled = true
    }
  }, [applyCatalog, catalogPath, pending])

  const upsertRecurso = React.useCallback(
    async (r: Recurso, file?: File | null) => {
      setWriteError(null)
      const existing = recursosRef.current.find((x) => x.id === r.id)
      const storageKey = r.storageKey || existing?.storageKey
      const merged: Recurso = file
        ? {
            ...r,
            storageKey: storageKey,
            mime: r.mime || existing?.mime,
            nombreOriginal: r.nombreOriginal || existing?.nombreOriginal,
            size: r.size ?? existing?.size,
          }
        : r
      const deferPublish = deferPublishUntilFile(
        merged.estado,
        merged.storageKey,
        Boolean(file),
      )
      const jsonBody: Recurso = deferPublish
        ? { ...merged, estado: 'borrador' }
        : merged
      const res = await fetch(
        existing
          ? `/api/recursos/${encodeURIComponent(r.id)}`
          : '/api/recursos',
        {
          method: existing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonBody),
        },
      )
      if (!res.ok) {
        setWriteError(await readError(res))
        return false
      }
      if (file) {
        const body = new FormData()
        body.append('file', file)
        const up = await fetch(
          `/api/recursos/${encodeURIComponent(r.id)}/archivo`,
          { method: 'POST', body },
        )
        if (!up.ok) {
          setWriteError(await readError(up))
          await reload()
          return false
        }
        if (deferPublish) {
          const uploaded = (await up.json().catch(() => null)) as {
            storageKey?: string
            mime?: string
            nombreOriginal?: string
            size?: number
          } | null
          const published: Recurso = {
            ...merged,
            estado: 'publicado',
            storageKey: uploaded?.storageKey || merged.storageKey,
            mime: uploaded?.mime || merged.mime,
            nombreOriginal: uploaded?.nombreOriginal || merged.nombreOriginal,
            size: uploaded?.size ?? merged.size,
          }
          const pub = await fetch(
            `/api/recursos/${encodeURIComponent(r.id)}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(published),
            },
          )
          if (!pub.ok) {
            setWriteError(await readError(pub))
            await reload()
            return false
          }
        }
      }
      await reload()
      return true
    },
    [reload],
  )

  const removeRecurso = React.useCallback(
    async (id: string) => {
      setWriteError(null)
      const res = await fetch(`/api/recursos/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setWriteError(await readError(res))
        return false
      }
      await reload()
      return true
    },
    [reload],
  )

  const writeTaxonomia = React.useCallback(
    async (kind: string, item: unknown) => {
      setWriteError(null)
      const res = await fetch(`/api/taxonomia/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      if (!res.ok) {
        setWriteError(await readError(res))
        return false
      }
      await reload()
      return true
    },
    [reload],
  )

  const removeTaxonomia = React.useCallback(
    async (kind: string, id: string) => {
      setWriteError(null)
      const res = await fetch(
        `/api/taxonomia/${kind}?id=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        setWriteError(await readError(res))
        return false
      }
      await reload()
      return true
    },
    [reload],
  )

  const value: HubData = {
    recursos,
    niveles,
    tipos,
    categorias,
    tags,
    writeError,
    upsertRecurso,
    removeRecurso,
    upsertNivel: (n) => writeTaxonomia('niveles', n),
    removeNivel: (id) => removeTaxonomia('niveles', id),
    upsertTipo: (t) => writeTaxonomia('tipos', t),
    removeTipo: (id) => removeTaxonomia('tipos', id),
    upsertCategoria: (c) => writeTaxonomia('categorias', c),
    removeCategoria: (id) => removeTaxonomia('categorias', id),
    upsertTag: (t) => writeTaxonomia('tags', t),
    removeTag: (id) => removeTaxonomia('tags', id),
  }

  return (
    <HubDataContext.Provider value={value}>{children}</HubDataContext.Provider>
  )
}
