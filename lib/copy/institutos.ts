// Textos del parte para institutos superiores. Los textos de escuela viven en
// sus componentes y no cambian: cada punto de uso elige con `esInstituto`.
// Las constantes en español salen del diccionario `parteComunTextos`; las
// pantallas en portugués leen ese diccionario con `useTextos()`.
import type { CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import type { Severidad } from '@/lib/infraestructura/validacion'
import { parteComunTextosEs } from '@/lib/i18n/diccionarios/grupos/parteComunTextos.es'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

export const DESCRIPCION_CATEGORIA_INSTITUTO: Record<CategoriaAfectacion, string> = parteComunTextosEs.institutoCategoria.descripcion

export const CONFIRMAR_CATEGORIA_INSTITUTO: Record<CategoriaAfectacion, string> = parteComunTextosEs.institutoCategoria.confirmar

export const CRITERIO_SEVERIDAD_INSTITUTO: Record<CategoriaAfectacion, Record<Severidad, string>> = parteComunTextosEs.criterioSeveridadInstituto

export const MENSAJE_GUARDADO_INSTITUTO = parteComunTextosEs.guardadoInstituto

/** Mensaje de guardado de instituto en el idioma `t` (por defecto español). */
export function mensajeGuardadoInstituto(t: Diccionario = es): string {
  return t.parteComunTextos.guardadoInstituto
}
