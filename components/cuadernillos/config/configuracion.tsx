'use client'

import { useState } from 'react'
import { CabecerasSection } from './cabeceras-section'
import { MembershipSection } from './membership-section'

type Section = 'cabeceras' | 'membresias'

const SECTIONS: Array<{ value: Section; label: string }> = [
  { value: 'cabeceras', label: 'Cabeceras' },
  { value: 'membresias', label: 'Membresías' },
]

export function Configuracion() {
  const [section, setSection] = useState<Section>('cabeceras')

  return (
    <section aria-label="Configuración" style={{ display: 'grid', gap: '1rem' }}>
      <nav aria-label="Secciones de configuración" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        {SECTIONS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={section === item.value}
            onClick={() => setSection(item.value)}
            className={section === item.value ? 'ui-button ui-button--primary' : 'ui-button ui-button--secondary'}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {section === 'cabeceras' ? <CabecerasSection /> : <MembershipSection />}
    </section>
  )
}
