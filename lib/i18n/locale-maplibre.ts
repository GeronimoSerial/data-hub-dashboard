import type { Idioma } from './idioma'

// MapLibre control and popup strings per language. The Spanish entry is the
// shipped text (Corrientes); it must not change without a product request.
const LOCALE_MAPLIBRE: Record<Idioma, Record<string, string>> = {
  es: {
    'NavigationControl.ZoomIn': 'Acercar',
    'NavigationControl.ZoomOut': 'Alejar',
    'NavigationControl.ResetBearing': 'Arrastrar para rotar el mapa, clic para reiniciar al norte',
    'Map.Title': 'Mapa',
    'AttributionControl.ToggleAttribution': 'Mostrar u ocultar la atribución',
    'Popup.Close': 'Cerrar',
  },
  pt: {
    'NavigationControl.ZoomIn': 'Aproximar',
    'NavigationControl.ZoomOut': 'Afastar',
    'NavigationControl.ResetBearing': 'Arrastar para girar o mapa, clique para reiniciar ao norte',
    'Map.Title': 'Mapa',
    'AttributionControl.ToggleAttribution': 'Mostrar ou ocultar a atribuição',
    'Popup.Close': 'Fechar',
  },
}

export function localeMaplibre(idioma: Idioma): Record<string, string> {
  return LOCALE_MAPLIBRE[idioma]
}
