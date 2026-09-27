// Contratos Zod/TS del replay temporal de solo lectura (batch E7b).
//
// Un replay pregunta "¿qué se sabía en el instante t?" y devuelve un CUADRO
// (frame) por cada paso temporal entre `desde` y `hasta`. Hay dos vistas
// estrictamente separadas:
//
// - "conocido": usa sólo filas cuya fecha de REGISTRO/INGESTA <= instante t
//   (infraAfectacion.creadaEn, infraRiskSnapshot.calculadoEn,
//   infraRiskRun.publicadoEn). Responde "qué había cargado al sistema en t".
// - "reconstruido": usa fecha de VIGENCIA/DECISIÓN (infraAfectacion.rigeDesde
//   / retiradaEn), ignorando cuándo se cargó. Responde "qué regía en t según
//   el dato corregido a posteriori".
//
// Este archivo es puro (sólo Zod): define formas compartidas para que el motor
// de consulta (consulta.ts), los route handlers y los fixtures hablen el mismo
// idioma. No hace I/O ni toca la base.

import { z } from 'zod'

// Cadencia por defecto del eje temporal, en horas. El dataset de replay usa
// bloques de 6 h; no es una resolución de modelo, es cuántas veces "rebobina"
// el replay entre dos instantes.
export const PASO_REPLAY_HORAS_DEFAULT = 6

// Vistas del replay. No son intercambiables: una afectación cargada tarde
// aparece en "reconstruido" y no en "conocido" (y viceversa, una corrección
// que se retira retroactivamente). Mezclarlas sería exactamente la fuga que el
// replay existe para evitar.
export const vistaReplaySchema = z.enum(['conocido', 'reconstruido'])

export type VistaReplay = z.infer<typeof vistaReplaySchema>

// Unidad territorial soportada. Hoy sólo 'departamento'; queda como literal
// (no enum abierto) para que ampliar a 'cuenca' sea una decisión explícita.
export const territorioReplaySchema = z.literal('departamento')

export type TerritorioReplay = z.infer<typeof territorioReplaySchema>

// Datetime ISO 8601 en UTC, mismo criterio que lib/infraestructura/riesgo/
// tipos.ts: `offset: false` exige la marca de zona 'Z' y rechaza strings sin
// zona o con offset no nulo. Comparar instantes con `>` / `<` sobre estos
// strings es correcto porque todos comparten el mismo formato y zona.
export const instanteReplaySchema = z.iso.datetime({ offset: false })

export type InstanteReplay = z.infer<typeof instanteReplaySchema>

// Parámetros de consulta. La identificación del alcance es una de dos:
// - episodioDerivadoId (atajo: el episodio ya resuelve territorio + ventana),
// - o el trío territorioId + desde + hasta.
// `paso` default 6 h y `territorioTipo` default 'departamento'.
export const parametrosReplaySchema = z
  .object({
    territorioTipo: territorioReplaySchema.default('departamento'),
    territorioId: z.string().min(1).optional(),
    desde: instanteReplaySchema.optional(),
    hasta: instanteReplaySchema.optional(),
    paso: z.number().int().positive().default(PASO_REPLAY_HORAS_DEFAULT),
    vista: vistaReplaySchema,
    episodioDerivadoId: z.string().min(1).optional(),
  })
  .superRefine((valor, ctx) => {
    const porEpisodio = valor.episodioDerivadoId !== undefined
    const porTerritorio =
      valor.territorioId !== undefined && valor.desde !== undefined && valor.hasta !== undefined
    if (!porEpisodio && !porTerritorio) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Se requiere episodioDerivadoId o, en su defecto, territorioId + desde + hasta',
      })
      return
    }
    if (valor.desde !== undefined && valor.hasta !== undefined && valor.desde > valor.hasta) {
      ctx.addIssue({ code: 'custom', message: 'desde debe ser anterior o igual a hasta' })
    }
  })

export type ParametrosReplay = z.infer<typeof parametrosReplaySchema>

// --- Cuadro (frame) por paso temporal ---

// Afectación confirmada incluida en un cuadro. `cueAnexo` viene del join con
// infra_parte (la tabla de afectación no lo guarda directo). `rigeDesde` es la
// vigencia; cuál vista la incluye lo decide el motor, no este esquema.
export const afectacionConfirmadaReplaySchema = z.object({
  cueAnexo: z.string().min(1),
  motivo: z.string().min(1),
  categoria: z.string().min(1),
  severidad: z.string().min(1),
  rigeDesde: instanteReplaySchema,
})

export type AfectacionConfirmadaReplay = z.infer<typeof afectacionConfirmadaReplaySchema>

// Score de riesgo de una escuela dentro del snapshot vigente. `nivelRiesgo`
// puede ser null (score calculado sin nivel asignado); NO se interpola ni se
// completa con un nivel inventado.
export const nivelRiesgoEscuelaReplaySchema = z.object({
  cueAnexo: z.string().min(1),
  nivelRiesgo: z.string().nullable(),
  horizonteHoras: z.number().int(),
})

export type NivelRiesgoEscuelaReplay = z.infer<typeof nivelRiesgoEscuelaReplaySchema>

// Snapshot de riesgo del cuadro. `null` significa "sin dato" para ese instante
// (no había run publicado a esa fecha); NUNCA se rellena con el snapshot
// anterior ni con un valor interpolado.
export const snapshotRiesgoReplaySchema = z.object({
  runId: z.string().min(1),
  publicadoEn: instanteReplaySchema,
  porEscuela: z.array(nivelRiesgoEscuelaReplaySchema),
})

export type SnapshotRiesgoReplay = z.infer<typeof snapshotRiesgoReplaySchema>

// Nivel de peligro estimado por celda de grilla (Capa 1, E3a).
export const nivelPeligroReplaySchema = z.object({
  geometryRef: z.string().min(1),
  nivel: z.string().min(1),
  emitidoEn: instanteReplaySchema,
})

export type NivelPeligroReplay = z.infer<typeof nivelPeligroReplaySchema>

// Lluvia observada por celda (NASA GPM IMERG). Sólo entra el gránulo/ventana
// cuyo fin es <= instante del cuadro; si no hay, el arreglo va vacío y el
// consumidor muestra "sin dato" (ver VaciosReplay).
export const lluviaObservadaReplaySchema = z.object({
  geometryRef: z.string().min(1),
  valorMm: z.number(),
  observadoEn: instanteReplaySchema,
})

export type LluviaObservadaReplay = z.infer<typeof lluviaObservadaReplaySchema>

// Salud de una fuente externa al instante del cuadro. `estado` es texto del
// dominio de fuentes (p. ej. 'ok', 'degradado', 'no_disponible', 'caida').
export const saludFuenteReplaySchema = z.object({
  fuente: z.string().min(1),
  estado: z.string().min(1),
  actualizadoEn: instanteReplaySchema,
})

export type SaludFuenteReplay = z.infer<typeof saludFuenteReplaySchema>

// Un cuadro completo: el estado reconstruido en `instante`.
export const cuadroReplaySchema = z.object({
  instante: instanteReplaySchema,
  afectacionesConfirmadas: z.array(afectacionConfirmadaReplaySchema),
  snapshotRiesgo: snapshotRiesgoReplaySchema.nullable(),
  nivelesPeligro: z.array(nivelPeligroReplaySchema),
  lluviaObservada: z.array(lluviaObservadaReplaySchema),
  saludFuentes: z.array(saludFuenteReplaySchema),
})

export type CuadroReplay = z.infer<typeof cuadroReplaySchema>

// Qué categorías de dato faltaron en un cuadro. Es la señal explícita para que
// el consumidor muestre "sin dato" en vez de un vacío ambiguo. snapshotRiesgo
// en false con `snapshotRiesgo: null` en el cuadro son cosas distintas: el
// primero dice "no hay dato de riesgo", el segundo ya es la ausencia.
export const vaciosReplaySchema = z.object({
  snapshotRiesgo: z.boolean(),
  peligro: z.boolean(),
  lluvia: z.boolean(),
})

export type VaciosReplay = z.infer<typeof vaciosReplaySchema>
