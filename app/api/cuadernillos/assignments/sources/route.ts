import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import {
  AssignmentSourceError,
  listAssignmentSourceRevisions,
  stageAssignmentSourceManifest,
} from '@/lib/cuadernillos/assignment-source'
import {
  AssignmentUploadError,
  MAX_ASSIGNMENT_UPLOAD_BYTES,
  assignmentSourceIdFor,
  parseAssignmentCsv,
} from '@/lib/cuadernillos/assignment-upload'
import type { AssignmentAccepted } from '@/lib/cuadernillos/types'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

const errorResponse = (code: string, status: number) => Response.json({ error: code }, { status, headers: NO_STORE })
const privateResponse = (response: Response) => new Response(response.body, {
  status: response.status,
  statusText: response.statusText,
  headers: { ...Object.fromEntries(response.headers), ...NO_STORE },
})

const CSV_TYPES = ['text/csv', 'text/plain', 'application/csv']

/** Reads the uploaded CSV bytes from multipart (field `file`) or a raw text/csv body. */
async function readUpload(request: Request): Promise<{ fileName: string; bytes: Uint8Array } | Response> {
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (contentType === 'multipart/form-data') {
    let form: FormData
    try { form = await request.formData() } catch { return errorResponse('invalid_upload', 400) }
    const file = form.get('file')
    if (!(file instanceof File)) return errorResponse('missing_file', 400)
    if (file.size > MAX_ASSIGNMENT_UPLOAD_BYTES) return errorResponse('file_too_large', 413)
    return { fileName: file.name || 'upload.csv', bytes: new Uint8Array(await file.arrayBuffer()) }
  }
  if (CSV_TYPES.includes(contentType)) {
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (declared > MAX_ASSIGNMENT_UPLOAD_BYTES) return errorResponse('file_too_large', 413)
    const bytes = new Uint8Array(await request.arrayBuffer())
    if (bytes.byteLength > MAX_ASSIGNMENT_UPLOAD_BYTES) return errorResponse('file_too_large', 413)
    return { fileName: 'upload.csv', bytes }
  }
  return errorResponse('unsupported_media_type', 415)
}

function distinctSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'es'))
}

async function handleGET() {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return privateResponse(hubDenied)
  try {
    const revisions = await listAssignmentSourceRevisions(actor)
    return Response.json({ revisions }, { status: 200, headers: NO_STORE })
  } catch (error) {
    if (error instanceof AssignmentSourceError) return errorResponse(error.code, error.status)
    return errorResponse('assignment_source_failed', 503)
  }
}

async function handlePOST(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return privateResponse(hubDenied)

  const upload = await readUpload(request)
  if (upload instanceof Response) return upload

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(upload.bytes)
  } catch {
    return errorResponse('invalid_encoding', 400)
  }

  try {
    const sourceId = assignmentSourceIdFor(upload.fileName, upload.bytes)
    const rows = parseAssignmentCsv(text, sourceId)
    const staged = await stageAssignmentSourceManifest(actor, sourceId, rows)
    const accepted: AssignmentAccepted[] = staged.preview.accepted
    return Response.json({
      revisionId: staged.revisionId,
      previewHash: staged.previewHash,
      accepted,
      conflicts: staged.preview.conflicts,
      unresolved: staged.preview.unresolved,
      supervisorNames: distinctSorted(accepted.map((item) => item.supervisorName)),
      cabeceras: accepted
        .filter((item) => item.relationship === 'cabecera')
        .map((item) => ({ cue: item.cueAnexo, nombre: item.schoolName })),
    }, { status: 201, headers: NO_STORE })
  } catch (error) {
    if (error instanceof AssignmentSourceError || error instanceof AssignmentUploadError) {
      return errorResponse(error.code, error.status)
    }
    // previewHash is unique: the same bytes and rows were already staged.
    if ((error as { code?: string }).code === '23505') return errorResponse('assignment_source_already_staged', 409)
    return errorResponse('assignment_source_failed', 503)
  }
}

export const GET = ruta('cuadernillos.assignments.sources.get', handleGET)
export const POST = ruta('cuadernillos.assignments.sources.post', handlePOST)
