// Contratos Zod para los payloads de la trayectoria de situaciones
// hidrometeorológicas (spec §7, §8, §9, §10, §11, §12). Mismo estilo que
// problematicaInputSchema en validacion.ts: validación de forma únicamente,
// server-side. Lo que no puede resolver un schema sin acceso a la base
// (existencia real de un motivo, pertenencia de un alumno a una sección, el
// corte vigente) lo valida el route handler (batch 3), igual que ya hace
// POST /api/problematicas con resolverCategoria.
//
// INVARIANTE PRESERVADO (CONTRACT.md): la categoría se resuelve en el
// servidor a partir del nombre del motivo (resolverCategoria, validacion.ts).
// Ningún schema de este archivo acepta un campo `categoria` del cliente.
import { z } from 'zod'
import { normalizeCue } from './cue'
import { SEVERIDADES } from './validacion'

const HTML_RE = /<[^>]*>/

// Mismo formato que VigenciaFieldProps (components/infraestructura/vigencia-field.tsx):
// siempre un ISO 8601 completo, el mismo que produce `new Date().toISOString()`.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/

const rigeDesdeSchema = z
  .string()
  .trim()
  .refine((v) => ISO_DATETIME_RE.test(v) && !Number.isNaN(new Date(v).getTime()), 'Fecha inválida')

const descripcionSchema = z
  .string()
  .trim()
  .max(500, 'Descripción demasiado larga')
  .refine((v) => !HTML_RE.test(v), 'La descripción no puede contener HTML')

const cueSchema = z
  .string()
  .trim()
  .min(1)
  .refine((v) => normalizeCue(v) !== null, 'CUE inválido')

// Deben coincidir exactamente con EstadoEstablecimiento / ServicioEstado en
// trayectoria-tipos.ts. No se importan esos tipos porque Zod necesita los
// valores en tiempo de ejecución, no sólo el tipo.
const ESTADOS_ESTABLECIMIENTO = ['habitual', 'evacuado', 'centro_evacuados'] as const
const ESTADOS_SERVICIO = ['normal', 'suspendido'] as const

// --- Afectaciones (spec §9) ---

export const afectacionNuevaInputSchema = z.object({
  motivo: z.string().trim().min(1, 'Motivo requerido'),
  severidad: z.enum(SEVERIDADES),
  descripcion: descripcionSchema.optional(),
  secciones: z.array(z.number().int().positive()).min(1, 'Debe incluir al menos una sección'),
  // Misma semántica que en problematicaInputSchema: sección sin alumnos acá =
  // sección completa.
  alumnos: z.array(z.number().int().positive()).optional(),
})

export type AfectacionNuevaInput = z.infer<typeof afectacionNuevaInputSchema>

// Edición de una afectación existente (spec §8: "modificar una afectación
// existente", "cambiar la severidad... sin modificar las demás"). Todo
// opcional salvo `id`: el director puede guardar un cambio que sólo toca uno
// de estos aspectos.
export const afectacionModificacionInputSchema = z.object({
  id: z.string().trim().min(1, 'Falta el identificador de la afectación'),
  severidad: z.enum(SEVERIDADES).optional(),
  descripcion: descripcionSchema.optional(),
  secciones: z.array(z.number().int().positive()).optional(),
  alumnos: z.array(z.number().int().positive()).optional(),
})

export type AfectacionModificacionInput = z.infer<typeof afectacionModificacionInputSchema>

// --- Servicio educativo (spec §10) ---

export const servicioAlcanceInputSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('establecimiento') }),
  z.object({
    tipo: z.literal('turno'),
    turnos: z.array(z.string().trim().min(1)).min(1, 'Debe incluir al menos un turno'),
  }),
  z.object({
    tipo: z.literal('seccion'),
    secciones: z.array(z.number().int().positive()).min(1, 'Debe incluir al menos una sección'),
  }),
])

export type ServicioAlcanceInput = z.infer<typeof servicioAlcanceInputSchema>

export const servicioEducativoInputSchema = z.object({
  estado: z.enum(ESTADOS_SERVICIO),
  alcance: servicioAlcanceInputSchema,
})

export type ServicioEducativoInput = z.infer<typeof servicioEducativoInputSchema>

// --- Situación del establecimiento (spec §11) ---

export const estadoEstablecimientoInputSchema = z.object({
  estado: z.enum(ESTADOS_ESTABLECIMIENTO),
})

export type EstadoEstablecimientoInput = z.infer<typeof estadoEstablecimientoInputSchema>

// --- Payload del parte (reporte inicial y actualización, spec §7 y §8) ---
//
// Un único `rigeDesde` para todo el envío: la spec muestra un solo control
// de vigencia por pantalla (§12, §13 "Rige desde el 18 de septiembre a las
// 10:30" es una sola línea para todos los cambios del envío), no uno por
// afectación.
//
// El refine final impone del lado del servidor la misma regla que la UI
// aplica deshabilitando el botón de guardado (spec §17: "Todavía no realizó
// cambios en el parte actual"): un envío sin ningún cambio no es válido.
export const parteActualizacionInputSchema = z
  .object({
    cue: cueSchema,
    idempotencyKey: z.string().trim().min(1).max(200),
    rigeDesde: rigeDesdeSchema,
    afectacionesNuevas: z.array(afectacionNuevaInputSchema).default([]),
    afectacionesModificadas: z.array(afectacionModificacionInputSchema).default([]),
    // IDs de afectaciones vigentes a retirar (soft delete, spec §8 "retirar
    // una afectación existente").
    afectacionesRetiradas: z.array(z.string().trim().min(1)).default([]),
    servicioEducativo: servicioEducativoInputSchema.optional(),
    estadoEstablecimiento: estadoEstablecimientoInputSchema.optional(),
  })
  .refine(
    (data) =>
      data.afectacionesNuevas.length > 0 ||
      data.afectacionesModificadas.length > 0 ||
      data.afectacionesRetiradas.length > 0 ||
      data.servicioEducativo !== undefined ||
      data.estadoEstablecimiento !== undefined,
    { message: 'Todavía no realizó cambios en el parte actual' },
  )

export type ParteActualizacionInput = z.infer<typeof parteActualizacionInputSchema>

export type ParseParteResultado =
  | { ok: true; data: ParteActualizacionInput }
  | { ok: false; error: string }

export function parseParteActualizacionInput(body: unknown): ParseParteResultado {
  const result = parteActualizacionInputSchema.safeParse(body)
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Cuerpo inválido' }
  }
  return { ok: true, data: result.data }
}
