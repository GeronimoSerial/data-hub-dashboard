import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { COLOR_SIN_AFECTACION } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'
import type { EscuelaMapaEnriquecida } from './tipos'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

/** `riesgo` es el pronóstico del motor; las demás son vistas estructurales con niveles propios. */
export type VistaPlanificacion = 'riesgo' | 'aisladas' | 'historial'
export type VistaEstructural = Exclude<VistaPlanificacion, 'riesgo'>
export type NivelPlanificacion = 0 | 1 | 2 | 3

export const VISTAS_PLANIFICACION: VistaPlanificacion[] = ['riesgo', 'aisladas', 'historial']
export const VISTAS_ESTRUCTURALES: VistaEstructural[] = ['aisladas', 'historial']
export const VISTA_PLANIFICACION_DEFAULT: VistaPlanificacion = 'riesgo'

export const ETIQUETA_VISTA: Record<VistaPlanificacion, string> = {
  riesgo: 'Riesgo hoy',
  aisladas: 'Aislamiento',
  historial: 'Historial',
}

export const TITULO_LEYENDA_VISTA: Record<VistaEstructural, string> = {
  aisladas: 'Aislamiento',
  historial: 'Veces con situaciones',
}

/** Lee una vista guardada en URL o snapshot. La vieja vista `inundacion` se reemplazó por Riesgo hoy. */
export function parsearVistaPlanificacion(raw: unknown): VistaPlanificacion | null {
  if (raw === 'inundacion') return 'riesgo'
  return typeof raw === 'string' && (VISTAS_PLANIFICACION as readonly string[]).includes(raw)
    ? (raw as VistaPlanificacion)
    : null
}

export const ETIQUETA_NIVEL_PLAN: Record<NivelPlanificacion, string> = {
  0: 'Nulo',
  1: 'Bajo',
  2: 'Medio',
  3: 'Alto',
}

/** Azul del marcador de laguna: anillo sobre el punto de riesgo, o punto propio si no hay clase de río. */
export const COLOR_JUNTO_LAGUNA = '#2563eb'

/** Umbrales del historial (cantidad de situaciones): 0 → Nulo, 1–2 → Bajo, 3–4 → Medio, 5 o más → Alto. Ajustables acá. */
export const UMBRALES_HISTORIAL = { bajo: 1, medio: 3, alto: 5 } as const

export function nivelPlanificacion(
  escuela: Pick<EscuelaMapaEnriquecida, 'cueAnexo' | 'situacionesHistoricas'>,
  vista: VistaEstructural,
  datos: { territorio: TerritorioMapa | null },
): NivelPlanificacion {
  if (vista === 'historial') {
    if (escuela.situacionesHistoricas >= UMBRALES_HISTORIAL.alto) return 3
    if (escuela.situacionesHistoricas >= UMBRALES_HISTORIAL.medio) return 2
    if (escuela.situacionesHistoricas >= UMBRALES_HISTORIAL.bajo) return 1
    return 0
  }

  const nivel = datos.territorio?.aislamiento?.escuelas[escuela.cueAnexo]?.nivel
  // Nulo y Bajo no se dibujan ni se listan: sólo Medio y Alto son escuelas aisladas.
  return nivel === 2 || nivel === 3 ? nivel : 0
}

export interface EscuelaPrioridad {
  escuela: EscuelaMapaEnriquecida
  nivel: NivelPlanificacion
}

export function prioridadPlanificacion(
  escuelas: EscuelaMapaEnriquecida[],
  vista: VistaEstructural,
  datos: { territorio: TerritorioMapa | null },
): EscuelaPrioridad[] {
  return escuelas
    .map((escuela): EscuelaPrioridad => ({
      escuela,
      nivel: nivelPlanificacion(escuela, vista, datos),
    }))
    .filter((item) => item.nivel > 0)
    .sort((a, b) => b.nivel - a.nivel
      || (vista === 'historial'
        ? b.escuela.situacionesHistoricas - a.escuela.situacionesHistoricas
        : b.escuela.alumnos - a.escuela.alumnos)
      || a.escuela.nombre.localeCompare(b.escuela.nombre, 'es'))
}

export function textoPrioridad(item: EscuelaPrioridad, vista: VistaEstructural, t?: Diccionario): string {
  if (vista !== 'historial') return t ? etiquetaNivelPlan(t, item.nivel) : ETIQUETA_NIVEL_PLAN[item.nivel]
  const cantidad = item.escuela.situacionesHistoricas
  if (t) return t.etiquetas.vecesSituaciones(cantidad)
  return `${cantidad} ${cantidad === 1 ? 'situación' : 'situaciones'}`
}

export function colorPrioridad(item: Pick<EscuelaPrioridad, 'nivel'>): string {
  return colorNivelPlan(item.nivel)
}

/** Niveles que la leyenda lista. Aislamiento sólo dibuja Alto y Medio. */
export function nivelesLeyendaPlanificacion(vista: VistaEstructural): readonly NivelPlanificacion[] {
  return vista === 'aisladas' ? [3, 2] : [3, 2, 1, 0]
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
  vista: VistaEstructural,
  datos: { territorio: TerritorioMapa | null },
): Map<string, string> {
  return new Map(escuelas.flatMap((escuela) => {
    const nivel = nivelPlanificacion(escuela, vista, datos)
    return nivel === 0 ? [] : [[escuela.cueAnexo, colorNivelPlan(nivel)] as const]
  }))
}

export function etiquetaNivelPlan(t: Diccionario, nivel: NivelPlanificacion): string {
  const tabla = t.etiquetas.nivelPlan
  return nivel in tabla ? tabla[nivel as keyof typeof tabla] : ETIQUETA_NIVEL_PLAN[nivel]
}

export function tituloLeyendaVista(t: Diccionario, vista: VistaEstructural): string {
  return t.etiquetas.tituloVista[vista]
}
