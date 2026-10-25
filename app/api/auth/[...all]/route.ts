import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { ensureSeeded } from '@/lib/db/seed'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'

const handler = toNextJsHandler(auth)

async function handleGET(request: Request) {
  await ensureSeeded()
  return handler.GET(request)
}

async function handlePOST(request: Request) {
  await ensureSeeded()
  return handler.POST(request)
}

export const GET = ruta('auth.all.get', handleGET)
export const POST = ruta('auth.all.post', handlePOST)
