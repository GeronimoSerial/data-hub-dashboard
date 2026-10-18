// Escalas tonales de una sola gama (claro→oscuro), mismo patrón que
// PALETA_SECUENCIAL del mapa de natalidad (main, lib/mapas/natalidad.ts).
// Decisión de producto del usuario (2026-09-28): severidad en rojo, Radar en
// azul — dos dominios distintos, dos hues distintos, nunca semáforo.
export const PALETA_TONAL_SEVERIDAD = {
  Baja: '#fecaca',
  Media: '#f87171',
  Alta: '#dc2626',
  Crítica: '#7f1d1d',
} as const

export const PALETA_TONAL_PELIGRO = {
  verde: '#eff6ff',
  amarillo: '#93c5fd',
  naranja: '#3b82f6',
  rojo: '#1e3a8a',
} as const

// Estado de altura de las estaciones de río (umbrales del organismo). Se
// centralizan acá para que mapa, insignias y leyenda lean el mismo valor.
export const PALETA_ESTADO_ALTURA = {
  evacuacion: '#b91c1c',
  alerta: '#f59e0b',
  normal: '#15803d',
  sin_dato: '#9ca3af',
} as const

// Relleno de la insignia "sin dato": más oscuro que el anillo para que el
// glifo blanco contraste.
export const RELLENO_ESTACION_SIN_DATO = '#6b7280'
