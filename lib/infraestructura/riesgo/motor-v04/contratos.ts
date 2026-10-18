// Contratos de Motor v0.4 (corrida y resultado por CUE/anexo × horizonte),
// según "Motor v0.4/CONTRATOS.md", ajustados a la decisión del usuario del
// 2026-10-17 (odd/tasks/motor-v0-4.md): sin cota de piso no se calcula agua en
// el edificio; el evento físico publicado es la superación del terreno.
//
// Módulo puro: sin DB ni reloj. Los esquemas se usan para validar antes de
// persistir (`infra_risk_run.metadatos`, `infra_risk_snapshot.resultado_v04`) y
// al leer, así un JSON mal formado nunca se publica como estimación.
import { z } from 'zod'
import { HORIZONTES_V04, MOTOR_V04_VERSION, MOTIVOS_V04 } from './config'

const instanteIso = z.string().datetime({ offset: true })

// Motivo en snake_case: vocabulario estable para agrupar abstenciones.
const motivo = z.string().regex(/^[a-z0-9_]+$/)

export const esquemaHorizonteV04 = z.union(HORIZONTES_V04.map((h) => z.literal(h)) as [
  z.ZodLiteral<24>,
  z.ZodLiteral<72>,
  z.ZodLiteral<240>,
])

export const esquemaModoRun = z.enum(['candidato', 'operativo'])
export type ModoRun = z.infer<typeof esquemaModoRun>

// Una estimación de evento en un escenario. Reglas (CONTRATOS.md):
// - `no_estimable` ⇔ probabilidad nula y al menos un motivo. Un dato faltante
//   nunca se guarda como 0.
// - `modelada`/`calibrada` exigen probabilidad en 0..1 con método y versión.
export const esquemaEstimacionV04 = z
  .object({
    probabilidad: z.number().min(0).max(1).nullable(),
    estado: z.enum(['modelada', 'calibrada', 'no_estimable']),
    motivos: z.array(motivo),
    metodo: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    ventanaHoras: esquemaHorizonteV04,
    // Supuestos y medidas auxiliares de la estimación (p. ej. km de río,
    // datum supuesto). Informativo: nunca altera la probabilidad.
    diagnostico: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.estado === 'no_estimable') {
      if (e.probabilidad !== null) {
        ctx.addIssue({ code: 'custom', message: 'no_estimable exige probabilidad nula', path: ['probabilidad'] })
      }
      if (e.motivos.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'no_estimable exige al menos un motivo', path: ['motivos'] })
      }
      return
    }
    if (e.probabilidad === null) {
      ctx.addIssue({ code: 'custom', message: `${e.estado} exige probabilidad numérica`, path: ['probabilidad'] })
    }
    if (e.metodo === undefined) ctx.addIssue({ code: 'custom', message: 'falta método', path: ['metodo'] })
    if (e.version === undefined) ctx.addIssue({ code: 'custom', message: 'falta versión', path: ['version'] })
  })
export type EstimacionV04 = z.infer<typeof esquemaEstimacionV04>

const esquemaEventoV04 = z
  .object({ principal: esquemaEstimacionV04, conservador: esquemaEstimacionV04 })
  .strict()

export const esquemaUbicacionV04 = z
  .object({
    estado: z.enum(['con_coordenadas', 'sin_coordenadas', 'coordenada_invalida', 'perfil_geografico_pendiente']),
    motivos: z.array(motivo),
  })
  .strict()
  .refine((u) => u.estado === 'con_coordenadas' || u.motivos.length > 0, {
    message: 'una ubicación no utilizable exige motivo',
    path: ['motivos'],
  })
export type UbicacionV04 = z.infer<typeof esquemaUbicacionV04>

// Resultado por CUE/anexo × horizonte. Se emite siempre, también cuando nada es
// estimable. `.strict()` impide colar un evento `aguaEnEdificio`: mientras no
// exista cota de ingreso relevada, el edificio se documenta como no modelado.
export const esquemaResultadoEscuelaV04 = z
  .object({
    modeloVersion: z.literal(MOTOR_V04_VERSION),
    modo: esquemaModoRun,
    cueAnexo: z.string().min(1),
    horizonteHoras: esquemaHorizonteV04,
    asOf: instanteIso,
    ubicacion: esquemaUbicacionV04,
    superacionTerreno: esquemaEventoV04,
    interrupcionEducativa: esquemaEventoV04,
    cotaIngresoEdificio: z
      .object({ valorM: z.null(), motivo: z.literal(MOTIVOS_V04.umbralIngresoNoDisponible) })
      .strict(),
    calibracionEscolar: z.enum(['pendiente', 'validada']),
  })
  .strict()
  .superRefine((r, ctx) => {
    const estimaciones: Array<[string, EstimacionV04]> = [
      ['superacionTerreno.principal', r.superacionTerreno.principal],
      ['superacionTerreno.conservador', r.superacionTerreno.conservador],
      ['interrupcionEducativa.principal', r.interrupcionEducativa.principal],
      ['interrupcionEducativa.conservador', r.interrupcionEducativa.conservador],
    ]
    for (const [ruta, e] of estimaciones) {
      if (e.ventanaHoras !== r.horizonteHoras) {
        ctx.addIssue({ code: 'custom', message: `${ruta}: ventana distinta del horizonte`, path: ruta.split('.') })
      }
    }
  })
export type ResultadoEscuelaV04 = z.infer<typeof esquemaResultadoEscuelaV04>

export const EVENTOS_V04 = ['superacionTerreno', 'interrupcionEducativa'] as const
export const ESCENARIOS_V04 = ['principal', 'conservador'] as const

const esquemaCoberturaEventoV04 = z
  .object({
    evento: z.enum(EVENTOS_V04),
    escenario: z.enum(ESCENARIOS_V04),
    horizonteHoras: esquemaHorizonteV04,
    modeladas: z.number().int().nonnegative(),
    calibradas: z.number().int().nonnegative(),
    noEstimables: z.number().int().nonnegative(),
  })
  .strict()

export const esquemaCoberturaV04 = z
  .object({
    totalPadron: z.number().int().nonnegative(),
    conCoordenadas: z.number().int().nonnegative(),
    sinUbicacionUtilizable: z.number().int().nonnegative(),
    resultadosEsperados: z.number().int().nonnegative(),
    resultadosEmitidos: z.number().int().nonnegative(),
    porEventoHorizonte: z.array(esquemaCoberturaEventoV04),
    abstencionesPorMotivo: z.record(motivo, z.number().int().nonnegative()),
  })
  .strict()
export type CoberturaV04 = z.infer<typeof esquemaCoberturaV04>

// Metadatos de corrida. `asOf`, `creadaEn` y `publicadaEn` no son
// intercambiables: corte de información, ejecución y publicación operativa.
export const esquemaMetadatosRunV04 = z
  .object({
    modeloVersion: z.literal(MOTOR_V04_VERSION),
    modo: esquemaModoRun,
    asOf: instanteIso,
    creadaEn: instanteIso,
    publicadaEn: instanteIso.nullable(),
    padronVersion: z.string().min(1),
    configHash: z.string().min(1),
    insumosHash: z.string().min(1),
    // Nunca se infiere de una descarga exitosa: sólo una evaluación documentada
    // puede pasarla a 'validada'.
    estadoCalibracionEscolar: z.enum(['pendiente', 'validada']),
    cobertura: esquemaCoberturaV04,
  })
  .strict()
  .refine((m) => m.modo !== 'candidato' || m.publicadaEn === null, {
    message: 'un candidato no se publica',
    path: ['publicadaEn'],
  })
export type MetadatosRunV04 = z.infer<typeof esquemaMetadatosRunV04>
