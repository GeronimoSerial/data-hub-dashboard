// Contratos del mapa. Los valores, geometrías y catálogos viven en la DB.
export const DATASETS_REFERENCIA = {
  'tramos-prefectura': { nombre: 'Tramos aprobados de ríos', formato: 'array', clave: 'tramoId' },
  'localidades-riberenas-dudosas': { nombre: 'Localidades ribereñas pendientes de revisión', formato: 'array', clave: 'localidad' },
  'puntos-rio': { nombre: 'Puntos de consulta de caudal', formato: 'array', clave: 'id' },
  departamentos: { nombre: 'Departamentos de Corrientes', formato: 'features', clave: 'properties.id' },
  mascara: { nombre: 'Máscara provincial', formato: 'features', clave: '' },
  localidades: { nombre: 'Localidades del mapa', formato: 'features', clave: '' },
  localizaciones: { nombre: 'Localizaciones escolares', formato: 'array', clave: 'cueAnexo' },
  'eventos-inundaciones': { nombre: 'Eventos públicos de inundación', formato: 'features', clave: 'properties.id_evento' },
  'registro-eventos': { nombre: 'Registro de eventos públicos', formato: 'array', clave: 'id_evento' },
  'evidencias-inundaciones': { nombre: 'Evidencias de eventos públicos', formato: 'array', clave: 'id_evidencia' },
  'gazetteer-osm': { nombre: 'Lugares OSM curados', formato: 'lugares', clave: '' },
  'georef-departamentos': { nombre: 'Nombres oficiales de departamentos', formato: 'departamentos', clave: 'id' },
  'cabeceras-departamentales': { nombre: 'Cabeceras departamentales', formato: 'cabeceras', clave: 'departamento' },
  'localidades-urbanas': { nombre: 'Localidades urbanas', formato: 'localidades', clave: '' },
  'estaciones-prefectura': { nombre: 'Estaciones hidrométricas', formato: 'array', clave: 'estacionId' },
  'estacoes-ana': { nombre: 'Estações hidrométricas (ANA)', formato: 'array', clave: 'estacionId' },
  'estaciones-synop': { nombre: 'Estaciones de lluvia', formato: 'array', clave: 'wmo' },
} as const

export type DatasetReferencia = keyof typeof DATASETS_REFERENCIA
export type FormatoDataset = 'array' | 'features' | 'lugares' | 'departamentos' | 'cabeceras' | 'localidades'
export function esDatasetReferencia(id: string): id is DatasetReferencia {
  return Object.hasOwn(DATASETS_REFERENCIA, id)
}
