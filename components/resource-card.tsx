'use client'

import Link from 'next/link'
import { BarChart3, FileText, LockKeyhole, Map } from 'lucide-react'
import type { Recurso } from '@/lib/model'
import type { Diccionario } from '@/lib/i18n'
import { categoria as findCategoria, formatearFecha, nivelNombre } from '@/lib/model'
import { resourceAccessState } from '@/lib/resource-presentation'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { useHubData } from '@/components/hub-data'
import { authClient } from '@/lib/auth-client'
import { resourceCardHref, resourceCardTarget } from '@/lib/resource-href'
import { ArchivoMetadata } from '@/components/archivo-metadata'
import { esRutaExterna } from '@/lib/ruta-externa'

const ICON = { reporte: FileText, tablero: BarChart3, mapa: Map }

/** Enlaces a otro despliegue salen a una pestaña nueva, sin pasar referrer. */
function enlaceExterno(href: string) {
  return esRutaExterna(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {}
}

/** Lock/href derivados del `recurso.acceso` calculado por el servidor
 *  (lib/acl.ts marcarAcceso). Evita depender de la sesión del cliente para
 *  decidir el candado: el servidor ya renderiza el mismo resultado que el
 *  cliente vería después de hidratar, así que no hay mismatch. */
function fromAcceso(acceso: NonNullable<Recurso['acceso']>, target: string | null, tc: Diccionario['shellHub']['catalogo']) {
  if (acceso === 'abrir') {
    return { href: target, bloqueado: false, lockLabel: null as string | null }
  }
  if (acceso === 'ingresar') {
    return {
      href: resourceCardHref(target, { isPending: false, hasUser: false }),
      bloqueado: false,
      lockLabel: tc.requiereIngreso,
    }
  }
  return { href: null, bloqueado: true, lockLabel: tc.accesoRestringido }
}

export function ResourceCard({ recurso }: { recurso: Recurso }) {
  const { niveles, categorias } = useHubData()
  const tc = useTextos().shellHub.catalogo
  const session = authClient.useSession()
  const target = resourceCardTarget(recurso)
  const hasUser = Boolean(session.data?.user)

  const { href, bloqueado, lockLabel } = recurso.acceso
    ? fromAcceso(recurso.acceso, target, tc)
    : (() => {
        const accessState = resourceAccessState(recurso, {
          isPending: session.isPending,
          hasUser,
        })
        return {
          href: resourceCardHref(target, { isPending: session.isPending, hasUser }),
          bloqueado: false,
          lockLabel:
            accessState !== 'public'
              ? accessState === 'restricted'
                ? tc.restringido
                : tc.requiereIngreso
              : null,
        }
      })()

  const Icon = ICON[recurso.formato]
  const category = findCategoria(categorias, recurso.categoriaId)
  const content = (
    <>
      <div className="resource-card__top">
        <span className="badge"><Icon size={13} /> {tc.formatos[recurso.formato].label}</span>
        {category ? <span className="badge badge--neutral">{category.nombre}</span> : null}
      </div>
      <h3>{recurso.titulo}</h3>
      <p>{recurso.descripcion}</p>
      <div className="resource-card__footer">
        <span>{nivelNombre(niveles, recurso.nivelId)} · {recurso.area}</span>
        <span>
          {formatearFecha(recurso.actualizado)}
          {lockLabel ? (
            <span className="resource-card__access">
              <LockKeyhole size={11} />
              {lockLabel}
            </span>
          ) : null}
        </span>
      </div>
    </>
  )
  if (bloqueado) {
    return (
      <article
        className="resource-card resource-card--bloqueado"
        data-formato={recurso.formato}
        role="group"
        aria-disabled="true"
      >
        {content}
        <ArchivoMetadata recurso={recurso} />
      </article>
    )
  }
  return href ? (
    recurso.storageKey && recurso.mime === 'text/html' ? (
      <article className="resource-card" data-formato={recurso.formato}>
        <Link href={href}>{content}</Link>
        <ArchivoMetadata recurso={recurso} />
      </article>
    ) : <Link className="resource-card" data-formato={recurso.formato} href={href} {...enlaceExterno(href)}>{content}</Link>
  ) : (
    <article className="resource-card" data-formato={recurso.formato}>{content}<ArchivoMetadata recurso={recurso} /></article>
  )
}
