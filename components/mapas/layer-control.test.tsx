import { describe, expect, it } from 'vitest'
import { CAPAS_ACCESOS_LABELS, CAPAS_RADAR_LABELS } from './layer-control'

describe('etiquetas de capas', () => {
  it('usa nombres accesibles para las capas territoriales y distingue el riesgo pronosticado', () => {
    const etiquetasAcceso = Object.values(CAPAS_ACCESOS_LABELS)

    for (const etiqueta of etiquetasAcceso) {
      expect(etiqueta).not.toMatch(/OSM|physrisk|período de retorno/i)
    }
    expect(CAPAS_RADAR_LABELS['riesgo-acceso']).toContain('pronosticado')
  })
})
