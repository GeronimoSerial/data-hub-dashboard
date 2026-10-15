import { ensureSeeded } from '@/lib/db/seed'
import { manejarGeCallback } from '@/lib/ge-sso/handlers'

export const runtime = 'nodejs'

// Canje del ticket de GE (un solo uso, 60 s) -> sesión de better-auth.
export async function GET(request: Request) {
  await ensureSeeded()
  return manejarGeCallback(request)
}
