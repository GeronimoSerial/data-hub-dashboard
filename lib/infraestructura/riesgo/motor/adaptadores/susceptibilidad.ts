// Adapter real de PuertoSusceptibilidad sobre la tabla G1
// infra_susceptibilidad_estatica (ver lib/db/schema.ts). Reemplaza al stub
// "no disponible".
//
// Estrategia de carga: MISMA que el adapter de aislamiento — UNA sola query
// batch a toda la tabla, agrupada en memoria por cueAnexo y memoizada en un
// Map dentro del closure (lazy, en la primera llamada a obtenerIndicadores).
// Nunca un SELECT por cueAnexo.
//
// Elección de fila: primero se toma la ÚLTIMA versión por cueAnexo (mayor
// `importadoEn`; empate => mayor `versionJob`) y, si esa versión tiene varias
// filas por distintos períodos de retorno, se prioriza el de MAYOR
// `periodoRetornoAnios`: es el escenario más conservador (evento más extremo).
//
// Contrato: null es "sin evidencia", nunca un catálogo vacío ni un valor
// neutro. Un peligro con valor null NO entra al Record (no se imputa 0); si
// los cuatro peligros vienen null, se devuelve null completo. Nunca lanza.
// Tampoco lanza si la tabla no existe todavía o la query falla: se degrada a
// "sin cobertura" (Map vacío) con un console.error, en vez de propagar la
// excepción.
import { getDb } from '@/lib/db'
import { infraSusceptibilidadEstatica } from '@/lib/db/schema'
import type { IndicadoresSusceptibilidad, PuertoSusceptibilidad } from '../puertos'

export type FilaSusceptibilidadEstatica = typeof infraSusceptibilidadEstatica.$inferSelect

export interface OpcionesAdapterSusceptibilidad {
  // Punto de inyección sólo para tests: por defecto consulta la DB real.
  cargarFilas?: () => Promise<FilaSusceptibilidadEstatica[]>
  // Reglas v0.4 (F1): informar además la profundidad fluvial JRC RP100 (m).
  conProfundidadFluvial?: boolean
}

// Claves del Record alineadas con el catálogo/CSV de G1 (snake_case).
const CAMPOS_PELIGRO = [
  'peligro_inundacion_fluvial',
  'peligro_inundacion_pluvial',
  'peligro_viento',
  'peligro_calor',
] as const

type CampoPeligro = (typeof CAMPOS_PELIGRO)[number]

function valorDeCampo(fila: FilaSusceptibilidadEstatica, campo: CampoPeligro): number | null {
  switch (campo) {
    case 'peligro_inundacion_fluvial':
      return fila.peligroInundacionFluvial
    case 'peligro_inundacion_pluvial':
      return fila.peligroInundacionPluvial
    case 'peligro_viento':
      return fila.peligroViento
    case 'peligro_calor':
      return fila.peligroCalor
  }
}

// Compara `versionJob` como número cuando AMBOS son numéricos (el job de G1
// emite versiones como '1', '2', ... y '10' debe ser mayor que '9', no menor
// como daría la comparación lexicográfica); si alguno no es numérico (p. ej.
// 'v1'), cae a comparación lexicográfica.
function compararVersionJob(a: string, b: string): number {
  const na = a.trim() === '' ? Number.NaN : Number(a)
  const nb = b.trim() === '' ? Number.NaN : Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    if (na !== nb) return na - nb
    return 0
  }
  return a > b ? 1 : a < b ? -1 : 0
}

// Compara dos filas por versión: `importadoEn` (numérico) y, ante empate,
// `versionJob`. Devuelve >0 si `candidata` es más nueva que `actual`.
function compararVersion(
  candidata: FilaSusceptibilidadEstatica,
  actual: FilaSusceptibilidadEstatica,
): number {
  const msCandidata = Date.parse(candidata.importadoEn)
  const msActual = Date.parse(actual.importadoEn)
  if (msCandidata !== msActual) return msCandidata - msActual
  return compararVersionJob(candidata.versionJob, actual.versionJob)
}

// Última versión por cueAnexo y, dentro de ella, mayor período de retorno
// (exportado para test unitario del criterio).
export function ultimaFilaConservadoraPorCue(
  filas: readonly FilaSusceptibilidadEstatica[],
): Map<string, FilaSusceptibilidadEstatica> {
  const porCue = new Map<string, FilaSusceptibilidadEstatica>()
  for (const fila of filas) {
    const actual = porCue.get(fila.cueAnexo)
    if (actual === undefined) {
      porCue.set(fila.cueAnexo, fila)
      continue
    }
    const comparacion = compararVersion(fila, actual)
    if (comparacion > 0) {
      porCue.set(fila.cueAnexo, fila)
    } else if (comparacion === 0 && fila.periodoRetornoAnios > actual.periodoRetornoAnios) {
      porCue.set(fila.cueAnexo, fila)
    }
  }
  return porCue
}

export function crearAdapterSusceptibilidad(
  opciones: OpcionesAdapterSusceptibilidad = {},
): PuertoSusceptibilidad {
  const cargarFilas =
    opciones.cargarFilas ?? (() => getDb().select().from(infraSusceptibilidadEstatica))
  let cache: Promise<Map<string, FilaSusceptibilidadEstatica>> | null = null

  function cargar(): Promise<Map<string, FilaSusceptibilidadEstatica>> {
    if (cache === null) {
      cache = Promise.resolve(cargarFilas())
        .then((filas) => ultimaFilaConservadoraPorCue(filas))
        .catch((error) => {
          console.error(
            'crearAdapterSusceptibilidad: fallo al cargar infra_susceptibilidad_estatica, se degrada a sin cobertura',
            error,
          )
          return new Map<string, FilaSusceptibilidadEstatica>()
        })
    }
    return cache
  }

  return {
    async obtenerIndicadores(cueAnexo: string): Promise<IndicadoresSusceptibilidad | null> {
      const porCue = await cargar()
      const fila = porCue.get(cueAnexo)
      if (fila === undefined) return null

      const indicadores: Record<string, number> = {}
      for (const campo of CAMPOS_PELIGRO) {
        const valor = valorDeCampo(fila, campo)
        if (valor !== null) indicadores[campo] = valor
      }
      if (opciones.conProfundidadFluvial) {
        const profundidadFluvialRp100M = fila.profundidadRp100M ?? null
        if (Object.keys(indicadores).length === 0 && profundidadFluvialRp100M === null) return null
        return { cueAnexo, indicadores, version: fila.versionJob, profundidadFluvialRp100M }
      }
      // Catálogo vacío = sin evidencia (mismo camino que null, ver T-H3).
      if (Object.keys(indicadores).length === 0) return null

      return { cueAnexo, indicadores, version: fila.versionJob }
    },
  }
}
