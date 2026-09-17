import { z } from 'zod'
import { normalizeCue } from './cue'

export const MOTIVOS = [
  'Inundación',
  'Anegamiento',
  'Tormenta severa',
  'Acceso interrumpido',
  'Sin energía o agua',
  'Evacuación preventiva',
  'Otro',
] as const

export const SEVERIDADES = ['Baja', 'Media', 'Alta', 'Crítica'] as const

export type Motivo = (typeof MOTIVOS)[number]
export type Severidad = (typeof SEVERIDADES)[number]

const HTML_RE = /<[^>]*>/

export const problematicaInputSchema = z.object({
  cue: z
    .string()
    .trim()
    .min(1)
    .refine((v) => normalizeCue(v) !== null, 'CUE inválido'),
  motivo: z.enum(MOTIVOS),
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
