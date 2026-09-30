// Esquema de salida estructurada del briefing asistido por IA (E8).
// 'refs' son los IDs de MetricaAutorizada que la frase cita; se validan luego
// contra la lista blanca para comprobar trazabilidad. El LLM nunca debe
// inventar cifras: toda cifra mencionada debe provenir de una métrica citada
// en 'refs', y este esquema sólo garantiza la forma, no la veracidad.

import { z } from 'zod'

export const esquemaSalidaBriefingIA = z.object({
  frases: z
    .array(
      z.object({
        texto: z.string().min(1).max(400),
        refs: z.array(z.string()).max(6),
      }),
    )
    .min(1)
    .max(6),
})

export type SalidaBriefingIA = z.infer<typeof esquemaSalidaBriefingIA>
