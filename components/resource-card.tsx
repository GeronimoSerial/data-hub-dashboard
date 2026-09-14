'use client'

import Link from 'next/link'
import { BarChart3, FileText, LockKeyhole, Map } from 'lucide-react'
import type { Recurso } from '@/lib/model'
import { FORMATOS, categoria as findCategoria, formatearFecha, nivelNombre } from '@/lib/model'
import { resourceAccessState } from '@/lib/resource-presentation'
import { useHubData } from '@/components/hub-data'
import { authClient } from '@/lib/auth-client'
import { resourceCardHref, resourceCardTarget } from '@/lib/resource-href'

const ICON = { reporte: FileText, tablero: BarChart3, mapa: Map }

export function ResourceCard({
  recurso,
  returnTo,
  onNavigate,
}: {
  recurso: Recurso
  returnTo?: string
  onNavigate?: () => void
}) {
  const { niveles, categorias } = useHubData()
  const session = authClient.useSession()
  const target = resourceCardTarget(recurso)
  const href = resourceCardHref(target, {
    isPending: session.isPending,
    hasUser: Boolean(session.data?.user),
  }, returnTo)
  const Icon = ICON[recurso.formato]
  const category = findCategoria(categorias, recurso.categoriaId)
  const accessState = resourceAccessState(recurso, {
    isPending: session.isPending,
    hasUser: Boolean(session.data?.user),
  })
  const content = (
    <>
      <div className="resource-card__top">
        <span className="badge"><Icon size={13} /> {FORMATOS[recurso.formato].label}</span>
        {category ? <span className="badge badge--neutral">{category.nombre}</span> : null}
      </div>
      <h3>{recurso.titulo}</h3>
      <p>{recurso.descripcion}</p>
      <div className="resource-card__footer">
        <span>{nivelNombre(niveles, recurso.nivelId)} · {recurso.area}</span>
        <span>
          {formatearFecha(recurso.actualizado)}
          {accessState !== 'public' ? (
            <span className="resource-card__access">
              <LockKeyhole size={11} />
              {accessState === 'restricted' ? 'Restringido' : 'Requiere ingreso'}
            </span>
          ) : null}
        </span>
      </div>
    </>
  )
  return href ? (
    <Link className="resource-card" data-formato={recurso.formato} data-resource-id={recurso.id} href={href} onClick={onNavigate}>{content}</Link>
  ) : (
    <article className="resource-card" data-formato={recurso.formato} data-resource-id={recurso.id}>{content}</article>
  )
}
