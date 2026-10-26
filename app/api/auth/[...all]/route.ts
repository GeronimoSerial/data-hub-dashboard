import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { ensureSeeded } from '@/lib/db/seed'
import { ruta } from '@/lib/http/ruta'
import { getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'

const handler = toNextJsHandler(auth)

async function handleGET(request: Request) {
  await ensureSeeded()
  return handler.GET(request)
}

async function handlePOST(request: Request) {
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

export const GET = ruta('auth.all.get', handleGET)
export const POST = ruta('auth.all.post', handlePOST)
