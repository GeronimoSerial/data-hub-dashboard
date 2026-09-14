'use client'

import type { Recurso } from '@/lib/model'
import { presentResource, relatedResources } from '@/lib/resource-presentation'
import { authClient } from '@/lib/auth-client'
import { useResourceDetails } from '@/components/app-shell'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { ResourceCard } from '@/components/resource-card'
import { RecursoViewer } from '@/components/recurso-viewer'
import { ExplainResource } from '@/components/explain-resource'
import { ShareView } from '@/components/share-view'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { normalizeResourceReturnTo, resourceLegacyTarget } from '@/lib/resource-href'
import { resourceContent } from '@/lib/resource-content'
import { LegacyViewer } from '@/components/legacy-viewer'

export function ResourceExperience({
  recurso,
  categorias,
  niveles,
  tipos,
  related,
  returnTo,
}: {
  recurso: Recurso
  categorias: { id: string; nombre: string }[]
  niveles: { id: string; nombre: string }[]
  tipos: { id: string; nombre: string }[]
  related: Recurso[]
  returnTo?: string | null
}) {
  const session = authClient.useSession()
  const { expanded } = useResourceDetails()
  const view = presentResource(
    recurso,
    { categorias, niveles, tipos },
    { isPending: session.isPending, hasUser: Boolean(session.data?.user) },
  )
  const recommendations = relatedResources(recurso, related)
  const backHref = normalizeResourceReturnTo(returnTo)
  const legacyTarget = resourceLegacyTarget(recurso)
  const content = resourceContent(recurso)
  return (
    <div className="resource-experience">
      <div className="resource-navigation">
        <Link className="resource-back" href={backHref}><ArrowLeft size={16} /> Volver a resultados</Link>
        <Breadcrumbs items={view.breadcrumbs} />
      </div>
      {expanded ? (
        <section id="resource-details" className="resource-details-panel" aria-label="Detalles del recurso">
          <div className="resource-details-panel__heading">
            <div>
              <div className="resource-card__top">
                <span className="badge">{view.formatLabel}</span>
                <span className="badge badge--neutral">{view.topicLabel}</span>
                <span className={view.accessState === 'restricted' ? 'badge badge--locked' : 'badge badge--neutral'}>{view.accessLabel}</span>
              </div>
              <h1 className="page-title page-title--sm">{view.title}</h1>
            </div>
            <div className="resource-actions">
              <ExplainResource resourceId={recurso.id} />
              <ShareView />
            </div>
          </div>
          <div className="resource-details-panel__body">
            <p className="page-intro">{view.description}</p>
            <dl className="metadata" aria-label="Información del recurso">
              <div><dt>Nivel</dt><dd>{view.levelLabel}</dd></div>
              <div><dt>Tipo</dt><dd>{view.typeLabel}</dd></div>
              <div><dt>Actualizado</dt><dd>{view.updatedLabel}</dd></div>
              <div><dt>Área</dt><dd>{recurso.area}</dd></div>
            </dl>
          </div>
        </section>
      ) : null}
      {content.kind === 'legacy-pilot' ? (
        <LegacyViewer src={content.src} fallbackHref={content.fallbackHref} title={view.title} />
      ) : content.kind === 'stored' ? (
        <section id="resource-content" aria-label="Contenido del recurso" className="resource-viewer-section">
          <RecursoViewer recurso={recurso} />
        </section>
      ) : (
        <section className="resource-launch" aria-label="Abrir contenido del recurso">
          <p>Este recurso se abre en su visor original.</p>
          {legacyTarget ? <Button render={<a href={legacyTarget} />}>{view.primaryAction} <ExternalLink size={16} /></Button> : null}
        </section>
      )}
      {recommendations.length ? (
        <section className="section">
          <div className="section-head"><h2>También puede interesarte</h2></div>
          <div className="card-grid">{recommendations.map((item) => <ResourceCard key={item.id} recurso={item} />)}</div>
        </section>
      ) : null}
    </div>
  )
}
