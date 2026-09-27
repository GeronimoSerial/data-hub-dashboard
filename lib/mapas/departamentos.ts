// Datos estáticos de los departamentos de la provincia de Corrientes,
// extraídos del prototipo `Alertas_climaticas_educativas_actualizado.html`.
// Módulo puro: sin dependencias de React ni de MapLibre.
import { normalizarNombreDepartamento } from './normalizar-departamento'

/**
 * Ruta pública del GeoJSON con los polígonos de los 25 departamentos.
 *
 * Fuente: Georef Argentina (IGN), descarga masiva de
 * https://infra.datos.gob.ar/georef/departamentos.geojson, filtrada a los 25
 * departamentos de Corrientes (provincia id 18) y versionada en el repo el
 * 2026-09-27. Reemplaza al prototipo no oficial
 * `public/data/departamentos-corrientes.geojson`, que se conserva sin usarse
 * por si algo más lo referencia en el futuro.
 */
export const DEPARTAMENTOS_URL = '/data/departamentos-corrientes-georef-2026-09-27.geojson'

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

// ── Normalización de nombre de departamento ─────────────────────────────────
//
// Implementación compartida en lib/mapas/normalizar-departamento.ts (usada
// también por lib/mapas/georef-departamentos.ts y
// lib/infraestructura/riesgo/geo-perfil.ts). Se re-exporta acá para no tocar
// ningún import existente de este módulo.
export { normalizarNombreDepartamento }

/** Una escuela con servicio caído (suspendido o parcial), a los fines de la agregación departamental. */
export interface EscuelaServicioCaido {
  departamento: string
  servicio: 'normal' | 'parcial' | 'suspendido'
}

export interface AgregacionDepartamentos {
  // Clave = nombre de departamento NORMALIZADO (ver normalizarNombreDepartamento).
  // Se arma sobre esa clave, no sobre el nombre "de exhibición", porque el
  // consumidor (el fill-opacity del coroplético) matchea contra los nombres
  // del GeoJSON, también normalizados.
  escuelasCaidasPorDepartamento: Map<string, number>
  // Departamentos de origen (tal cual figuran en la base, sin normalizar) que
  // no matchearon ningún departamento del GeoJSON. Nunca se descartan en
  // silencio: el llamador decide cómo hacerlos visibles (loguear, mostrar en
  // la leyenda).
  departamentosSinMatch: string[]
}

// Cruza escuelas con servicio caído contra los departamentos conocidos
// (los del GeoJSON) para contar cuántas hay por departamento. Normaliza AMBOS
// lados del join (el nombre que trae la escuela y los nombres conocidos),
// porque el gotcha de arriba puede aparecer en cualquiera de los dos: hoy es
// la base la que tiene la inconsistencia, pero nada garantiza que el GeoJSON
// nunca la tenga.
export function agregarEscuelasCaidasPorDepartamento(
  escuelas: EscuelaServicioCaido[],
  nombresDepartamentosConocidos: string[],
): AgregacionDepartamentos {
  const conocidos = new Set(nombresDepartamentosConocidos.map(normalizarNombreDepartamento))
  const escuelasCaidasPorDepartamento = new Map<string, number>()
  const departamentosSinMatchVistos = new Set<string>()

  for (const escuela of escuelas) {
    if (escuela.servicio !== 'suspendido' && escuela.servicio !== 'parcial') continue

    const clave = normalizarNombreDepartamento(escuela.departamento)
    if (!conocidos.has(clave)) {
      departamentosSinMatchVistos.add(escuela.departamento)
      continue
    }

    escuelasCaidasPorDepartamento.set(clave, (escuelasCaidasPorDepartamento.get(clave) ?? 0) + 1)
  }

  return {
    escuelasCaidasPorDepartamento,
    departamentosSinMatch: [...departamentosSinMatchVistos],
  }
}
