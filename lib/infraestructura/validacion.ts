import { z } from 'zod'
import { normalizeCue } from './cue'
import { CATEGORIA_META, esCategoria, type CategoriaProblematica } from './categorias'

export const SEVERIDADES = ['Baja', 'Media', 'Alta', 'Crítica'] as const

export type Severidad = (typeof SEVERIDADES)[number]

const HTML_RE = /<[^>]*>/

export const problematicaInputSchema = z.object({
  cue: z
    .string()
    .trim()
    .min(1)
    .refine((v) => normalizeCue(v) !== null, 'CUE inválido'),
  // Sigue siendo el nombre libre (histórico, no FK): el catálogo real vive en
  // infra_motivo (dato con ABM, ver lib/infraestructura/motivos.ts). Que ese
  // nombre exista en la tabla, y qué categoría resuelve, lo valida el POST
  // con resolverCategoria — nunca este schema, que no tiene acceso a la DB.
  motivo: z.string().trim().min(1, 'Motivo requerido'),
  severidad: z.enum(SEVERIDADES),
  descripcion: z
    .string()
    .trim()
    .max(500, 'Descripción demasiado larga')
    .refine((v) => !HTML_RE.test(v), 'La descripción no puede contener HTML')
    .optional(),
  secciones: z
    .array(z.number().int().positive())
    .min(1, 'Debe incluir al menos una sección'),
  // Alumnos seleccionados individualmente (ge_person_id), opcional. Semántica:
  // una sección de `secciones` sin ninguno de sus alumnos presente acá cuenta
  // completa (todos sus alumnos matriculados). Si al menos uno de sus
  // alumnos SÍ aparece acá, esa sección pasa a contar sólo esos alumnos. La
  // pertenencia real (que cada id pertenezca a alguna sección elegida en el
  // corte vigente) la valida el POST, no este schema.
  alumnos: z.array(z.number().int().positive()).optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
})

export type ProblematicaInput = z.infer<typeof problematicaInputSchema>

export type ParseResultado =
  | { ok: true; data: ProblematicaInput }
  | { ok: false; error: string }

export function parseProblematicaInput(body: unknown): ParseResultado {
  const result = problematicaInputSchema.safeParse(body)
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Cuerpo inválido' }
  }
  return { ok: true, data: result.data }
}

export const impactoPreliminarInputSchema = z.object({
  cue: z
    .string()
    .trim()
    .min(1)
    .refine((v) => normalizeCue(v) !== null, 'CUE inválido'),
  secciones: z
    .array(z.number().int().positive())
    .min(1, 'Debe incluir al menos una sección'),
  // Misma semántica que en problematicaInputSchema: opcional, sección sin
  // alumnos acá = sección completa.
  alumnos: z.array(z.number().int().positive()).optional(),
})

export type ImpactoPreliminarInput = z.infer<typeof impactoPreliminarInputSchema>

export function parseImpactoPreliminarInput(
  body: unknown,
): { ok: true; data: ImpactoPreliminarInput } | { ok: false; error: string } {
  const result = impactoPreliminarInputSchema.safeParse(body)
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Cuerpo inválido' }
  }
  return { ok: true, data: result.data }
}

export type ResolverCategoriaResultado =
  | { ok: true; categoria: CategoriaProblematica }
  | { ok: false; error: string }

// Única fuente de verdad de la integridad "la categoría la resuelve el
// servidor desde el motivo": el POST llama esta función con los motivos
// vigentes de infra_motivo y persiste la categoría que devuelve, ignorando
// cualquier `categoria` que haya llegado en el body. Si el nombre no está en
// la tabla, 400 "Motivo inválido".
//
// Deduce la categoría a partir del nombre del motivo, que es lo que guarda
// `infra_problematica.motivo`. Depende del invariante de nombre único que
// impone ensureMotivoNombreUnico() (ver motivos.ts).
//
// Si ese invariante llegara a romperse, esta función falla en vez de elegir
// una de las coincidencias: devolver una categoría arbitraria significaría
// guardar la problemática en la categoría equivocada, o rechazar alumnos
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
  categoria: CategoriaProblematica,
  alumnos: number[] | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!CATEGORIA_META[categoria].permiteAlumnos && (alumnos?.length ?? 0) > 0) {
    return { ok: false, error: 'Esta categoría no admite selección de alumnos' }
  }
  return { ok: true }
}
