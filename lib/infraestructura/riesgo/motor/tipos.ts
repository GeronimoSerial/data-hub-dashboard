// Contratos Zod/TS de salida del motor v0 (E3b). Compartidos entre el núcleo
// puro (motor/calculo.ts), el job de persistencia y las APIs de lectura.
import { z } from 'zod'
import type { HorizontePeligro } from './puertos'

export const nivelRiesgoSchema = z.enum(['bajo', 'moderado', 'alto', 'muy_alto'])
export type NivelRiesgo = z.infer<typeof nivelRiesgoSchema>

export const confianzaSchema = z.enum(['baja', 'media', 'alta'])
export type Confianza = z.infer<typeof confianzaSchema>

// Cada factor reconstruye una parte del score: sumar factor.contribucion de
// un mismo `tipo` reproduce el sub-score de esa dimensión (aceptación
// "factores reconstruyen el score").
export const factorRiesgoSchema = z.object({
  tipo: z.enum(['amenaza', 'vulnerabilidad', 'exposicion', 'urgencia']),
  fuente: z.string(),
  variable: z.string(),
  valor: z.number().nullable(),
  unidad: z.string().nullable(),
  contribucion: z.number(),
  peso: z.number(),
  explicacion: z.string(),
  observadoEn: z.string().nullable(),
})
export type FactorRiesgo = z.infer<typeof factorRiesgoSchema>

// Resultado de evaluar una escuela para un horizonte. `evidenciaValida` en
// false significa que no hay evidencia de amenaza para este horizonte (ni
// peligro, ni caudal, ni lluvia observada): el llamador (job) no debe
// publicar este horizonte como snapshot ("Horizontes 24/72/240 sólo con
// evidencia válida").
export interface ResultadoRiesgoEscuela {
  cueAnexo: string
  horizonteHoras: HorizontePeligro
  evidenciaValida: boolean
  scoreRiesgo: number | null
  nivelRiesgo: NivelRiesgo | null
  scoreAmenaza: number | null
  scoreVulnerabilidad: number | null
  confianza: Confianza
  factores: FactorRiesgo[]
  // Prioridad operativa: dimensiones aparte del IRO, nunca mezcladas en el
  // score (decisión N1 fija). No tienen nivel bajo/alto propio en v0, sólo
  // se persisten como factores tipo 'exposicion'/'urgencia' informativos.
  exposicion: { matricula: number | null; secciones: number | null }
  urgenciaVerificacion: { horasDesdeUltimaVerificacion: number | null }
  modeloVersion: string
  calculadoEn: string
  validoHasta: string
}
