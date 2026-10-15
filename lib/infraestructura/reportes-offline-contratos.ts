// Contratos de tipos y constantes para reportes offline, borradores y fotos.
// Fuente: docs/contratos-reportes-offline.md (batch 0). Solo tipos y constantes:
// no hay validación ni acceso a datos aquí. Las validaciones Zod y las rutas
// llegan con los batches 3 y 6.
//
// Ningún contrato de este archivo incluye bytes de imagen: los adjuntos viajan
// como metadatos y estados.

export const CONTRATO_VERSION = 1 as const

export const MAX_FOTOS_POR_ENVIO = 3
export const FOTOS_SUBIDAS_SIMULTANEAS = 1
export const PROCESAMIENTOS_SIMULTANEOS = 1

/** Límites de cuerpo JSON, en bytes. */
export const LIMITE_CUERPO_BORRADOR_BYTES = 64 * 1024
export const LIMITE_CUERPO_ENVIO_BYTES = 256 * 1024

/** Propuesta inicial para validar en batch 5 (plan funcional, sección de procesamiento). */
export const LIMITE_FOTO_OPTIMIZADA_BYTES = 600 * 1024
export const LIMITE_MINIATURA_BYTES = 40 * 1024

export const ESTADOS_BORRADOR = ['activo', 'envio_pendiente', 'enviado', 'descartado'] as const
export type EstadoBorrador = (typeof ESTADOS_BORRADOR)[number]

/** Transiciones permitidas. `enviado` y `descartado` son terminales. */
export const TRANSICIONES_BORRADOR: Readonly<Record<EstadoBorrador, readonly EstadoBorrador[]>> = {
  activo: ['envio_pendiente', 'descartado'],
  envio_pendiente: ['enviado', 'activo'],
  enviado: [],
  descartado: [],
}

export const ESTADOS_ADJUNTO = [
  'declarado',
  'autorizado',
  'subido',
  'disponible',
  'fallido',
  'descartado',
] as const
export type EstadoAdjunto = (typeof ESTADOS_ADJUNTO)[number]

export const TRANSICIONES_ADJUNTO: Readonly<Record<EstadoAdjunto, readonly EstadoAdjunto[]>> = {
  declarado: ['autorizado', 'fallido', 'descartado'],
  autorizado: ['subido', 'fallido'],
  subido: ['disponible', 'fallido'],
  disponible: [],
  fallido: ['autorizado', 'descartado'],
  descartado: [],
}

export type FlujoReporte = 'inicial' | 'actualizacion'

export type TipoMovimientoEvidencia = 'evidencia_fotografica'

/** Contexto guardado al iniciar el recorrido. Sin identificadores de alumnos. */
export interface ContextoReporte {
  version: typeof CONTRATO_VERSION
  draftId: string
  cue: string
  flujo: FlujoReporte
  escuela: { nombre: string; cue: string; departamento: string }
  turnos: string[]
  motivos: readonly { id: string; nombre: string; categoria: string }[]
  /** Solo en actualizaciones: estado e historial usados al iniciar. */
  situacionBase?: { movimientoBaseId: string; estado: string }
}

/** Metadatos de un adjunto. Nunca incluye bytes. */
export interface AdjuntoMetadata {
  attachmentId: string
  orden: 1 | 2 | 3
  mime: 'image/jpeg' | 'image/webp'
  bytesOptimizado: number
  bytesMiniatura: number
  ancho: number
  alto: number
  sha256Optimizado: string
  estado: EstadoAdjunto
  /** Asignadas por el servidor al declarar; el cliente nunca elige claves. */
  objectKeyPrincipal?: string
  objectKeyMiniatura?: string
}

/** Borrador tal como lo devuelve el servidor. */
export interface BorradorRevision {
  version: typeof CONTRATO_VERSION
  draftId: string
  cue: string
  flujo: FlujoReporte
  estado: EstadoBorrador
  revision: number
  paso: string
  pasosCompletados: string[]
  respuestas: Record<string, unknown>
  adjuntos: AdjuntoMetadata[]
  creadoEn: string
  actividadEn: string
  sincronizadoEn?: string
}

/** Cambios consolidados enviados en un único PUT. */
export interface SolicitudSincronizarBorrador {
  version: typeof CONTRATO_VERSION
  baseRevision: number
  respuestas?: Record<string, unknown>
  paso?: string
  pasosCompletados?: string[]
  actividadEn: string
}

export type RespuestaSincronizarBorrador =
  | { ok: true; revision: number }
  | { ok: false; status: 409; code: 'conflicto'; revisionServidor: number }
  | { ok: false; status: 410; code: 'cerrado'; estado: EstadoBorrador }
  | { ok: false; status: 422; code: 'validacion'; campos: string[] }

/** Cuerpo congelado antes del primer intento de envío definitivo. */
export interface EnvioInmutable {
  version: typeof CONTRATO_VERSION
  idempotencyKey: string
  draftId: string
  baseRevision: number
  cuerpo: Record<string, unknown>
  /** SHA-256 hex del JSON canónico de `cuerpo`. */
  cuerpoHash: string
}

export interface ConfirmacionEnvio {
  movimientoId: string
  rigeDesde: string
  cierreDraft: 'enviado'
}

export interface DeclaracionAdjuntos {
  movimientoId?: string
  fotos: readonly Omit<AdjuntoMetadata, 'estado' | 'objectKeyPrincipal' | 'objectKeyMiniatura' | 'orden'>[]
}

/** Registro de cierre que impide reactivar un borrador por requests tardías. */
export interface CierreBorrador {
  draftId: string
  cue: string
  estadoCierre: 'enviado' | 'descartado'
  revisionCierre: number
  movimientoId: string | null
  cerradoEn: string
}
