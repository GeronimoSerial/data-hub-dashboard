import { ensureSeeded } from '@/lib/db/seed'
import { manejarGeCallback } from '@/lib/ge-sso/handlers'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'

// Canje del ticket de GE (un solo uso, 60 s) -> sesión de better-auth.
async function handleGET(request: Request) {
  await ensureSeeded()
  return manejarGeCallback(request)
}

export const GET = ruta('auth.ge-callback.get', handleGET)
