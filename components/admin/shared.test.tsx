import { describe, expect, it } from 'vitest'
import { DESTINATION_LABELS, SECTION_LABELS } from './shared'

describe('admin hub labels', () => {
  it('labels cuadernillos while preserving existing section and destination mappings', () => {
    expect(SECTION_LABELS).toEqual({
      explore: 'Exploración',
      reports: 'Reportes',
      maps: 'Mapas',
      dashboards: 'Tableros',
      infrastructure: 'Infraestructura',
      situation: 'Situación',
      cuadernillos: 'Cuadernillos',
    })
    expect(DESTINATION_LABELS['/cuadernillos']).toBe('Cuadernillos')
    expect(DESTINATION_LABELS['/mapas/infraestructura']).toBe('ENOS 2026')
    expect(DESTINATION_LABELS['/problematicas/parte/nuevo']).toBe('Nuevo parte de infraestructura')
  })
})
