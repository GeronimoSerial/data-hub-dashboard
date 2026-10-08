import { claseInundacion } from '@/lib/mapas/accesos-capas'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { COLOR_SIN_AFECTACION } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import type { EscuelaMapaEnriquecida } from './tipos'

export type VistaPlanificacion = 'aisladas' | 'inundacion' | 'historial'
export type NivelPlanificacion = 0 | 1 | 2 | 3

export const VISTAS_PLANIFICACION: VistaPlanificacion[] = ['aisladas', 'inundacion', 'historial']

export const ETIQUETA_VISTA: Record<VistaPlanificacion, string> = {
  aisladas: 'Escuelas aisladas',
  inundacion: 'Inundación',
  historial: 'Historial',
}

export const TITULO_LEYENDA_VISTA: Record<VistaPlanificacion, string> = {
  aisladas: 'Aislamiento',
  inundacion: 'Exposición a inundación',
  historial: 'Veces con situaciones',
}

export const ETIQUETA_NIVEL_PLAN: Record<NivelPlanificacion, string> = {
  0: 'Nulo',
  1: 'Bajo',
  2: 'Medio',
  3: 'Alto',
}

/** Umbrales del historial (cantidad de situaciones): 0 → Nulo, 1–2 → Bajo, 3–4 → Medio, 5 o más → Alto. Ajustables acá. */
export const UMBRALES_HISTORIAL = { bajo: 1, medio: 3, alto: 5 } as const

export function nivelPlanificacion(
  escuela: Pick<EscuelaMapaEnriquecida, 'cueAnexo' | 'situacionesHistoricas'>,
  vista: VistaPlanificacion,
  datos: { territorio: TerritorioMapa | null },
): NivelPlanificacion {
  if (vista === 'historial') {
    if (escuela.situacionesHistoricas >= UMBRALES_HISTORIAL.alto) return 3
    if (escuela.situacionesHistoricas >= UMBRALES_HISTORIAL.medio) return 2
    if (escuela.situacionesHistoricas >= UMBRALES_HISTORIAL.bajo) return 1
    return 0
  }

  if (vista === 'aisladas') {
    const nivel = datos.territorio?.aislamiento?.escuelas[escuela.cueAnexo]?.nivel
    return nivel === 0 || nivel === 1 || nivel === 2 || nivel === 3 ? nivel : 0
  }

  const claseRio = datos.territorio?.susceptibilidad?.escuelas[escuela.cueAnexo]?.claseRio
  switch (claseInundacion(claseRio)) {
    case 'bajo': return 1
    case 'medio': return 2
    case 'alto': return 3
    default: return 0
  }
}

export interface EscuelaPrioridad {
  escuela: EscuelaMapaEnriquecida
  nivel: 1 | 2 | 3
}

export function prioridadPlanificacion(
  escuelas: EscuelaMapaEnriquecida[],
  vista: VistaPlanificacion,
  datos: { territorio: TerritorioMapa | null },
): EscuelaPrioridad[] {
  return escuelas
    .map((escuela) => ({ escuela, nivel: nivelPlanificacion(escuela, vista, datos) }))
    .filter((item): item is EscuelaPrioridad => item.nivel > 0)
    .sort((a, b) => b.nivel - a.nivel
      || (vista === 'historial'
        ? b.escuela.situacionesHistoricas - a.escuela.situacionesHistoricas
        : b.escuela.alumnos - a.escuela.alumnos)
      || a.escuela.nombre.localeCompare(b.escuela.nombre, 'es'))
}

export function textoPrioridad(item: EscuelaPrioridad, vista: VistaPlanificacion): string {
  if (vista !== 'historial') return ETIQUETA_NIVEL_PLAN[item.nivel]
  const cantidad = item.escuela.situacionesHistoricas
  return `${cantidad} ${cantidad === 1 ? 'situación' : 'situaciones'}`
}

export function colorNivelPlan(nivel: NivelPlanificacion): string {
  switch (nivel) {
    case 3: return colorSeveridad('Crítica')
    case 2: return colorSeveridad('Media')
    case 1: return colorSeveridad('Baja')
    case 0: return COLOR_SIN_AFECTACION
  }
}

export function coloresPlanificacion(
  escuelas: EscuelaMapaEnriquecida[],
  vista: VistaPlanificacion,
  datos: { territorio: TerritorioMapa | null },
): Map<string, string> {
  return new Map(escuelas.flatMap((escuela) => {
    const nivel = nivelPlanificacion(escuela, vista, datos)
    return nivel === 0 ? [] : [[escuela.cueAnexo, colorNivelPlan(nivel)] as const]
  }))
}
