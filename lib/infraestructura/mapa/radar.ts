import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { COLOR_SIN_AFECTACION } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'
import type { EscuelaMapaEnriquecida } from './tipos'

export type HorizonteMotor = 24 | 72 | 240
export type NivelRiesgo = 'muy_alto' | 'alto' | 'moderado' | 'bajo'

// Lenguaje llano para explicar el riesgo: la amenaza es el clima previsto y la
// vulnerabilidad, qué tan expuesta está la escuela (antecedentes y terreno).
export const ETIQUETA_NIVEL_CLIMA: Record<NivelRiesgo, string> = {
  muy_alto: 'muy fuerte',
  alto: 'fuerte',
  moderado: 'moderado',
  bajo: 'leve',
}

export const ETIQUETA_NIVEL_VULNERABILIDAD: Record<NivelRiesgo, string> = {
  muy_alto: 'muy alta',
  alto: 'alta',
  moderado: 'moderada',
  bajo: 'baja',
}

export const ETIQUETA_NIVEL_RIESGO: Record<NivelRiesgo, string> = {
  muy_alto: 'Muy alto',
  alto: 'Alto',
  moderado: 'Moderado',
  bajo: 'Bajo',
}

export const ETIQUETA_HORIZONTE_MOTOR: Record<HorizonteMotor, string> = {
  24: '24 h',
  72: '72 h',
  240: '10 días',
}

const ORDEN_RIESGO: Record<NivelRiesgo, number> = {
  muy_alto: 0,
  alto: 1,
  moderado: 2,
  bajo: 3,
}

export function nivelRiesgo(valor: string | null): NivelRiesgo | null {
  if (valor === 'muy_alto' || valor === 'alto' || valor === 'moderado' || valor === 'bajo') {
    return valor
  }
  return null
}

export interface EscuelaEnRiesgo {
  escuela: EscuelaMapaEnriquecida
  nivel: NivelRiesgo
}

export function escuelasPorRiesgo(
  puntos: ReadonlyArray<{ cueAnexo: string; horizonteHoras: number; nivelRiesgo: string | null }>,
  escuelas: EscuelaMapaEnriquecida[],
  horizonte: HorizonteMotor,
): EscuelaEnRiesgo[] {
  const porCue = new Map(escuelas.map((escuela) => [escuela.cueAnexo, escuela]))
  const resultado: EscuelaEnRiesgo[] = []
  const cuesIncluidos = new Set<string>()

  for (const punto of puntos) {
    if (punto.horizonteHoras !== horizonte || cuesIncluidos.has(punto.cueAnexo)) continue
    const escuela = porCue.get(punto.cueAnexo)
    const nivel = nivelRiesgo(punto.nivelRiesgo)
    if (!escuela || !nivel) continue
    cuesIncluidos.add(punto.cueAnexo)
    resultado.push({ escuela, nivel })
  }

  return resultado.sort((a, b) =>
    ORDEN_RIESGO[a.nivel] - ORDEN_RIESGO[b.nivel]
    || b.escuela.alumnos - a.escuela.alumnos
    || a.escuela.nombre.localeCompare(b.escuela.nombre, 'es'),
  )
}

export interface ResumenRiesgo {
  escuelas: number
  alumnos: number
  porNivel: Record<Exclude<NivelRiesgo, 'bajo'>, number>
}

// Cuenta desde riesgo moderado: es el mismo umbral que pinta la capa del mapa.
export function resumirRiesgo(lista: EscuelaEnRiesgo[]): ResumenRiesgo {
  const porNivel = { muy_alto: 0, alto: 0, moderado: 0 }
  let escuelas = 0
  let alumnos = 0
  for (const { escuela, nivel } of lista) {
    if (nivel === 'bajo') continue
    porNivel[nivel] += 1
    escuelas += 1
    alumnos += escuela.alumnos
  }
  return { escuelas, alumnos, porNivel }
}

export function colorRiesgo(nivel: NivelRiesgo): string {
  switch (nivel) {
    case 'muy_alto': return colorSeveridad('Crítica')
    case 'alto': return colorSeveridad('Alta')
    case 'moderado': return colorSeveridad('Baja')
    case 'bajo': return COLOR_SIN_AFECTACION
  }
}

type PuntoRadar = {
  cueAnexo: string
  horizonteHoras: number
  nivelRiesgo: string | null
  nivelAmenaza?: string | null
  nivelVulnerabilidad?: string | null
}

export interface EscuelaEnRadar extends EscuelaEnRiesgo {
  /** Amenaza en el horizonte elegido; null = sin dato. */
  amenaza: NivelRiesgo | null
  /** Vulnerabilidad de la escuela en el horizonte elegido; null = sin dato. */
  vulnerabilidad: NivelRiesgo | null
}

/**
 * Escuelas que muestra el radar (lista del panel y capa del mapa): prioridad
 * moderada o más, o amenaza alta o muy alta aunque la prioridad sea baja (la
 * prioridad atenúa la amenaza y la ocultaría). Conserva el orden de
 * `escuelasPorRiesgo`, así esas escuelas quedan al final.
 */
export function escuelasEnRadar(
  puntos: ReadonlyArray<PuntoRadar>,
  escuelas: EscuelaMapaEnriquecida[],
  horizonte: HorizonteMotor,
): EscuelaEnRadar[] {
  const puntoPorCue = new Map(
    puntos
      .filter((punto) => punto.horizonteHoras === horizonte)
      .map((punto) => [punto.cueAnexo, punto]),
  )
  return escuelasPorRiesgo(puntos, escuelas, horizonte)
    .map((item) => {
      const punto = puntoPorCue.get(item.escuela.cueAnexo)
      return {
        ...item,
        amenaza: nivelRiesgo(punto?.nivelAmenaza ?? null),
        vulnerabilidad: nivelRiesgo(punto?.nivelVulnerabilidad ?? null),
      }
    })
    .filter(({ nivel, amenaza }) => nivel !== 'bajo' || amenaza === 'alto' || amenaza === 'muy_alto')
}

/**
 * Color de cada escuela visible en la capa radar: siempre el de su riesgo
 * actual (el mismo nivel que encabeza la ficha), nunca un color que la
 * contradiga. El mapa colorea sólo riesgo moderado o más; el resto es un punto tenue (`puntosRadarVisibles`).
 */
export function coloresRadar(
  puntos: ReadonlyArray<PuntoRadar>,
  escuelas: EscuelaMapaEnriquecida[],
  horizonte: HorizonteMotor,
): Map<string, string> {
  return new Map(escuelasEnRadar(puntos, escuelas, horizonte)
    .map(({ escuela, nivel }) => [escuela.cueAnexo, colorRiesgo(nivel)]))
}
