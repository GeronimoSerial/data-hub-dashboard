'use client'

import { useState } from 'react'
import type { BookletCapability } from '@/lib/cuadernillos/types'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { CabeceraHome } from './cabecera/cabecera-home'
import { SupervisorInbox } from './supervisor/supervisor-inbox'
import { PlanningHome } from './planning/planning-home'
import { KitStyles } from './kit'

const SECTION_LABELS: Record<BookletCapability, string> = {
  planning: 'Planeamiento',
  cabecera: 'Cabecera',
  supervisor: 'Supervisión',
}

// Most specific role first: the default section is the first role the account holds.
const DEFAULT_ORDER: BookletCapability[] = ['cabecera', 'supervisor', 'planning']
// Display order of the top-level tabs.
const DISPLAY_ORDER: BookletCapability[] = ['planning', 'cabecera', 'supervisor']

export function CuadernillosWorkspace({ capabilities }: { capabilities: BookletCapability[] }) {
  const sections = DISPLAY_ORDER.filter((capability) => capabilities.includes(capability))
  const defaultSection = DEFAULT_ORDER.find((capability) => capabilities.includes(capability)) ?? null
  const [chosenSection, setChosenSection] = useState<BookletCapability | null>(null)
  const activeSection = chosenSection && sections.includes(chosenSection) ? chosenSection : defaultSection

  return (
    <div className="cdl-page" style={{ maxWidth: '72rem', width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: 'clamp(1.25rem, 4vw, 3rem)', color: 'var(--ink)', display: 'grid', gap: '1.5rem' }}>
      <KitStyles />
      <header>
        <h1 style={{ margin: 0, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-.02em' }}>
          Cuadernillos
        </h1>
      </header>

      {sections.length === 0 ? (
        <p role="status" style={{ borderLeft: '4px solid var(--marker)', background: 'var(--fill)', padding: '1rem 1.25rem', margin: 0, color: 'var(--ink-soft)' }}>
          Esta cuenta todavía no tiene una responsabilidad de cuadernillos habilitada.
        </p>
      ) : (
        <Tabs value={activeSection ?? undefined} onValueChange={(value) => setChosenSection(value as BookletCapability)} style={{ display: 'grid', gap: '1.5rem' }}>
          {sections.length > 1 ? (
            <TabsList aria-label="Seleccionar sección" style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
              {sections.map((section) => (
                <TabsTab key={section} value={section} className={activeSection === section ? 'ui-button ui-button--primary' : 'ui-button ui-button--secondary'}>
                  {SECTION_LABELS[section]}
                </TabsTab>
              ))}
            </TabsList>
          ) : null}

          {activeSection === 'planning' ? <PlanningHome /> : null}
          {activeSection === 'cabecera' ? <CabeceraHome /> : null}
          {activeSection === 'supervisor' ? <SupervisorInbox /> : null}
        </Tabs>
      )}
    </div>
  )
}
