import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'

const handler = toNextJsHandler(auth)

export async function GET(request: Request) {
  await ensureSeeded()
  return handler.GET(request)
}

export async function POST(request: Request) {
  await ensureSeeded()
  if (new URL(request.url).pathname === '/api/auth/change-password') {
    const user = await getSessionUser()
    if (user?.banned) {
      return Response.json({ message: 'No tiene acceso a este recurso' }, {
        status: 403,
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
  }
  return handler.POST(request)
}
