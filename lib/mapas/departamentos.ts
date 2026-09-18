// Datos estáticos de los departamentos de la provincia de Corrientes,
// extraídos del prototipo `Alertas_climaticas_educativas_actualizado.html`.
// Módulo puro: sin dependencias de React ni de MapLibre.

/** Ruta pública del GeoJSON con los polígonos de los 25 departamentos. */
export const DEPARTAMENTOS_URL = '/data/departamentos-corrientes.geojson'

// Bounding box de la provincia de Corrientes, calculado recorriendo todas
// las coordenadas de todos los polígonos de
// public/data/departamentos-corrientes.geojson (ver lib/mapas/departamentos.test.ts,
// que verifica que este valor efectivamente contiene todas las coordenadas).
// Se hardcodea porque es un valor fijo del dataset: no vale la pena parsear
// ~43 KB de GeoJSON en runtime sólo para obtener el bbox.
// Formato esperado por MapLibre: [[oesteLon, surLat], [esteLon, norteLat]]
export const LIMITES_CORRIENTES: [[number, number], [number, number]] = [
  [-59.710824, -30.730192],
  [-55.620259, -27.253966],
]

// Mismo bbox, aplanado a [oeste, sur, este, norte]. Se deriva de
// LIMITES_CORRIENTES en vez de repetir los números para que no puedan
// desincronizarse.
export const LIMITES_CORRIENTES_BBOX: [number, number, number, number] = [
  LIMITES_CORRIENTES[0][0],
  LIMITES_CORRIENTES[0][1],
  LIMITES_CORRIENTES[1][0],
  LIMITES_CORRIENTES[1][1],
]

// Máscara: un rectángulo que cubre el mundo con la provincia recortada como
// hueco. Se generó disolviendo los 25 departamentos en un solo contorno y
// restándolo de ese rectángulo (mapshaper: `-dissolve` + `-rectangle` +
// `-erase`), así que su geometría deriva del mismo GeoJSON y no de una fuente
// paralela que pueda desincronizarse.
//
// Reemplaza a encerrar la vista con `maxBounds`: el usuario puede alejarse
// todo lo que quiera, pero fuera de Corrientes no hay nada que mirar.
export const MASCARA_URL = '/data/mascara-corrientes.geojson'

// Blanco a propósito: los tres basemaps disponibles (liberty, bright,
// positron) son estilos claros, así que el lienzo del mapa es claro sin
// importar el tema de la aplicación. La opacidad no llega a 1 para que el
// contexto de alrededor siga insinuándose.
export const MASCARA_COLOR = '#FFFFFF'
export const MASCARA_OPACIDAD = 0.7

/** Colores del estilo de los departamentos, tomados de `estiloDepartamento` en el prototipo. */
export const COLORES_DEPARTAMENTO = {
  bordeNormal: '#4B78A8',
  bordeSeleccionado: '#FACD05',
  rellenoNormal: '#90B4E1',
  rellenoSeleccionado: '#FACD05',
  opacidadRellenoNormal: 0.055,
  opacidadRellenoSeleccionado: 0.18,
  pesoLineaNormal: 1.5,
  pesoLineaSeleccionado: 4,
} as const
