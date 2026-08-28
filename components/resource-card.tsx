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

export function ResourceCard({ recurso }: { recurso: Recurso }) {
  const { niveles, categorias } = useHubData()
  const session = authClient.useSession()
  const target = resourceCardTarget(recurso)
  const href = resourceCardHref(target, {
    isPending: session.isPending,
    hasUser: Boolean(session.data?.user),
  })
  const Icon = ICON[recurso.formato]
  const category = findCategoria(categorias, recurso.categoriaId)
  const accessState = resourceAccessState(recurso, {
    isPending: session.isPending,
    hasUser: Boolean(session.data?.user),
  })
  const content = (
    <>
      <div className="resource-card__top">
        <span className="badge"><Icon size={14} /> {FORMATOS[recurso.formato].label}</span>
        {category ? <span className="badge badge--neutral">{category.nombre}</span> : null}
        {accessState === 'restricted' ? (
          <span className="badge badge--locked"><LockKeyhole size={13} /> Acceso restringido</span>
        ) : (
          <span className="badge badge--neutral">{accessState === 'public' ? 'Público' : 'Ingresar para consultar'}</span>
        )}
      </div>
      <h3>{recurso.titulo}</h3>
      <p>{recurso.descripcion}</p>
      <div className="resource-card__meta"><span>{nivelNombre(niveles, recurso.nivelId)}</span></div>
      <div className="resource-card__footer"><span>{recurso.area}</span><span>Actualizado {formatearFecha(recurso.actualizado)}</span></div>
    </>
  )
  return href ? <Link className="resource-card" href={href}>{content}</Link> : <article className="resource-card">{content}</article>
}