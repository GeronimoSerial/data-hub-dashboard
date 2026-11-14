'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { useHubData } from '@/components/hub-data'
import { useSectionAccess } from '@/components/app-shell'
import { ResourceCard } from '@/components/resource-card'
import { FORMATOS, type Formato } from '@/lib/model'
import { exploreHref } from '@/lib/explore-filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTextos } from '@/lib/i18n/idioma-provider'
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
  const th = useTextos().shellHub.home
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
        {count} {count === 1 ? th.recurso : th.recursos}
      </span>
    </Link>
  )
}

export function HubPage() {
  const router = useRouter()
  const t = useTextos().shellHub
  const th = t.home
  const { recursos, categorias, niveles } = useHubData()
  const canAccessPath = useSectionAccess()
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
          <h1 className="page-title">{th.titulo}</h1>
          <p className="page-intro">
            {th.intro}
          </p>
          {canAccessPath('/explorar') ? <form
            className="hero-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              router.push(exploreHref({ q: query.trim() || undefined }))
            }}
          >
            <label className="hero-search__label" htmlFor="home-search">
              {th.buscarEtiqueta}
            </label>
            <div className="hero-search__line">
              <Input
                id="home-search"
                className="text-input"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder={th.buscarPlaceholder}
              />
              <Button type="submit">
                <Search size={17} /> {th.buscar}
              </Button>
            </div>
          </form> : null}
        </div>

        <div className="stat-block">
          <div className="stat-block__row">
            <span className="stat-block__label">{th.recursosPublicados}</span>
            <span className="stat-block__value">{published.length}</span>
          </div>
          <div className="stat-block__row">
            <span className="stat-block__label">{th.temas}</span>
            <span className="stat-block__value">{byCategory.length}</span>
          </div>
          <div className="stat-block__row">
            <span className="stat-block__label">{th.nivelesEducativos}</span>
            <span className="stat-block__value">{byLevel.length}</span>
          </div>
        </div>
      </header>

      {/* Acción, no catálogo: el resto del home lleva a consultar recursos y
          esta tarjeta lleva a cargar un dato. Va primero porque durante una
          emergencia es lo que se viene a hacer, no lo que se viene a leer. */}
      {canAccessPath('/infraestructura/cargar') ? <section className="section">
        <div className="section-head">
          <h2>{th.registrarTitulo}</h2>
        </div>
        <Link className="accion-card" href="/infraestructura/cargar">
          <span className="accion-card__name">{th.cargarParte}</span>
          <span className="accion-card__note">
            {th.cargarParteNota}
          </span>
        </Link>
      </section> : null}

      {canAccessPath('/explorar') ? <section className="section">
        <div className="section-head">
          <h2>{th.recientes}</h2>
          {canAccessPath('/explorar') ? <Link className="section-link" href="/explorar">
            {th.verCatalogo}
          </Link> : null}
        </div>
        <div className="card-grid">
          {recent.map((resource) => (
            <ResourceCard key={resource.id} recurso={resource} />
          ))}
        </div>
      </section> : null}

      {canAccessPath('/explorar') ? <section className="section">
        <div className="section-head">
          <h2>{th.porTema}</h2>
        </div>
        <div className="card-grid card-grid--wide">
          {byCategory.map((item) => (
            <BrowseCard
              key={item.id}
              href={exploreHref({ tema: item.id })}
              name={item.nombre}
              note={th.notaTema}
              count={item.count}
              marca={MARCA_TEMA[item.id] ?? MarcaTemaGenerica}
            />
          ))}
        </div>
      </section> : null}

      {canAccessPath('/explorar') ? <section className="section">
        <div className="section-head">
          <h2>{th.porFormato}</h2>
        </div>
        <div className="card-grid card-grid--wide">
          {byFormat.map(({ key, count }) => (
            <BrowseCard
              key={key}
              href={exploreHref({ formato: key })}
              name={t.catalogo.formatos[key].plural}
              note={t.catalogo.formatos[key].descripcion}
              count={count}
              marca={MARCA_FORMATO[key]}
            />
          ))}
        </div>
      </section> : null}

      {canAccessPath('/explorar') ? <section className="section">
        <div className="section-head">
          <h2>{th.porNivel}</h2>
        </div>
        <div className="chip-grid">
          {byLevel.map((item) => (
            <Link className="chip" href={exploreHref({ nivel: item.id })} key={item.id}>
              {item.nombre}
              <span className="chip__count">{item.count}</span>
            </Link>
          ))}
        </div>
      </section> : null}
    </div>
  )
}
