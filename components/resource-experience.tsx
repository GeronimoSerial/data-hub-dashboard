'use client'

import Link from 'next/link'
import type { Recurso } from '@/lib/model'
import { presentResource, relatedResources } from '@/lib/resource-presentation'
import { authClient } from '@/lib/auth-client'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { ResourceCard } from '@/components/resource-card'
import { RecursoViewer } from '@/components/recurso-viewer'
import { ExplainResource } from '@/components/explain-resource'
import { ShareView } from '@/components/share-view'

export function ResourceExperience({
  recurso,
  categorias,
  niveles,
  tipos,
  related,
}: {
  recurso: Recurso
  categorias: { id: string; nombre: string }[]
  niveles: { id: string; nombre: string }[]
  tipos: { id: string; nombre: string }[]
  related: Recurso[]
}) {
  const session = authClient.useSession()
  const view = presentResource(
    recurso,
    { categorias, niveles, tipos },
    { isPending: session.isPending, hasUser: Boolean(session.data?.user) },
  )
  const recommendations = relatedResources(recurso, related)
  const target = view.target
  return (
    <div className="page-stack resource-experience">
      <Breadcrumbs items={view.breadcrumbs} />
      <header className="resource-header">
        <div className="resource-card__top">
          <span className="badge">{view.formatLabel}</span>
          <span className="badge badge--neutral">{view.topicLabel}</span>
          <span className={view.accessState === 'restricted' ? 'badge badge--locked' : 'badge badge--neutral'}>{view.accessLabel}</span>
        </div>
        <h1 className="page-title">{view.title}</h1>
        <p className="page-intro">{view.description}</p>
        <div className="metadata" aria-label="Información del recurso">
          <span>Nivel: {view.levelLabel}</span>
          <span>Tipo: {view.typeLabel}</span>
          <span>Actualizado: {view.updatedLabel}</span>
          <span>Área: {recurso.area}</span>
        </div>
        <div className="resource-actions">
          {target && target !== `/recursos/${recurso.id}` ? <Button render={<Link href={target} />}>{view.primaryAction}</Button> : <Button render={<a href="#resource-content" />}>{view.primaryAction}</Button>}
          <ExplainResource resourceId={recurso.id} />
          <ShareView />
        </div>
      </header>
      <section id="resource-content" aria-label="Contenido del recurso" className="resource-viewer-section">
        <RecursoViewer recurso={recurso} />
      </section>
      {recommendations.length ? (
        <section className="section">
          <div className="section-head"><h2>También puede interesarte</h2></div>
          <div className="card-grid">{recommendations.map((item) => <ResourceCard key={item.id} recurso={item} />)}</div>
        </section>
      ) : null}
    </div>
  )
}