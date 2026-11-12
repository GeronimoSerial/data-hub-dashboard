'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BookletCapability } from '@/lib/cuadernillos/types'
import type { ViewAsCandidate } from '@/lib/cuadernillos/view-as'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { CabeceraHome } from './cabecera/cabecera-home'
import { SupervisorInbox } from './supervisor/supervisor-inbox'
import { PlanningHome } from './planning/planning-home'
import { ViewAsPicker } from './view-as-picker'

const CAPABILITY_LABELS: Record<BookletCapability, string> = {
  planning: 'Planeamiento',
  cabecera: 'Cabecera',
  supervisor: 'Supervisión',
}

// Most specific role first: the default role is the first one the account holds.
const DEFAULT_ORDER: BookletCapability[] = ['cabecera', 'supervisor', 'planning']
// Display order of the role switch.
const DISPLAY_ORDER: BookletCapability[] = ['planning', 'cabecera', 'supervisor']

export type ViewAsTarget = { userId: string; name: string }

export function CuadernillosWorkspace({
  capabilities,
  isAdmin = false,
  viewAs = null,
  viewAsUnavailable = false,
  viewAsCandidates = [],
}: {
  capabilities: BookletCapability[]
  isAdmin?: boolean
  viewAs?: ViewAsTarget | null
  viewAsUnavailable?: boolean
  viewAsCandidates?: ViewAsCandidate[]
}) {
  const viewAsUserId = viewAs?.userId ?? null
  const roles = DISPLAY_ORDER.filter((capability) => capabilities.includes(capability))
  const defaultRole = DEFAULT_ORDER.find((capability) => capabilities.includes(capability)) ?? null
  const [chosenRole, setChosenRole] = useState<BookletCapability | null>(null)
  const activeRole = chosenRole && roles.includes(chosenRole) ? chosenRole : defaultRole
  const readOnly = Boolean(viewAs)

  return (
    <div style={{ maxWidth: '72rem', margin: '0 auto', padding: 'clamp(1.25rem, 4vw, 3rem)', color: 'var(--ink)', display: 'grid', gap: '1.5rem' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-.02em' }}>
          Cuadernillos
        </h1>
        {isAdmin ? <ViewAsPicker candidates={viewAsCandidates} currentUserId={viewAsUserId} /> : null}
      </header>

      {viewAs ? (
        <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', borderLeft: '4px solid var(--marker)', background: 'var(--fill)', padding: '.75rem 1rem', color: 'var(--ink)' }}>
          <span>{`Viendo como ${viewAs.name} (${capabilities.map((capability) => CAPABILITY_LABELS[capability]).join(', ') || 'sin responsabilidades'}) — solo lectura`}</span>
          <Link href="/cuadernillos" className="ui-button ui-button--secondary">Salir</Link>
        </div>
      ) : null}

      {viewAsUnavailable ? (
        <p role="alert" style={{ borderLeft: '4px solid var(--danger-ink)', background: 'var(--fill)', padding: '.75rem 1rem', margin: 0, color: 'var(--danger-ink)' }}>
          No se puede ver como esta cuenta. Puede estar dada de baja o no existir.
        </p>
      ) : null}

      {roles.length === 0 ? (
        <p role="status" style={{ borderLeft: '4px solid var(--marker)', background: 'var(--fill)', padding: '1rem 1.25rem', margin: 0, color: 'var(--ink-soft)' }}>
          Esta cuenta todavía no tiene una responsabilidad de cuadernillos habilitada.
        </p>
      ) : (
        <Tabs value={activeRole} onValueChange={(value) => setChosenRole(value as BookletCapability)} style={{ display: 'grid', gap: '1.5rem' }}>
          {roles.length > 1 ? (
            <TabsList aria-label="Seleccionar responsabilidad" style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
              {roles.map((capability) => (
                <TabsTab key={capability} value={capability} className={activeRole === capability ? 'ui-button ui-button--primary' : 'ui-button ui-button--secondary'}>
                  {CAPABILITY_LABELS[capability]}
                </TabsTab>
              ))}
            </TabsList>
          ) : null}

          {activeRole === 'planning' ? <PlanningHome isAdmin={isAdmin} readOnly={readOnly} viewAsUserId={viewAsUserId} /> : null}
          {activeRole === 'cabecera' ? <CabeceraHome isAdmin={isAdmin} readOnly={readOnly} viewAsUserId={viewAsUserId} /> : null}
          {activeRole === 'supervisor' ? <SupervisorInbox isAdmin={isAdmin} readOnly={readOnly} viewAsUserId={viewAsUserId} /> : null}
        </Tabs>
      )}
    </div>
  )
}
