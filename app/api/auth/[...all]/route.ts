import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { ensureSeeded } from '@/lib/db/seed'

export const runtime = 'nodejs'

const handler = toNextJsHandler(auth)

export async function GET(request: Request) {
  await ensureSeeded()
  return handler.GET(request)
}

export async function POST(request: Request) {
  await ensureSeeded()
  return handler.POST(request)
}
