'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Search } from 'lucide-react'
import { useHubData } from '@/components/hub-data'
import { ResourceCard } from '@/components/resource-card'
import { FORMATOS, type Formato } from '@/lib/model'
import { exploreHref } from '@/lib/explore-filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function HubPage() {
  const router = useRouter()
  const { recursos, categorias, niveles } = useHubData()
  const [query, setQuery] = React.useState('')
  const published = recursos.filter((item) => item.estado === 'publicado')
  const recent = [...published].sort((a, b) => b.actualizado.localeCompare(a.actualizado)).slice(0, 3)
  const usedCategories = categorias.filter((item) => published.some((resource) => resource.categoriaId === item.id))
  const usedLevels = niveles.filter((item) => published.some((resource) => resource.nivelId === item.id))

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Información para decidir</span>
        <h1 className="page-title">Encontrá la información educativa que necesitás</h1>
        <p className="page-intro">Explorá datos, informes y visualizaciones del sistema educativo provincial sin tener que conocer de antemano su formato.</p>
        <form className="hero-search" role="search" onSubmit={(event) => { event.preventDefault(); router.push(exploreHref({ q: query.trim() || undefined })) }}>
          <label htmlFor="home-search" style={{ flex: 1 }}><span className="eyebrow">¿Qué información estás buscando?</span><Input id="home-search" className="text-input" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Matrícula, trayectorias, nivel secundario…" /></label>
          <Button type="submit"><Search size={18} /> Buscar</Button>
        </form>
      </header>

      <section className="section">
        <div className="section-head"><h2>Explorá por tema</h2><Link href="/explorar">Ver todo <ArrowRight size={15} /></Link></div>
        <div className="card-grid">{usedCategories.map((item) => <Link className="link-card" href={exploreHref({ tema: item.id })} key={item.id}><strong>{item.nombre}</strong><span className="muted">Ver recursos del tema</span></Link>)}</div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Explorá por nivel</h2></div>
        <div className="card-grid">{usedLevels.map((item) => <Link className="link-card" href={exploreHref({ nivel: item.id })} key={item.id}><strong>{item.nombre}</strong><span className="muted">Información para este nivel</span></Link>)}</div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Actualizaciones recientes</h2></div>
        <div className="card-grid">{recent.map((resource) => <ResourceCard key={resource.id} recurso={resource} />)}</div>
      </section>

      <section className="section">
        <div className="section-head"><h2>También podés explorar por formato</h2></div>
        <div className="card-grid">{(Object.keys(FORMATOS) as Formato[]).map((format) => <Link className="link-card" href={exploreHref({ formato: format })} key={format}><strong>{FORMATOS[format].plural}</strong><span className="muted">{FORMATOS[format].descripcion}</span></Link>)}</div>
      </section>
    </div>
  )
}
