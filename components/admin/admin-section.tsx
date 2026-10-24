'use client'

import { useHubData } from '@/components/hub-data'

export function AdminSection({
  title,
  intro,
  group,
  note,
  children,
}: {
  group?: string
  title: string
  intro: string
  note?: React.ReactNode
  children: React.ReactNode
}) {
  const { writeError } = useHubData()
  return (
    <div className="admin-page">
      <header className="admin-page__header">
        {group ? <p className="admin-page__trail">Administración <span aria-hidden>/</span> {group}</p> : null}
        <h1>{title}</h1>
        <p className="page-intro">{intro}</p>
      </header>
      {note ? <div className="ui-messagebar ui-messagebar--info"><span>{note}</span></div> : null}
      {writeError ? (
        <div className="ui-messagebar ui-messagebar--error" role="alert">
          {writeError}
        </div>
      ) : null}
      {children}
    </div>
  )
}

export const TAXONOMY_NOTE =
  'Las taxonomías en uso no pueden eliminarse para preservar la integridad de los recursos.'
