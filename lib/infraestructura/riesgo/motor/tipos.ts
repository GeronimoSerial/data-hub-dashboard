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
  tipo: z.enum(['amenaza', 'vulnerabilidad', 'acceso', 'exposicion', 'urgencia']),
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

// Dimensión aparte "riesgo de acceso": combina aislamiento OSM, peligro del
// horizonte y accesos interrumpidos confirmados. NUNCA se mezcla en el IRO
// compuesto (scoreRiesgo/scoreVulnerabilidad); se calcula y persiste como el
// resto de dimensiones separadas. Ver motor/riesgo-acceso.ts.
export interface RiesgoAcceso {
  score: number | null
  nivel: 'bajo' | 'moderado' | 'alto' | null
  confianza: Confianza
  explicacion: string
}

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
  // Amenaza sola (0..100) y su nivel con el MISMO mapeo que nivelRiesgo. Se
  // exponen aparte para que una amenaza alta no desaparezca cuando la
  // vulnerabilidad es 0 (scoreRiesgo = amenaza x vulnerabilidad / 100).
  nivelAmenaza: NivelRiesgo | null
  scoreVulnerabilidad: number | null
  confianza: Confianza
  factores: FactorRiesgo[]
  // Prioridad operativa: dimensiones aparte del IRO, nunca mezcladas en el
  // score (decisión N1 fija). No tienen nivel bajo/alto propio en v0, sólo
  // se persisten como factores tipo 'exposicion'/'urgencia' informativos.
  exposicion: { matricula: number | null; secciones: number | null }
  urgenciaVerificacion: { horasDesdeUltimaVerificacion: number | null }
  // Riesgo de acceso: dimensión aparte, nunca mezclada en el IRO compuesto.
  // A diferencia de exposicion/urgencia, SÍ tiene nivel propio ('bajo' |
  // 'moderado' | 'alto' | null) y confianza propia. Se persiste además como
  // factor informativo tipo 'acceso'.
  riesgoAcceso: RiesgoAcceso
  modeloVersion: string
  calculadoEn: string
  validoHasta: string
}

// Evidencia probabilística del río (motor v0.4, T8) para UN horizonte: P de
// superación del terreno con cota principal y conservadora. `principal` null
// = no estimable → el cálculo usa el factor río de v0.3 sin cambios.
export interface EvidenciaRioProbabilistica {
  principal: number | null
  conservador: number | null
  ventanaHoras: HorizontePeligro
  metodo: string
  version: string
  diagnostico?: Record<string, number | string | boolean | null>
  // Reglas v0.4 (F3): escenario "si se mantiene esta tendencia" en el sitio
  // (nivel por transferencia km con h0 de Prefectura + tendencia + onda) contra
  // la cota conservadora. Sólo decide si aplica el piso observado.
  tendencia?: { alcanza: boolean; nivelSitioM: number; cotaM: number; subidaM: number } | null
}
