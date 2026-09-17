import { z } from 'zod'
import { normalizeCue } from './cue'
import { MOTIVOS, SEVERIDADES } from './validacion'

// Esquema propio del alta administrativa: no hay idempotencyKey porque acá no
// existe el escenario que la motiva (un director reintentando el envío desde
// el celular sin sesión). El alta la dispara un click autenticado y, si la
// conexión falla, la ruta simplemente se reintenta a mano.
const HTML_RE = /<[^>]*>/

export const problematicaAdminInputSchema = z.object({
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
})

export type ProblematicaAdminInput = z.infer<typeof problematicaAdminInputSchema>

export type ParseResultadoAdmin =
  | { ok: true; data: ProblematicaAdminInput }
  | { ok: false; error: string }

export function parseProblematicaAdminInput(body: unknown): ParseResultadoAdmin {
  const result = problematicaAdminInputSchema.safeParse(body)
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Cuerpo inválido' }
  }
  return { ok: true, data: result.data }
}
