// Esquema de salida estructurada del veredicto diario asistido por IA (spec §8.2).
// El campo 'factores' de la spec se omite a propósito: la traza ya lleva los
// factores presentes, así que el modelo no necesita devolverlos.
// 'nivel' tampoco va en la salida: lo calcula el código.

import { z } from 'zod'

const esquemaFraseVeredicto = z.object({
  texto: z.string().min(1).max(400),
  refs: z.array(z.string()).max(6),
})

export const esquemaSalidaVeredicto = z.object({
  veredictos: z
    .array(
      z.object({
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ambito: z.string(),
        frases: z.array(esquemaFraseVeredicto).min(2).max(3),
      }),
    )
    .min(1)
    .max(40),
})

export type SalidaVeredictoIA = z.infer<typeof esquemaSalidaVeredicto>
