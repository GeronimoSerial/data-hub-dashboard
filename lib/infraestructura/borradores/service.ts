import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { infraBorrador, infraBorradorCierre } from '@/lib/db/schema'

const MAX_BODY_BYTES = 64 * 1024
const MAX_DEPTH = 8
const MAX_NODES = 2_000
const FLOWS = ['inicial', 'actualizacion'] as const
const CLOSED_STATES = { submitted: 'enviado', discarded: 'descartado' } as const
const ALLOWED_STATUSES = ['habitual', 'parcial', 'evacuado', 'centro_evacuados', 'normal', 'suspendido']
const ALLOWED_SEVERITIES = ['Baja', 'Media', 'Alta', 'Crítica']
const FORBIDDEN_KEYS = new Set([
  'alumno', 'alumnos', 'nombrealumno', 'apellidoalumno', 'gepersonid', 'documento', 'dni',
  'base64', 'dataurl', 'imagedata', 'imagebytes', 'bytes', 'foto', 'fotos', 'adjuntos', 'image', 'images',
])

const timestampSchema = z.string().datetime({ offset: true }).max(40)
const draftIdSchema = z.string().uuid()
const cueSchema = z.string().regex(/^\d{7}-\d{2}$/)
const contextSchema = z.object({
  version: z.literal(1),
  draftId: draftIdSchema,
  cue: cueSchema,
  flujo: z.enum(FLOWS),
  escuela: z.object({
    nombre: z.string().trim().min(1).max(200),
    cue: cueSchema,
    departamento: z.string().trim().max(120),
  }).passthrough(),
  turnos: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  motivos: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    nombre: z.string().trim().min(1).max(200),
    categoria: z.string().trim().min(1).max(100),
  }).passthrough()).max(200).optional(),
  situacionBase: z.object({ movimientoBaseId: z.string().trim().min(1).max(200), estado: z.string().trim().min(1).max(100) }).passthrough().optional(),
}).passthrough()

export type DraftError = 'invalid' | 'conflict' | 'closed' | 'not_found' | 'too_large'
export class BorradorError extends Error {
  readonly code: DraftError
  readonly fields: string[]
  readonly remoteRevision?: number
  readonly estado?: string

  constructor(code: DraftError, fields: string[] = [], remoteRevision?: number, estado?: string) {
    super(code)
    this.name = 'BorradorError'
    this.code = code
    this.fields = fields
    this.remoteRevision = remoteRevision
    this.estado = estado
  }
}

export interface CreateDraftInput {
  version: 1
  draftId: string
  generacion: number
  contexto: Record<string, unknown>
  paso: string
  respuestas: Record<string, unknown>
  actividadEn: string
}

export interface SyncDraftInput {
  version: 1
  baseRevision: number
  respuestas?: Record<string, unknown>
  paso?: string
  pasosCompletados?: string[]
  actividadEn: string
}

function findInvalidValue(value: unknown, path = 'respuestas', depth = 0, budget = { count: 0 }, fieldKey = ''): string | null {
  budget.count += 1
  if (budget.count > MAX_NODES || depth > MAX_DEPTH) return path
  if (fieldKey.toLowerCase() === 'estado' && (typeof value !== 'string' || !ALLOWED_STATUSES.includes(value))) return path
  if (fieldKey.toLowerCase() === 'severidad' && (typeof value !== 'string' || !ALLOWED_SEVERITIES.includes(value))) return path
  if (fieldKey.toLowerCase() === 'flujo' && (typeof value !== 'string' || !FLOWS.includes(value as (typeof FLOWS)[number]))) return path
  if (typeof value === 'string') return value.length > 2_000 || /<[^>]*>/.test(value) ? path : null
  if (typeof value === 'number') return Number.isFinite(value) ? null : path
  if (value === null || typeof value === 'boolean') return null
  if (Array.isArray(value)) {
    if (value.length > 500) return path
    for (let index = 0; index < value.length; index += 1) {
      const invalid = findInvalidValue(value[index], `${path}.${index}`, depth + 1, budget, fieldKey)
      if (invalid) return invalid
    }
    return null
  }
  if (typeof value !== 'object') return path
  for (const [key, nested] of Object.entries(value)) {
    if (key.length > 100 || FORBIDDEN_KEYS.has(key.toLowerCase().replaceAll('_', '').replaceAll('-', ''))) return `${path}.${key}`
    const invalid = findInvalidValue(nested, `${path}.${key}`, depth + 1, budget, key)
    if (invalid) return invalid
  }
  return null
}

function parseCreate(input: unknown): CreateDraftInput {
  const schema = z.object({
    version: z.literal(1),
    draftId: draftIdSchema,
    generacion: z.number().int().positive().max(2_147_483_647),
    contexto: contextSchema,
    paso: z.string().trim().min(1).max(120),
    respuestas: z.record(z.string().max(100), z.unknown()),
    actividadEn: timestampSchema,
  })
  const result = schema.safeParse(input)
  if (!result.success) throw new BorradorError('invalid', result.error.issues.map((issue) => issue.path.join('.')))
  if (result.data.contexto.draftId !== result.data.draftId ||
      result.data.contexto.cue !== result.data.contexto.escuela.cue) {
    throw new BorradorError('invalid', ['contexto'])
  }
  const invalidContext = findInvalidValue(result.data.contexto, 'contexto')
  if (invalidContext) throw new BorradorError('invalid', [invalidContext])
  const invalid = findInvalidValue(result.data.respuestas)
  if (invalid) throw new BorradorError('invalid', [invalid])
  return result.data as CreateDraftInput
}

function parseSync(input: unknown): SyncDraftInput {
  const schema = z.object({
    version: z.literal(1),
    baseRevision: z.number().int().nonnegative().max(2_147_483_646),
    respuestas: z.record(z.string().max(100), z.unknown()).optional(),
    paso: z.string().trim().min(1).max(120).optional(),
    pasosCompletados: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    actividadEn: timestampSchema,
  })
  const result = schema.safeParse(input)
  if (!result.success) throw new BorradorError('invalid', result.error.issues.map((issue) => issue.path.join('.')))
  if (result.data.respuestas) {
    const invalid = findInvalidValue(result.data.respuestas)
    if (invalid) throw new BorradorError('invalid', [invalid])
  }
  return result.data as SyncDraftInput
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new BorradorError('too_large')
  const reader = request.body?.getReader()
  if (!reader) throw new BorradorError('invalid', ['body'])
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new BorradorError('too_large')
    }
    chunks.push(value)
  }
  const buffer = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer))
  } catch {
    throw new BorradorError('invalid', ['body'])
  }
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      result[key] = deepMerge(base[key] as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

function sameJson(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b)
}

function stableJson(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical)
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, canonical(nested)]))
    }
    return input
  }
  return JSON.stringify(canonical(value))
}

function publicDraft(row: typeof infraBorrador.$inferSelect) {
  const context = row.contexto as Record<string, unknown>
  const answers = removeNominal(row.respuestas) as Record<string, unknown>
  const completed = Array.isArray(answers.pasosCompletados) ? answers.pasosCompletados : []
  const { pasosCompletados: _ignored, ...respuestas } = answers
  return {
    version: 1,
    draftId: row.id,
    cue: row.cueAnexo,
    flujo: context.flujo,
    estado: row.estado === 'open' ? 'activo' : CLOSED_STATES[row.estado as keyof typeof CLOSED_STATES] ?? row.estado,
    revision: row.revision,
    paso: row.paso,
    pasosCompletados: completed,
    respuestas,
    adjuntos: [],
    creadoEn: row.creadoEn,
    actividadEn: row.actividadEn,
    sincronizadoEn: row.sincronizadoEn,
  }
}

function removeNominal(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeNominal)
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replaceAll('_', '').replaceAll('-', '')
    if (FORBIDDEN_KEYS.has(normalizedKey)) continue
    result[key] = removeNominal(nested)
  }
  return result
}

export async function createDraft(value: unknown) {
  const input = parseCreate(value)
  const db = getDb()
  const [closure] = await db.select().from(infraBorradorCierre).where(eq(infraBorradorCierre.draftId, input.draftId)).limit(1)
  if (closure) throw new BorradorError('closed', [], undefined, CLOSED_STATES[closure.estadoCierre as keyof typeof CLOSED_STATES] ?? closure.estadoCierre)

  const [existing] = await db.select().from(infraBorrador).where(eq(infraBorrador.id, input.draftId)).limit(1)
  const createHash = stableJson({
    generacion: input.generacion,
    cue: input.contexto.cue,
    contexto: input.contexto,
    paso: input.paso,
    respuestas: input.respuestas,
    actividadEn: input.actividadEn,
  })
  if (existing) {
    const storedHash = (existing.contexto as Record<string, unknown>).__serverCreateHash
    const identical = typeof storedHash === 'string'
      ? storedHash === createHash
      : existing.generacion === input.generacion && existing.cueAnexo === input.contexto.cue &&
        sameJson(existing.contexto, input.contexto) && existing.paso === input.paso &&
        sameJson(existing.respuestas, input.respuestas) && existing.actividadEn === input.actividadEn
    if (!identical) throw new BorradorError('conflict', [], existing.revision)
    return { draft: publicDraft(existing), created: false }
  }

  const now = new Date().toISOString()
  try {
    const [row] = await db.insert(infraBorrador).values({
      id: input.draftId,
      generacion: input.generacion,
      cueAnexo: input.contexto.cue as string,
      contexto: { ...input.contexto, __serverCreateHash: createHash },
      paso: input.paso,
      respuestas: input.respuestas,
      revision: 0,
      estado: 'open',
      creadoEn: now,
      actividadEn: input.actividadEn,
      sincronizadoEn: now,
    }).returning()
    return { draft: publicDraft(row), created: true }
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== '23505') throw error
    const [raced] = await db.select().from(infraBorrador).where(eq(infraBorrador.id, input.draftId)).limit(1)
    if (!raced) throw error
    const storedHash = (raced.contexto as Record<string, unknown>).__serverCreateHash
    if (storedHash !== createHash) throw new BorradorError('conflict', [], raced.revision)
    return { draft: publicDraft(raced), created: false }
  }
}

export async function getDraft(draftId: string) {
  const db = getDb()
  const [closure] = await db.select().from(infraBorradorCierre).where(eq(infraBorradorCierre.draftId, draftId)).limit(1)
  if (closure) throw new BorradorError('closed', [], undefined, CLOSED_STATES[closure.estadoCierre as keyof typeof CLOSED_STATES] ?? closure.estadoCierre)
  const [row] = await db.select().from(infraBorrador).where(eq(infraBorrador.id, draftId)).limit(1)
  if (!row) throw new BorradorError('not_found')
  return publicDraft(row)
}

export async function getDraftCue(draftId: string) {
  const db = getDb()
  const [closure] = await db.select({ cueAnexo: infraBorradorCierre.cueAnexo }).from(infraBorradorCierre).where(eq(infraBorradorCierre.draftId, draftId)).limit(1)
  if (closure) return closure.cueAnexo
  const [row] = await db.select({ cueAnexo: infraBorrador.cueAnexo }).from(infraBorrador).where(eq(infraBorrador.id, draftId)).limit(1)
  return row?.cueAnexo ?? null
}

export async function syncDraft(draftId: string, value: unknown) {
  const input = parseSync(value)
  const db = getDb()
  return db.transaction(async (tx) => {
    const [closure] = await tx.select().from(infraBorradorCierre).where(eq(infraBorradorCierre.draftId, draftId)).limit(1)
    if (closure) throw new BorradorError('closed', [], undefined, CLOSED_STATES[closure.estadoCierre as keyof typeof CLOSED_STATES] ?? closure.estadoCierre)
    const [row] = await tx.select().from(infraBorrador).where(eq(infraBorrador.id, draftId)).limit(1)
    if (!row) throw new BorradorError('not_found')
    if (row.estado !== 'open') throw new BorradorError('closed', [], undefined, CLOSED_STATES[row.estado as keyof typeof CLOSED_STATES] ?? row.estado)
    if (row.revision !== input.baseRevision) throw new BorradorError('conflict', [], row.revision)

    const respuestas = input.respuestas ? deepMerge(row.respuestas, input.respuestas) : row.respuestas
    if (input.pasosCompletados) respuestas.pasosCompletados = [...new Set(input.pasosCompletados)]
    const now = new Date().toISOString()
    const [updated] = await tx.update(infraBorrador).set({
      respuestas,
      paso: input.paso ?? row.paso,
      revision: row.revision + 1,
      actividadEn: input.actividadEn,
      sincronizadoEn: now,
    }).where(and(eq(infraBorrador.id, draftId), eq(infraBorrador.revision, input.baseRevision))).returning()
    if (!updated) {
      const [remote] = await tx.select({ revision: infraBorrador.revision }).from(infraBorrador).where(eq(infraBorrador.id, draftId)).limit(1)
      throw new BorradorError('conflict', [], remote?.revision ?? row.revision)
    }
    return { revision: updated.revision, sincronizadoEn: updated.sincronizadoEn }
  })
}

export async function discardDraft(draftId: string, value: unknown) {
  const schema = z.object({ version: z.literal(1), baseRevision: z.number().int().nonnegative().max(2_147_483_646) })
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new BorradorError('invalid', parsed.error.issues.map((issue) => issue.path.join('.')))
  const db = getDb()
  return db.transaction(async (tx) => {
    const [closure] = await tx.select().from(infraBorradorCierre).where(eq(infraBorradorCierre.draftId, draftId)).limit(1)
    if (closure) throw new BorradorError('closed', [], undefined, CLOSED_STATES[closure.estadoCierre as keyof typeof CLOSED_STATES] ?? closure.estadoCierre)
    const [row] = await tx.select().from(infraBorrador).where(eq(infraBorrador.id, draftId)).limit(1)
    if (!row) throw new BorradorError('not_found')
    if (row.revision !== parsed.data.baseRevision) throw new BorradorError('conflict', [], row.revision)
    const revision = row.revision + 1
    const now = new Date().toISOString()
    const [updated] = await tx.update(infraBorrador).set({ estado: 'discarded', revision, actividadEn: now, sincronizadoEn: now })
      .where(and(eq(infraBorrador.id, draftId), eq(infraBorrador.revision, row.revision), eq(infraBorrador.estado, 'open')))
      .returning({ revision: infraBorrador.revision })
    if (!updated) {
      const [remote] = await tx.select({ revision: infraBorrador.revision }).from(infraBorrador).where(eq(infraBorrador.id, draftId)).limit(1)
      throw new BorradorError('conflict', [], remote?.revision ?? row.revision)
    }
    await tx.insert(infraBorradorCierre).values({
      draftId,
      cueAnexo: row.cueAnexo,
      estadoCierre: 'discarded',
      revisionCierre: revision,
      movimientoId: null,
      cerradoEn: now,
    })
    return { estado: 'descartado', revision }
  })
}
