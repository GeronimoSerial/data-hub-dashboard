'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BookletCapability } from '@/lib/cuadernillos/types'
import type { ViewAsCandidate } from '@/lib/cuadernillos/view-as'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { CabeceraHome } from './cabecera/cabecera-home'
import { SupervisorInbox } from './supervisor/supervisor-inbox'
import { PlanningHome } from './planning/planning-home'
import { ResponsiveStyles } from './planning/responsive-styles'
import { Configuracion } from './config/configuracion'
import { ViewAsPicker } from './view-as-picker'

type Section = BookletCapability | 'configuracion'

const SECTION_LABELS: Record<Section, string> = {
  planning: 'Planeamiento',
  cabecera: 'Cabecera',
  supervisor: 'Supervisión',
  configuracion: 'Configuración',
}

// Most specific role first: the default role is the first one the account holds.
const DEFAULT_ORDER: BookletCapability[] = ['cabecera', 'supervisor', 'planning']
// Admins land on the planning home, where the planning work is.
const ADMIN_DEFAULT_ORDER: BookletCapability[] = ['planning', 'cabecera', 'supervisor']
// Display order of the top-level tabs.
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
  const readOnly = Boolean(viewAs)
  // Configuration is an admin-only tab and is never reachable while viewing as another account.
  const showConfiguracion = isAdmin && !readOnly
  const sections: Section[] = [
    ...DISPLAY_ORDER.filter((capability) => capabilities.includes(capability)),
    ...(showConfiguracion ? ['configuracion' as const] : []),
  ]
  const defaultOrder = isAdmin ? ADMIN_DEFAULT_ORDER : DEFAULT_ORDER
  const defaultSection: Section | null = defaultOrder.find((capability) => capabilities.includes(capability))
    ?? (showConfiguracion ? 'configuracion' : null)
  const [chosenSection, setChosenSection] = useState<Section | null>(null)
  const activeSection = chosenSection && sections.includes(chosenSection) ? chosenSection : defaultSection

  return (
    <div className="cdl-page" style={{ maxWidth: '72rem', width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: 'clamp(1.25rem, 4vw, 3rem)', color: 'var(--ink)', display: 'grid', gap: '1.5rem' }}>
      <ResponsiveStyles />
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <h1 style={{ margin: 0, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-.02em' }}>
          Cuadernillos
        </h1>
        {isAdmin && !readOnly ? <ViewAsPicker candidates={viewAsCandidates} currentUserId={viewAsUserId} /> : null}
      </header>

      {viewAs ? (
        <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', borderLeft: '4px solid var(--marker)', background: 'var(--fill)', padding: '.75rem 1rem', color: 'var(--ink)' }}>
          <span>{`Viendo como ${viewAs.name} (${capabilities.map((capability) => SECTION_LABELS[capability]).join(', ') || 'sin responsabilidades'}) — solo lectura`}</span>
          <Link href="/cuadernillos" className="ui-button ui-button--secondary">Salir</Link>
        </div>
      ) : null}

      {viewAsUnavailable ? (
        <p role="alert" style={{ borderLeft: '4px solid var(--danger-ink)', background: 'var(--fill)', padding: '.75rem 1rem', margin: 0, color: 'var(--danger-ink)' }}>
          No se puede ver como esta cuenta. Puede estar dada de baja o no existir.
        </p>
      ) : null}

      {sections.length === 0 ? (
        <p role="status" style={{ borderLeft: '4px solid var(--marker)', background: 'var(--fill)', padding: '1rem 1.25rem', margin: 0, color: 'var(--ink-soft)' }}>
          Esta cuenta todavía no tiene una responsabilidad de cuadernillos habilitada.
        </p>
      ) : (
        <Tabs value={activeSection ?? undefined} onValueChange={(value) => setChosenSection(value as Section)} style={{ display: 'grid', gap: '1.5rem' }}>
          {sections.length > 1 ? (
            <TabsList aria-label="Seleccionar sección" style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
              {sections.map((section) => (
                <TabsTab key={section} value={section} className={activeSection === section ? 'ui-button ui-button--primary' : 'ui-button ui-button--secondary'}>
                  {SECTION_LABELS[section]}
                </TabsTab>
              ))}
            </TabsList>
          ) : null}

          {activeSection === 'planning' ? <PlanningHome readOnly={readOnly} viewAsUserId={viewAsUserId} /> : null}
          {activeSection === 'cabecera' ? <CabeceraHome isAdmin={isAdmin} readOnly={readOnly} viewAsUserId={viewAsUserId} /> : null}
          {activeSection === 'supervisor' ? <SupervisorInbox isAdmin={isAdmin} readOnly={readOnly} viewAsUserId={viewAsUserId} /> : null}
          {activeSection === 'configuracion' ? <Configuracion /> : null}
        </Tabs>
      )}
    </div>
  )
}
