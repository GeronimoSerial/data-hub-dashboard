// Contratos Zod/TS transversales de riesgo para el batch E0 del plan ENOS.
// Mismo estilo que validacion-trayectoria.ts: validación de forma únicamente,
// tipos compartidos entre módulos de riesgo sin tocar la base.
import { z } from 'zod'

// Identificador CUE-anexo. Se mantiene como string deliberadamente: la columna
// cue_anexo en lib/db/schema.ts es text y los CUE llevan ceros a la izquierda
// (p. ej. '007123'), que se perderían si se convirtiera a número.
export const identidadCueAnexoSchema = z.string().min(1)

export type IdentidadCueAnexo = z.infer<typeof identidadCueAnexoSchema>

// Clases de dato de riesgo. observado/pronosticado describen el origen del
// dato; calculado/confirmado describen su verificación: son ejes semánticos
// distintos y sus valores no son intercambiables.
export const claseDatoSchema = z.enum(['observado', 'pronosticado', 'calculado', 'confirmado'])

export type ClaseDato = z.infer<typeof claseDatoSchema>

// Datetime ISO 8601 en UTC. offset:false exige marca de zona horaria 'Z' y
// rechaza strings sin zona o con offset no nulo (p. ej. '+02:00').
export const tiempoUtcSchema = z.iso.datetime({ offset: false })

export type TiempoUtc = z.infer<typeof tiempoUtcSchema>

// Estados de una ejecución de job de infraestructura (infra_job_run).
export const estadoJobSchema = z.enum(['pendiente', 'en_progreso', 'completado', 'fallido'])

export type EstadoJob = z.infer<typeof estadoJobSchema>