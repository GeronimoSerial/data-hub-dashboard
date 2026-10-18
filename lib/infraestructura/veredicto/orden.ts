// Deterministic ordering of department verdicts: most to least severe. Shared
// by the prompt input (so the model writes lines in this order), the modal and
// the public page. Client-safe: no node imports.
import { CENTROIDES_DEPARTAMENTOS_CORRIENTES } from '@/lib/mapas/departamento-centroides'
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'

/** Citable impact metric ids per department (see impacto.ts). */
export const ID_IMPACTO = {
  situacionesAbiertas: 'escuelas.situaciones_abiertas',
  escuelasSinClases: 'escuelas.sin_clases',
  alumnosSinClases: 'alumnos.sin_clases',
  asistenciaPedagogica: 'escuelas.asistencia_pedagogica',
  escuelasAisladas: 'acceso.escuelas_aisladas',
  escuelasAccesoRiesgo: 'acceso.escuelas_en_riesgo',
  radarAlto: 'radar.escuelas_riesgo_alto',
} as const

type ClaveImpacto = keyof typeof ID_IMPACTO
export type Impacto = Record<ClaveImpacto, number>

type MetricaOrden = { id: string; valor: unknown }
export type ItemOrden = { ambito: string; nivel: string; metricas: MetricaOrden[] }

const SEVERIDAD: Record<string, number> = {
  severo: 4,
  alerta: 3,
  vigilancia: 2,
  sin_senal: 1,
  sin_dato: 0,
}

/** Impact tie-breakers, in priority order. */
const DESEMPATE: ClaveImpacto[] = [
  'escuelasSinClases',
  'alumnosSinClases',
  'situacionesAbiertas',
  'escuelasAisladas',
  'escuelasAccesoRiesgo',
  'radarAlto',
  'asistenciaPedagogica',
]

export function severidadNivel(nivel: string): number {
  return SEVERIDAD[nivel] ?? 0
}

export function impactoDe(metricas: MetricaOrden[]): Impacto {
  const valor = (id: string): number => {
    const v = metricas.find((m) => m.id === id)?.valor
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return Object.fromEntries(
    (Object.keys(ID_IMPACTO) as ClaveImpacto[]).map((clave) => [clave, valor(ID_IMPACTO[clave])]),
  ) as Impacto
}

/**
 * Figures that alone make a quiet department news. Access risk is excluded on
 * purpose: it is high in most departments during a flood and would leave no
 * department "without news"; it is still described when there is other news.
 */
const CLAVES_NOVEDAD: ClaveImpacto[] = [
  'situacionesAbiertas',
  'escuelasSinClases',
  'alumnosSinClases',
  'asistenciaPedagogica',
  'radarAlto',
]

export function impactoEsNovedad(impacto: Impacto): boolean {
  return CLAVES_NOVEDAD.some((clave) => impacto[clave] > 0)
}

/** A department has news when the rules raised its level or schools are affected. */
export function tieneNovedad(item: ItemOrden): boolean {
  if (severidadNivel(item.nivel) >= SEVERIDAD.vigilancia) return true
  return impactoEsNovedad(impactoDe(item.metricas))
}

function comparar(a: ItemOrden, b: ItemOrden): number {
  const porNivel = severidadNivel(b.nivel) - severidadNivel(a.nivel)
  if (porNivel !== 0) return porNivel
  const ia = impactoDe(a.metricas)
  const ib = impactoDe(b.metricas)
  for (const clave of DESEMPATE) {
    const diferencia = ib[clave] - ia[clave]
    if (diferencia !== 0) return diferencia
  }
  return a.ambito.localeCompare(b.ambito, 'es')
}

export function ordenarPorSeveridad<T extends ItemOrden>(items: T[]): T[] {
  return [...items].sort(comparar)
}

const PREFIJO = 'departamento:'

/** Display names of the departments without news, alphabetical. */
export function departamentosSinNovedad(items: ItemOrden[]): string[] {
  const conNovedad = new Set(
    items
      .filter((i) => i.ambito.startsWith(PREFIJO) && tieneNovedad(i))
      .map((i) => normalizarNombreDepartamento(i.ambito.slice(PREFIJO.length))),
  )
  return CENTROIDES_DEPARTAMENTOS_CORRIENTES.map((c) => c.departamento)
    .filter((nombre) => !conNovedad.has(normalizarNombreDepartamento(nombre)))
    .sort((a, b) => a.localeCompare(b, 'es'))
}
