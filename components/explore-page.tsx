'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { useHubData } from '@/components/hub-data'
import { ResourceCard } from '@/components/resource-card'
import { FORMATOS, type Formato } from '@/lib/model'
import {
  canonicalizeExploreSearch,
  parseExploreFilters,
  serializeExploreFilters,
  type ExploreFilters,
} from '@/lib/explore-filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Filter,
  MobileFilters,
} from '@/components/explore-filters-sheet'

const ALL = 'all'

export function ExplorePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { recursos, categorias, niveles } = useHubData()
  const allowed = React.useMemo(() => ({
    temas: new Set(categorias.map((item) => item.id)),
    niveles: new Set(niveles.map((item) => item.id)),
  }), [categorias, niveles])

  // Normalize invalid/unknown search params to the canonical URL so shared and
  // history links always settle on an equivalent, stable state.
  React.useEffect(() => {
    const { canonical, changed } = canonicalizeExploreSearch(searchParams, allowed)
    if (changed) {
      router.replace(`${pathname}${canonical ? `?${canonical}` : ''}`)
    }
  }, [searchParams, pathname, allowed, router])

  const filters = React.useMemo(() => parseExploreFilters(searchParams, allowed), [searchParams, allowed])
  const urlQuery = filters.q ?? ''
  const [query, setQuery] = React.useState(urlQuery)
  const [syncedQuery, setSyncedQuery] = React.useState(urlQuery)

  // Adjust the input state when the URL query changes (navigation/back-forward)
  // without performing a cascading render through an effect.
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery)
    setQuery(urlQuery)
  }

  function update(next: Partial<ExploreFilters>) {
    const params = serializeExploreFilters({ ...filters, ...next })
    router.push(`${pathname}${params.size ? `?${params}` : ''}`)
  }

  const results = recursos.filter((resource) => {
    if (resource.estado !== 'publicado') return false
    if (filters.tema && resource.categoriaId !== filters.tema) return false
    if (filters.nivel && resource.nivelId !== filters.nivel) return false
    if (filters.formato && resource.formato !== filters.formato) return false
    if (filters.q) {
      const haystack = `${resource.titulo} ${resource.descripcion} ${resource.area}`.toLocaleLowerCase('es')
      if (!haystack.includes(filters.q)) return false
    }
    return true
  })

  const active = [filters.q && `“${filters.q}”`, filters.tema && categorias.find((c) => c.id === filters.tema)?.nombre, filters.nivel && niveles.find((n) => n.id === filters.nivel)?.nombre, filters.formato && FORMATOS[filters.formato].label].filter(Boolean)

  const filterOptions = {
    temas: categorias.map((item) => ({ value: item.id, label: item.nombre })),
    niveles: niveles.map((item) => ({ value: item.id, label: item.nombre })),
    formatos: (Object.keys(FORMATOS) as Formato[]).map((key) => ({ value: key, label: FORMATOS[key].label })),
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Catálogo público</span>
        <h1 className="page-title">Explorá información educativa</h1>
        <p className="page-intro">Buscá por tema, nivel o formato. Los filtros quedan en la URL para que puedas volver o compartir esta vista.</p>
      </header>

      <form className="hero-search" onSubmit={(event) => { event.preventDefault(); update({ q: query.trim() || undefined }) }} role="search">
        <label htmlFor="resource-search" className="filter-field" style={{ flex: 1 }}>
          <span>Buscar</span>
          <Input id="resource-search" className="text-input" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Ejemplo: matrícula, trayectorias, Goya…" />
        </label>
        <Button type="submit"><Search size={18} /> Buscar</Button>
      </form>

      <div className="filters filters-desktop" aria-label="Filtros del catálogo">
        <Filter label="Tema" value={filters.tema ?? ALL} onValueChange={(value) => update({ tema: value === ALL ? undefined : value })} options={[{ value: ALL, label: 'Todos los temas' }, ...filterOptions.temas]} />
        <Filter label="Nivel" value={filters.nivel ?? ALL} onValueChange={(value) => update({ nivel: value === ALL ? undefined : value })} options={[{ value: ALL, label: 'Todos los niveles' }, ...filterOptions.niveles]} />
        <Filter label="Formato" value={filters.formato ?? ALL} onValueChange={(value) => update({ formato: value === ALL ? undefined : value as Formato })} options={[{ value: ALL, label: 'Todos los formatos' }, ...filterOptions.formatos]} />
      </div>

      <MobileFilters
        filters={filters}
        options={filterOptions}
        activeCount={active.length}
        onApply={(next) => update(next)}
      />

      {active.length ? (
        <div className="active-filters" aria-label="Filtros activos">
          {active.map((label) => <span className="badge" key={label}>{label}</span>)}
          <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}><X size={15} /> Limpiar</Button>
        </div>
      ) : null}

      <section className="section" aria-live="polite">
        <div className="section-head"><h2>Resultados</h2><span className="badge badge--neutral">{results.length} {results.length === 1 ? 'recurso' : 'recursos'}</span></div>
        {results.length ? <div className="card-grid">{results.map((resource) => <ResourceCard key={resource.id} recurso={resource} />)}</div> : <div className="empty-state"><h2>No encontramos resultados</h2><p className="muted">Probá con menos filtros o una búsqueda más general.</p><Button variant="secondary" onClick={() => router.push(pathname)}>Limpiar filtros</Button></div>}
      </section>
    </div>
  )
}
