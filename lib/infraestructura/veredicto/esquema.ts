// Structured output of the AI daily verdict: per day, one provincial headline
// plus one line per department. 'nivel' is never part of the output: rules
// decide it. Rows stored by older prompts are not re-validated; the UI reads
// them through resumen.ts.

import { z } from 'zod'

export const MAX_TITULAR = 140
export const MAX_LINEA_DEPARTAMENTO = 220

const esquemaTitular = z.object({
  texto: z.string().min(1).max(MAX_TITULAR),
  // Generous on purpose: one extra ref must not discard the whole response.
  refs: z.array(z.string()).max(12),
})

const esquemaLinea = z.object({
  ambito: z.string(),
  texto: z.string().min(1).max(MAX_LINEA_DEPARTAMENTO),
  refs: z.array(z.string()).max(12),
})

export const esquemaSalidaVeredicto = z.object({
  dias: z
    .array(
      z.object({
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        titular: esquemaTitular,
        departamentos: z.array(esquemaLinea).max(25),
      }),
    )
    .min(1)
    .max(11),
})

export type SalidaVeredictoIA = z.infer<typeof esquemaSalidaVeredicto>
export type DiaSalidaVeredicto = SalidaVeredictoIA['dias'][number]
/** A citable sentence: the headline or a department line. */
export type FraseVeredicto = { texto: string; refs: string[] }
