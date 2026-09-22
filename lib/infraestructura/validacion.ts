import { CATEGORIA_META, esCategoria, type CategoriaAfectacion } from './categorias'

export const SEVERIDADES = ['Baja', 'Media', 'Alta', 'Crítica'] as const

export type Severidad = (typeof SEVERIDADES)[number]

export type ResolverCategoriaResultado =
  | { ok: true; categoria: CategoriaAfectacion }
  | { ok: false; error: string }

// Única fuente de verdad de la integridad "la categoría la resuelve el
// servidor desde el motivo": el POST llama esta función con los motivos
// vigentes de infra_motivo y persiste la categoría que devuelve, ignorando
// cualquier `categoria` que haya llegado en el body. Si el nombre no está en
// la tabla, 400 "Motivo inválido".
//
// Deduce la categoría a partir del nombre del motivo, que es lo que guarda
// `infra_afectacion.motivo`. Depende del invariante de nombre único que
// impone ensureMotivoNombreUnico() (ver motivos.ts).
//
// Si ese invariante llegara a romperse, esta función falla en vez de elegir
// una de las coincidencias: devolver una categoría arbitraria significaría
// guardar la afectación en la categoría equivocada, o rechazar alumnos
// legítimos con un 400 inexplicable. Un error explícito es preferible a un
// dato silenciosamente mal clasificado.
export function resolverCategoria(
  motivoNombre: string,
  motivos: { nombre: string; categoria: string }[],
): ResolverCategoriaResultado {
  const coincidencias = motivos.filter((m) => m.nombre === motivoNombre)
  if (coincidencias.length > 1) {
    return { ok: false, error: 'Motivo ambiguo: hay más de un motivo con ese nombre' }
  }
  const encontrado = coincidencias[0]
  if (!encontrado || !esCategoria(encontrado.categoria)) {
    return { ok: false, error: 'Motivo inválido' }
  }
  return { ok: true, categoria: encontrado.categoria }
}

// Regla de integridad de §1 de la spec: una categoría con permiteAlumnos
// false (hoy sólo 'establecimiento') nunca puede persistir alumnos, ni
// siquiera si el cliente los manda.
export function validarAlumnosPermitidos(
  categoria: CategoriaAfectacion,
  alumnos: number[] | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!CATEGORIA_META[categoria].permiteAlumnos && (alumnos?.length ?? 0) > 0) {
    return { ok: false, error: 'Esta categoría no admite selección de alumnos' }
  }
  return { ok: true }
}
