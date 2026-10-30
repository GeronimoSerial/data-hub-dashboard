import type { CentroZona, EscuelaV29 } from './tipos'

/** Radio del círculo de zona en km: 20 km de diámetro. */
export const RADIO_ZONA_KM = 10

/** Valor de `zona` de los establecimientos aislados. */
export const ZONA_AISLADO = 'Aislado'

/** Tendencia 2023 vs 2026 de una zona, según el mockup V29. */
export type Tendencia = 'baja' | 'sube' | 'igual' | 'sin'

/** Etiquetas y colores de `trendLabel` y `trendColor` del mockup. */
export const ETIQUETA_TENDENCIA: Record<Tendencia, string> = {
  baja: 'Disminuyó',
  sube: 'Aumentó',
  igual: 'Sin cambio',
  sin: 'Sin comparación',
}

export const COLOR_TENDENCIA: Record<Tendencia, string> = {
  baja: '#F4492E',
  sube: '#719C29',
  igual: '#90B4E1',
  sin: '#8b929b',
}

export interface EstadisticasZona {
  /** Establecimientos de la zona completa recibida. */
  cantidad: number
  matriculaTotal: number
  /** Establecimientos con matrícula registrada en 2023 y 2026. */
  comparables: number
  /** Null cuando no hay comparables: la falta de historia no es cero. */
  matricula2023: number | null
  matricula2026: number | null
  /** Diferencia 2026 - 2023 sobre comparables. Null sin comparables. */
  variacion: number | null
  tendencia: Tendencia
  etiquetaTendencia: string
  colorTendencia: string
}

export interface ZonaConCentro {
  zona: string
  id: number | null
  /** Null cuando la zona tiene miembros pero no figura en los centros. */
  centro: CentroZona | null
  miembros: EscuelaV29[]
  estadisticas: EstadisticasZona
}

const ANIO_BASE = '2023'
const ANIO_ACTUAL = '2026'

const esNumeroFinito = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isFinite(valor)

const sumar = (valores: number[]): number => valores.reduce((total, valor) => total + valor, 0)

export const radioZonaMetros = (): number => RADIO_ZONA_KM * 1000

export const etiquetaDeZona = (id: number): string => `Zona ${id}`

/** Devuelve el número de una etiqueta "Zona N"; null para cualquier otro valor. */
export function idDeZona(zona: string): number | null {
  const coincidencia = /^Zona (\d+)$/.exec(zona)
  return coincidencia ? Number(coincidencia[1]) : null
}

export const esAislado = (escuela: EscuelaV29): boolean => escuela.zona === ZONA_AISLADO

export const contarAislados = (escuelas: EscuelaV29[]): number => escuelas.filter(esAislado).length

/** Agrupa por etiqueta de zona. Excluye aislados y establecimientos sin ubicación. */
export function miembrosPorZona(escuelas: EscuelaV29[]): Map<string, EscuelaV29[]> {
  const porZona = new Map<string, EscuelaV29[]>()
  for (const escuela of escuelas) {
    if (!escuela.zona || esAislado(escuela)) continue
    const miembros = porZona.get(escuela.zona)
    if (miembros) miembros.push(escuela)
    else porZona.set(escuela.zona, [escuela])
  }
  return porZona
}

export function centroDeZona(centros: CentroZona[], zona: string): CentroZona | undefined {
  const id = idDeZona(zona)
  return id === null ? undefined : centros.find((centro) => centro.id === id)
}

function tendenciaDe(comparables: number, matricula2023: number, matricula2026: number): Tendencia {
  if (comparables === 0) return 'sin'
  if (matricula2026 < matricula2023) return 'baja'
  if (matricula2026 > matricula2023) return 'sube'
  return 'igual'
}

/**
 * Estadísticas de una zona completa. Solo cuentan para la tendencia los
 * establecimientos con 2023 y 2026 registrados; el resto no se trata como cero.
 */
export function estadisticasDeZona(miembros: EscuelaV29[]): EstadisticasZona {
  const pares = miembros.flatMap((escuela) => {
    const inicial = escuela.historia[ANIO_BASE]
    const final = escuela.historia[ANIO_ACTUAL]
    return esNumeroFinito(inicial) && esNumeroFinito(final) ? [{ inicial, final }] : []
  })
  const comparables = pares.length
  const matricula2023 = comparables ? sumar(pares.map((par) => par.inicial)) : null
  const matricula2026 = comparables ? sumar(pares.map((par) => par.final)) : null
  const tendencia = tendenciaDe(comparables, matricula2023 ?? 0, matricula2026 ?? 0)

  return {
    cantidad: miembros.length,
    matriculaTotal: sumar(miembros.map((escuela) => escuela.matricula)),
    comparables,
    matricula2023,
    matricula2026,
    variacion: matricula2023 === null || matricula2026 === null ? null : matricula2026 - matricula2023,
    tendencia,
    etiquetaTendencia: ETIQUETA_TENDENCIA[tendencia],
    colorTendencia: COLOR_TENDENCIA[tendencia],
  }
}

/**
 * Todas las zonas de los centros, incluidas las que no tienen miembros, más las
 * zonas con miembros que no figuran en los centros. Pasar siempre el universo
 * completo: el listado filtrado no debe alterar los totales de zona.
 */
export function listarZonas(centros: CentroZona[], escuelas: EscuelaV29[]): ZonaConCentro[] {
  const porZona = miembrosPorZona(escuelas)
  const zonas = new Map<string, ZonaConCentro>()

  const armar = (zona: string, id: number | null, centro: CentroZona | null): ZonaConCentro => {
    const miembros = porZona.get(zona) ?? []
    return { zona, id, centro, miembros, estadisticas: estadisticasDeZona(miembros) }
  }

  for (const centro of centros) {
    const zona = etiquetaDeZona(centro.id)
    zonas.set(zona, armar(zona, centro.id, centro))
  }
  for (const zona of porZona.keys()) {
    if (!zonas.has(zona)) zonas.set(zona, armar(zona, idDeZona(zona), null))
  }

  return [...zonas.values()].sort((a, b) => (a.id ?? Infinity) - (b.id ?? Infinity))
}

/** Clave de tendencia por zona con miembros; es el valor que compara el filtro de tendencia. */
export function tendenciaPorZona(escuelas: EscuelaV29[]): Record<string, string> {
  return Object.fromEntries(
    [...miembrosPorZona(escuelas)].map(([zona, miembros]) => [
      zona,
      estadisticasDeZona(miembros).tendencia,
    ]),
  )
}
