'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { useHubData } from '@/components/hub-data'
import { ResourceCard } from '@/components/resource-card'
import { FORMATOS, type Formato } from '@/lib/model'
import { exploreHref } from '@/lib/explore-filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MARCA_FORMATO, MARCA_TEMA, MarcaTemaGenerica } from '@/components/marcas-tematicas'

function BrowseCard({
  href,
  name,
  note,
  count,
  marca: Marca,
}: {
  href: string
  name: string
  note: string
  count: number
  marca?: (props: { className?: string }) => React.JSX.Element
}) {
  return (
    <Link className="browse-card" href={href}>
      {Marca ? (
        <span className="browse-card__marca">
          <Marca />
        </span>
      ) : null}
      <span className="browse-card__name">{name}</span>
      <span className="browse-card__note">{note}</span>
      <span className="browse-card__count">
        {count} {count === 1 ? 'recurso' : 'recursos'}
      </span>
    </Link>
  )
}

export function HubPage() {
  const router = useRouter()
  const { recursos, categorias, niveles } = useHubData()
  const [query, setQuery] = React.useState('')
  const published = recursos.filter((item) => item.estado === 'publicado')
  const recent = [...published].sort((a, b) => b.actualizado.localeCompare(a.actualizado)).slice(0, 3)
  const byCategory = categorias
    .map((item) => ({ ...item, count: published.filter((r) => r.categoriaId === item.id).length }))
    .filter((item) => item.count > 0)
  const byLevel = niveles
    .map((item) => ({ ...item, count: published.filter((r) => r.nivelId === item.id).length }))
    .filter((item) => item.count > 0)
  const byFormat = (Object.keys(FORMATOS) as Formato[])
    .map((key) => ({ key, count: published.filter((r) => r.formato === key).length }))
    .filter((item) => item.count > 0)

  return (
    <div className="page-stack">
      <header className="hero">
        <div className="hero__lead">
          <h1 className="page-title">Análisis educativo</h1>
          <p className="page-intro">
            Reportes, tableros y mapas publicados por las direcciones del
            Ministerio. Algunos requieren ingresar con cuenta.
          </p>
          <form
            className="hero-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              router.push(exploreHref({ q: query.trim() || undefined }))
            }}
          >
            <label className="hero-search__label" htmlFor="home-search">
              Buscar información
            </label>
            <div className="hero-search__line">
              <Input
                id="home-search"
                className="text-input"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Matrícula, trayectorias, nivel secundario…"
              />
              <Button type="submit">
                <Search size={17} /> Buscar
              </Button>
            </div>
          </form>
        </div>

        <div className="stat-block">
          <div className="stat-block__row">
            <span className="stat-block__label">Recursos publicados</span>
            <span className="stat-block__value">{published.length}</span>
          </div>
          <div className="stat-block__row">
            <span className="stat-block__label">Temas</span>
            <span className="stat-block__value">{byCategory.length}</span>
          </div>
          <div className="stat-block__row">
            <span className="stat-block__label">Niveles educativos</span>
            <span className="stat-block__value">{byLevel.length}</span>
          </div>
        </div>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>Actualizaciones recientes</h2>
          <Link className="section-link" href="/explorar">
            Ver el catálogo
          </Link>
        </div>
        <div className="card-grid">
          {recent.map((resource) => (
            <ResourceCard key={resource.id} recurso={resource} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Explorar por tema</h2>
        </div>
        <div className="card-grid card-grid--wide">
          {byCategory.map((item) => (
            <BrowseCard
              key={item.id}
              href={exploreHref({ tema: item.id })}
              name={item.nombre}
              note="Ver los recursos publicados sobre este tema."
              count={item.count}
              marca={MARCA_TEMA[item.id] ?? MarcaTemaGenerica}
            />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Explorar por formato</h2>
        </div>
        <div className="card-grid card-grid--wide">
          {byFormat.map(({ key, count }) => (
            <BrowseCard
              key={key}
              href={exploreHref({ formato: key })}
              name={FORMATOS[key].plural}
              note={FORMATOS[key].descripcion}
              count={count}
              marca={MARCA_FORMATO[key]}
            />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Explorar por nivel educativo</h2>
        </div>
        <div className="chip-grid">
          {byLevel.map((item) => (
            <Link className="chip" href={exploreHref({ nivel: item.id })} key={item.id}>
              {item.nombre}
              <span className="chip__count">{item.count}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
