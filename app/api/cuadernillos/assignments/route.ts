import { z } from 'zod'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { validateAssignments } from '@/lib/cuadernillos/assignment-import'
import { hasBookletCapability } from '@/lib/cuadernillos/permissions'
import { getBookletAssignmentsPage } from '@/lib/cuadernillos/queries'
import { resolveViewAsActor } from '@/lib/cuadernillos/view-as'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const privateResponse = (response: Response) => new Response(response.body, {
  status: response.status,
  statusText: response.statusText,
  headers: { ...Object.fromEntries(response.headers), ...NO_STORE },
})
const querySchema = z.object({
  capability: z.enum(['planning', 'cabecera', 'supervisor']),
  cursor: z.string().regex(/^\d{9}$/).optional(),
})
const sourceRowSchema = z.object({
  cue: z.string().max(32).nullable(),
  schoolName: z.string().trim().min(1).max(300),
  relationship: z.enum(['cabecera', 'dependiente']),
  supervisorName: z.string().max(300).nullable(),
  cabeceraCue: z.string().max(32).nullable(),
  provenance: z.object({
    sourceId: z.string().trim().min(1).max(128),
    location: z.string().trim().min(1).max(128),
  }).strict(),
}).strict()
const rowsSchema = z.array(sourceRowSchema).min(1).max(5000)
const importSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('preview'), rows: rowsSchema }).strict(),
  z.object({
    mode: z.literal('confirm'),
    rows: rowsSchema,
    confirmations: z.array(z.object({
      cueAnexo: z.string().regex(/^\d{9}$/),
      supervisorUserId: z.string().trim().min(1).max(128),
      cabeceraUserId: z.string().trim().min(1).max(128),
    }).strict()).min(1).max(5000),
  }).strict(),
])

async function handleGET(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return privateResponse(hubDenied)

  const searchParams = new URL(request.url).searchParams
  if ([...searchParams.keys()].some((key) => !['capability', 'cursor', 'viewAs'].includes(key))) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: NO_STORE })
  }
  const capabilityValues = searchParams.getAll('capability')
  const cursorValues = searchParams.getAll('cursor')
  const viewAsValues = searchParams.getAll('viewAs')
  const parsed = querySchema.safeParse({
    capability: capabilityValues.length === 1 ? capabilityValues[0] : undefined,
    cursor: cursorValues.length === 0 ? undefined : cursorValues.length === 1 ? cursorValues[0] : null,
  })
  if (!parsed.success || viewAsValues.length > 1) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: NO_STORE })
  }

  try {
    const readActor = await resolveViewAsActor(actor, viewAsValues[0])
    if (readActor.status === 'unavailable') {
      return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers: NO_STORE })
    }
    const page = await getBookletAssignmentsPage(readActor.actor, parsed.data.capability, {
      cursor: parsed.data.cursor ?? null,
    })
    if (!page) {
      return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers: NO_STORE })
    }
    return Response.json(page, { status: 200, headers: NO_STORE })
  } catch {
    return Response.json({ error: 'No se pudieron obtener las asignaciones' }, { status: 503, headers: NO_STORE })
  }
}

async function handlePOST(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return privateResponse(hubDenied)

  if (!await hasBookletCapability(actor, 'planning')) {
    return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers: NO_STORE })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })
  }
  const parsed = importSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })

  try {
    if (parsed.data.mode === 'confirm') {
      return Response.json({ error: 'assignment_confirmation_unavailable' }, { status: 503, headers: NO_STORE })
    }
    const preview = validateAssignments(parsed.data.rows)
    return Response.json({ preview }, { status: 200, headers: NO_STORE })
  } catch {
    return Response.json({ error: 'assignment_preview_failed' }, { status: 503, headers: NO_STORE })
  }
}

export const GET = ruta('cuadernillos.assignments.get', handleGET)
export const POST = ruta('cuadernillos.assignments.post', handlePOST)
