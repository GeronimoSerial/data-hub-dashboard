import { z } from 'zod'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import {
  AssignmentSourceError,
  confirmStagedAssignmentSource,
  loadStagedAssignmentAccepted,
} from '@/lib/cuadernillos/assignment-source'
import { expandAccountConfirmations } from '@/lib/cuadernillos/assignment-upload'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const privateResponse = (response: Response) => new Response(response.body, {
  status: response.status,
  statusText: response.statusText,
  headers: { ...Object.fromEntries(response.headers), ...NO_STORE },
})
const errorResponse = (code: string, status: number) => Response.json({ error: code }, { status, headers: NO_STORE })

const bodySchema = z.object({
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  supervisorAccounts: z.record(z.string().trim().min(1).max(300), z.string().trim().min(1).max(128)),
  cabeceraAccounts: z.record(z.string().regex(/^\d{9}$/), z.string().trim().min(1).max(128)),
}).strict()

type Context = { params: Promise<{ id: string }> }

async function handlePOST(request: Request, context: Context) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return privateResponse(hubDenied)

  const { id } = await context.params
  let body: unknown
  try { body = await request.json() } catch { return errorResponse('Cuerpo inválido', 400) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return errorResponse('Cuerpo inválido', 400)

  try {
    const loaded = await loadStagedAssignmentAccepted(actor, parsed.data.previewHash)
    if (loaded.revisionId !== id) return errorResponse('staged_revision_mismatch', 409)

    const expanded = expandAccountConfirmations(loaded.accepted, {
      supervisorAccounts: parsed.data.supervisorAccounts,
      cabeceraAccounts: parsed.data.cabeceraAccounts,
    })
    const result = await confirmStagedAssignmentSource(actor, parsed.data.previewHash, expanded.confirmations)

    const skipped: { cueAnexo: string; reason: string }[] = [...expanded.skipped]
    const skippedCues = new Set(skipped.map((item) => item.cueAnexo))
    for (const cueAnexo of result.blockedCueAnexos) {
      if (!skippedCues.has(cueAnexo)) skipped.push({ cueAnexo, reason: 'dependency_not_confirmed' })
    }

    return Response.json({
      confirmedCount: result.persistedCueAnexos.length,
      confirmed: result.persistedCueAnexos,
      skipped,
      retainedConflictCueAnexos: result.retainedConflictCueAnexos,
    }, { status: 200, headers: NO_STORE })
  } catch (error) {
    if (error instanceof AssignmentSourceError) return errorResponse(error.code, error.status)
    return errorResponse('assignment_confirmation_failed', 503)
  }
}

export const POST = ruta('cuadernillos.assignments.sources.confirm.post', handlePOST)
