import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraAccesoNominalLog, infraBorrador } from '@/lib/db/schema'

const NOMINAL_KEYS = new Set([
  'alumno',
  'alumnoid',
  'alumnos',
  'alumnosids',
  'apellido',
  'apellidoalumno',
  'apellidos',
  'adjunto',
  'adjuntos',
  'base64',
  'bytes',
  'dataurl',
  'dni',
  'documento',
  'estudianteid',
  'estudiante',
  'estudiantes',
  'estudiantesids',
  'gepersonid',
  'image',
  'imagebytes',
  'imagedata',
  'images',
  'personaid',
  'nombre',
  'nombrealumno',
  'nombres',
  'student',
  'studentid',
  'students',
  'studentids',
])

export interface DraftCursor {
  actividadEn: string
  draftId: string
}

export interface DraftMapItem {
  draftId: string
  cue: string
  flujo: unknown
  progreso: { pasoActual: string; pasosCompletados: string[] }
  actividadEn: string
  respuestas: Record<string, unknown>
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replaceAll('_', '').replaceAll('-', '')
}

function isNominalKey(key: string): boolean {
  const normalized = normalizedKey(key)
  return NOMINAL_KEYS.has(normalized) || normalized.endsWith('alumnoid') ||
    normalized.endsWith('personaid') || normalized.endsWith('estudianteid') ||
    normalized.endsWith('studentid')
}

function hasNominalData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasNominalData)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => isNominalKey(key) || hasNominalData(nested))
}

function countNominalEntries(value: unknown, nominalValue = false): number {
  if (nominalValue) return Array.isArray(value) ? value.length : 1
  if (Array.isArray(value)) return value.reduce((sum, nested) => sum + countNominalEntries(nested), 0)
  if (!value || typeof value !== 'object') return 1
  return Object.entries(value).reduce(
    (sum, [key, nested]) => sum + countNominalEntries(nested, isNominalKey(key)),
    0,
  )
}

function removeNominal(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeNominal)
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    if (isNominalKey(key)) continue
    result[key] = removeNominal(nested)
  }
  return result
}

export async function getDraftCounts(cues?: string[]) {
  if (cues && cues.length === 0) return []
  const db = getDb()
  const where = cues
    ? and(eq(infraBorrador.estado, 'open'), inArray(infraBorrador.cueAnexo, cues))
    : eq(infraBorrador.estado, 'open')
  const rows = await db
    .select({ cue: infraBorrador.cueAnexo, count: sql<number>`count(*)` })
    .from(infraBorrador)
    .where(where)
    .groupBy(infraBorrador.cueAnexo)
  return rows.map((row) => ({ cue: row.cue, count: Number(row.count) }))
}

export async function listDraftsForMap(params: {
  cue: string
  cursor?: DraftCursor
  limit: number
  includeNominal: boolean
  userId: string
  ahora: Date
}): Promise<{ items: DraftMapItem[]; nextCursor: DraftCursor | null }> {
  const conditions = [eq(infraBorrador.cueAnexo, params.cue), eq(infraBorrador.estado, 'open')]
  if (params.cursor) {
    conditions.push(or(
      lt(infraBorrador.actividadEn, params.cursor.actividadEn),
      and(eq(infraBorrador.actividadEn, params.cursor.actividadEn), lt(infraBorrador.id, params.cursor.draftId)),
    )!)
  }

  const db = getDb()
  const rows = await db.transaction(async (tx) => {
    const drafts = await tx
      .select({
        id: infraBorrador.id,
        cue: infraBorrador.cueAnexo,
        contexto: infraBorrador.contexto,
        paso: infraBorrador.paso,
        respuestas: infraBorrador.respuestas,
        actividadEn: infraBorrador.actividadEn,
      })
      .from(infraBorrador)
      .where(and(...conditions))
      .orderBy(desc(infraBorrador.actividadEn), desc(infraBorrador.id))
      .limit(params.limit + 1)

    if (params.includeNominal) {
      for (const row of drafts.slice(0, params.limit)) {
        if (!hasNominalData(row.respuestas)) continue
        await tx.insert(infraAccesoNominalLog).values({
          id: crypto.randomUUID(),
          userId: params.userId,
          afectacionId: `borrador:${row.id}`,
          cantidad: countNominalEntries(row.respuestas),
          consultadoEn: params.ahora.toISOString(),
        })
      }
    }
    return drafts
  })

  const hasMore = rows.length > params.limit
  const pageRows = rows.slice(0, params.limit)
  const items = pageRows.map((row) => {
    const answers = (params.includeNominal ? row.respuestas : removeNominal(row.respuestas)) as Record<string, unknown>
    const completedSteps = Array.isArray(answers.pasosCompletados)
      ? answers.pasosCompletados.filter((step): step is string => typeof step === 'string')
      : []
    const { pasosCompletados: _completedSteps, ...allowedAnswers } = answers
    return {
      draftId: row.id,
      cue: row.cue,
      flujo: (row.contexto as Record<string, unknown>).flujo,
      progreso: { pasoActual: row.paso, pasosCompletados: completedSteps },
      actividadEn: row.actividadEn,
      respuestas: allowedAnswers,
    }
  })
  const last = pageRows.at(-1)
  return {
    items,
    nextCursor: hasMore && last ? { actividadEn: last.actividadEn, draftId: last.id } : null,
  }
}
