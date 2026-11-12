import { describe, expect, it } from 'vitest'
import { localeMaplibre } from './locale-maplibre'

describe('localeMaplibre', () => {
  it('returns the exact shipped Spanish MapLibre strings for es', () => {
    expect(localeMaplibre('es')).toEqual({
      'NavigationControl.ZoomIn': 'Acercar',
      'NavigationControl.ZoomOut': 'Alejar',
      'NavigationControl.ResetBearing': 'Arrastrar para rotar el mapa, clic para reiniciar al norte',
      'Map.Title': 'Mapa',
      'AttributionControl.ToggleAttribution': 'Mostrar u ocultar la atribución',
      'Popup.Close': 'Cerrar',
    })
  })

  it('returns Portuguese strings for pt with the same keys', () => {
    const pt = localeMaplibre('pt')
    expect(Object.keys(pt)).toEqual(Object.keys(localeMaplibre('es')))
    expect(pt['NavigationControl.ZoomIn']).toBe('Aproximar')
    expect(pt['Popup.Close']).toBe('Fechar')
  })
})
