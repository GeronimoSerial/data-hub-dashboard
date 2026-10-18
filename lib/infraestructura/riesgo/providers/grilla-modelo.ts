// Deduplicación de consultas por punto de grilla del modelo (cuota Open-Meteo,
// C1). Las celdas del motor son de 0,1° (`celdaDeCoordenada`), pero ECMWF IFS
// en Open-Meteo (`/v1/ecmwf` y el ensemble `ecmwf_ifs025`) es una grilla de
// 0,25°: varias celdas caen en el mismo punto y reciben la MISMA serie. Pedir
// cada celda por separado gastaba ~3 veces el cupo (387 celdas, 130 puntos).
//
// Regla verificada el 2026-10-18 contra la API pública (fixture
// `__fixtures__/grilla-ifs025-celdas-prod-2026-10-18.json`): Open-Meteo usa el
// punto de 0,25° más cercano, salvo cuando `cell_selection=land` (default)
// descarta ese punto por agua o elevación y elige un vecino. En producción eso
// pasa con 2 de 387 celdas, junto al embalse de Yacyretá; quedan en
// `EXCEPCIONES_PUNTO_GRILLA`. Para las celdas del mismo punto, precipitación,
// CAPE, ráfagas, viento y los 51 miembros del ensemble fueron idénticos; la
// temperatura difiere hasta 0,1 °C por la corrección de elevación propia de
// cada coordenada.
//
// Guarda en ejecución: la respuesta trae el punto usado (`latitude`,
// `longitude`). Si el del representante no coincide con la clave esperada, su
// serie sólo se usa para él y los demás miembros se consultan por separado.

const GRADOS_GRILLA_IFS025 = 0.25
const TOLERANCIA_GRADOS = 0.01

/** Celdas que Open-Meteo ubica en un punto distinto del más cercano (ver cabecera). */
const EXCEPCIONES_PUNTO_GRILLA: Readonly<Record<string, string>> = {
  '-27.6_-56.4': '-27.75_-56.5',
  '-27.5_-56.6': '-27.5_-56.75',
}

export type CeldaGrilla = { geometryRef: string; lat: number; lon: number }

/**
 * Un grupo de celdas que comparten punto de grilla. `celdas[0]` es el
 * representante que se consulta. `clave: null` marca una consulta individual
 * (sin verificación ni réplica).
 */
export type GrupoPuntoGrilla<T extends CeldaGrilla> = { clave: string | null; celdas: T[] }

function redondearAGrilla(valor: number): number {
  return Math.round(valor / GRADOS_GRILLA_IFS025) * GRADOS_GRILLA_IFS025
}

/** Punto de grilla (formato "lat_lon", p. ej. "-27.5_-58.75") que Open-Meteo usa para la celda. */
export function clavePuntoGrilla(celda: CeldaGrilla): string {
  const excepcion = EXCEPCIONES_PUNTO_GRILLA[celda.geometryRef]
  if (excepcion) return excepcion
  return `${redondearAGrilla(celda.lat)}_${redondearAGrilla(celda.lon)}`
}

/** Agrupa por punto de grilla conservando el orden de primera aparición. */
export function agruparPorPuntoGrilla<T extends CeldaGrilla>(celdas: readonly T[]): GrupoPuntoGrilla<T>[] {
  const porClave = new Map<string, GrupoPuntoGrilla<T>>()
  for (const celda of celdas) {
    const clave = clavePuntoGrilla(celda)
    const grupo = porClave.get(clave)
    if (grupo) grupo.celdas.push(celda)
    else porClave.set(clave, { clave, celdas: [celda] })
  }
  return [...porClave.values()]
}

/**
 * `true` si el punto devuelto coincide con la clave, `false` si no, `null`
 * si no hay con qué comparar (consulta individual o respuesta sin lat/lon).
 */
export function respuestaEnPuntoGrilla(
  clave: string | null,
  elemento: { latitude?: number; longitude?: number },
): boolean | null {
  if (clave === null) return null
  if (typeof elemento.latitude !== 'number' || typeof elemento.longitude !== 'number') return null
  const [lat, lon] = clave.split('_').map(Number)
  return (
    Math.abs(elemento.latitude - lat) < TOLERANCIA_GRADOS && Math.abs(elemento.longitude - lon) < TOLERANCIA_GRADOS
  )
}

/**
 * Celdas que reciben la respuesta del representante. Si el punto devuelto no
 * es el esperado, sólo el representante; el caller reencola al resto.
 */
export function destinoDeRespuesta<T extends CeldaGrilla>(
  grupo: GrupoPuntoGrilla<T>,
  elemento: { latitude?: number; longitude?: number },
): { destino: T[]; reencolar: boolean } {
  if (respuestaEnPuntoGrilla(grupo.clave, elemento) === false && grupo.celdas.length > 1) {
    return { destino: [grupo.celdas[0]], reencolar: true }
  }
  return { destino: grupo.celdas, reencolar: false }
}

function partirEnLotes<T>(items: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano))
  return lotes
}

/**
 * Cola de lotes de hasta `tamanoLote` puntos de grilla (un request cada uno).
 * Los miembros reencolados se consultan al final, de a uno por ubicación.
 */
export function crearColaLotesPorPuntoGrilla<T extends CeldaGrilla>(celdas: readonly T[], tamanoLote: number) {
  const lotes = partirEnLotes(agruparPorPuntoGrilla(celdas), tamanoLote)
  const reencolados: GrupoPuntoGrilla<T>[] = []
  return {
    siguiente(): GrupoPuntoGrilla<T>[] | undefined {
      if (lotes.length === 0 && reencolados.length > 0) lotes.push(...partirEnLotes(reencolados.splice(0), tamanoLote))
      return lotes.shift()
    },
    reencolarMiembros(grupo: GrupoPuntoGrilla<T>): void {
      for (const celda of grupo.celdas.slice(1)) reencolados.push({ clave: null, celdas: [celda] })
    },
    /** Saca de la cola y devuelve las celdas que todavía no se consultaron. */
    vaciar(): T[] {
      const grupos = [...lotes.splice(0).flat(), ...reencolados.splice(0)]
      return grupos.flatMap((grupo) => grupo.celdas)
    },
  }
}

/**
 * Parte `geometryRefs` ("lat_lon") en tandas de hasta `maxPuntos` puntos de
 * grilla sin partir un punto entre tandas, para que el provider deduplique
 * cada punto dentro de una sola llamada. Una ref no parseable cuenta como un
 * punto propio y llega igual al provider, que la reporta como inválida.
 */
export function empaquetarRefsPorPuntoGrilla(geometryRefs: readonly string[], maxPuntos: number): string[][] {
  const porClave = new Map<string, string[]>()
  for (const geometryRef of geometryRefs) {
    const [lat, lon] = geometryRef.split('_').map(Number)
    const clave =
      Number.isFinite(lat) && Number.isFinite(lon) ? clavePuntoGrilla({ geometryRef, lat, lon }) : `ref:${geometryRef}`
    const refs = porClave.get(clave)
    if (refs) refs.push(geometryRef)
    else porClave.set(clave, [geometryRef])
  }
  return partirEnLotes([...porClave.values()], maxPuntos).map((tanda) => tanda.flat())
}
