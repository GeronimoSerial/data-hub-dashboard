'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { useHubData } from '@/components/hub-data'
import { ResourceCard } from '@/components/resource-card'
import { FORMATOS, type Formato } from '@/lib/model'
import {
  canonicalizeExploreSearch,
  normalizeExploreQuery,
  normalizeExploreText,
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
const EXPLORE_RETURN_PREFIX = 'hub-explore-return:'

function exploreReturnKey(pathname: string) {
  return `${EXPLORE_RETURN_PREFIX}${pathname}${window.location.search}`
}

function rememberExplorePosition(pathname: string, resourceId: string) {
  try {
    sessionStorage.setItem(
      exploreReturnKey(pathname),
      JSON.stringify({ scrollY: window.scrollY, resourceId }),
    )
  } catch {
    // Storage can be unavailable in private browsing; native router behavior remains.
  }
}

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
  const returnTo = `${pathname}${searchParams.size ? `?${searchParams}` : ''}`
  const resultsHeadingRef = React.useRef<HTMLHeadingElement>(null)
  const focusResultsAfterNavigation = React.useRef(false)
  const [filtersOpen, setFiltersOpen] = React.useState(
    () => Boolean(filters.tema || filters.nivel || filters.formato),
  )

  React.useEffect(() => {
    if (!('scrollRestoration' in window.history)) return
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'auto'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  React.useEffect(() => {
    let saved: { scrollY?: number; resourceId?: string } | null = null
    const key = exploreReturnKey(pathname)
    try {
      const raw = sessionStorage.getItem(key)
      if (raw) {
        saved = JSON.parse(raw) as { scrollY?: number; resourceId?: string }
        sessionStorage.removeItem(key)
      }
    } catch {
      saved = null
    }
    if (saved?.scrollY != null && Number.isFinite(saved.scrollY)) {
      window.scrollTo({ top: saved.scrollY, behavior: 'auto' })
    }
    if (saved?.resourceId) {
      const card = Array.from(document.querySelectorAll<HTMLElement>('[data-resource-id]'))
        .find((element) => element.dataset.resourceId === saved?.resourceId)
      card?.focus({ preventScroll: true })
    }
  }, [pathname, searchParams])

  React.useEffect(() => {
    if (!focusResultsAfterNavigation.current) return
    focusResultsAfterNavigation.current = false
    resultsHeadingRef.current?.focus()
  }, [urlQuery])

  function update(next: Partial<ExploreFilters>, method: 'push' | 'replace', focusResults = false) {
    const params = serializeExploreFilters({ ...filters, ...next })
    const href = `${pathname}${params.size ? `?${params}` : ''}`
    if (focusResults) {
      focusResultsAfterNavigation.current = true
    }
    if (method === 'push') router.push(href)
    else router.replace(href)
  }

  const results = recursos.filter((resource) => {
    if (resource.estado !== 'publicado') return false
    if (filters.tema && resource.categoriaId !== filters.tema) return false
    if (filters.nivel && resource.nivelId !== filters.nivel) return false
    if (filters.formato && resource.formato !== filters.formato) return false
    if (filters.q) {
      const haystack = normalizeExploreText(`${resource.titulo} ${resource.descripcion} ${resource.area}`)
      if (!haystack.includes(normalizeExploreText(filters.q))) return false
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
    <div className="page-stack page-stack--tight">
      <header className="explore-head">
        <div className="explore-head__title">
          <span className="eyebrow">Catálogo público</span>
          <h1 className="page-title page-title--sm">Explorá información educativa</h1>
        </div>
        <p className="explore-head__note">Buscá por tema, nivel o formato. Los filtros quedan en la URL para volver o compartir esta vista.</p>
      </header>

      <div className="explore-controls">
        <div className="explore-bar">
          <form className="explore-search" onSubmit={(event) => {
            event.preventDefault()
            const value = String(new FormData(event.currentTarget).get('q') ?? '')
            update({ q: normalizeExploreQuery(value) || undefined }, 'push', true)
          }} role="search">
            <div className="hero-search__line">
              <Input key={urlQuery} id="resource-search" name="q" className="text-input" aria-label="Buscar en el catálogo" defaultValue={urlQuery} placeholder="Matrícula, trayectorias, Goya…" />
              <Button type="submit" aria-label="Buscar"><Search size={17} /><span className="explore-search__label">Buscar</span></Button>
            </div>
          </form>

          <Button
            className="filters-toggle filters-desktop"
            variant="secondary"
            aria-expanded={filtersOpen}
            aria-controls="explore-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={16} />
            Filtros{active.length ? ` (${active.length})` : ''}
            <ChevronDown className="filters-toggle__chevron" size={15} aria-hidden />
          </Button>

          <MobileFilters
            filters={filters}
            options={filterOptions}
            activeCount={active.length}
            onApply={(next) => update(next, 'replace')}
          />
        </div>

        {filtersOpen ? (
          <div id="explore-filters" className="filters filters-desktop" aria-label="Filtros del catálogo">
            <Filter label="Tema" value={filters.tema ?? ALL} onValueChange={(value) => update({ tema: value === ALL ? undefined : value }, 'replace')} options={[{ value: ALL, label: 'Todos los temas' }, ...filterOptions.temas]} />
            <Filter label="Nivel" value={filters.nivel ?? ALL} onValueChange={(value) => update({ nivel: value === ALL ? undefined : value }, 'replace')} options={[{ value: ALL, label: 'Todos los niveles' }, ...filterOptions.niveles]} />
            <Filter label="Formato" value={filters.formato ?? ALL} onValueChange={(value) => update({ formato: value === ALL ? undefined : value as Formato }, 'replace')} options={[{ value: ALL, label: 'Todos los formatos' }, ...filterOptions.formatos]} />
          </div>
        ) : null}

        {active.length ? (
          <div className="active-filters" aria-label="Filtros activos">
            {active.map((label) => <span className="badge" key={label}>{label}</span>)}
            <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}><X size={15} /> Limpiar</Button>
          </div>
        ) : null}
      </div>

      <section className="section">
        <div className="section-head"><h2 ref={resultsHeadingRef} tabIndex={-1}>Resultados</h2><span className="badge badge--neutral" aria-live="polite">{results.length} {results.length === 1 ? 'recurso' : 'recursos'}</span></div>
        {results.length ? <div className="card-grid">{results.map((resource) => <ResourceCard key={resource.id} recurso={resource} returnTo={returnTo} onNavigate={() => rememberExplorePosition(pathname, resource.id)} />)}</div> : <div className="empty-state"><h2>No encontramos resultados</h2><p className="muted">Probá con menos filtros o una búsqueda más general.</p><Button variant="secondary" onClick={() => router.replace(pathname)}>Limpiar filtros</Button></div>}
      </section>
    </div>
  )
}
