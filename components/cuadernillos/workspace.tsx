'use client'

import { useState } from 'react'
import type { BookletCapability } from '@/lib/cuadernillos/types'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { CabeceraHome } from './cabecera/cabecera-home'
import { ControlView } from './control/control-view'
import { PlanningHome } from './planning/planning-home'
import { KitStyles } from './kit'

const SECTION_LABELS: Record<BookletCapability, string> = {
  planning: 'Enviar cuadernillos',
  cabecera: 'Recibir y repartir',
  supervisor: 'Revisar envíos',
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
    <div className="cdl-page" data-wide={activeSection === 'planning' || undefined}>
      <KitStyles />
      <h1 className="cdl-eyebrow">Cuadernillos</h1>

      {sections.length === 0 ? (
        <p role="status" style={{ borderLeft: '4px solid var(--marker)', background: 'var(--fill)', padding: '1rem 1.25rem', margin: 0, color: 'var(--ink-soft)' }}>
          Tu cuenta todavía no tiene acceso a cuadernillos. Pedile acceso a un administrador.
        </p>
      ) : (
        <Tabs value={activeSection ?? undefined} onValueChange={(value) => setChosenSection(value as BookletCapability)} className="cdl-sections">
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
          {activeSection === 'supervisor' ? <ControlView /> : null}
        </Tabs>
      )}
    </div>
  )
}
