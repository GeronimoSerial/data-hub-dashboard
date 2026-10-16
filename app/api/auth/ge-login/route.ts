import { ensureSeeded } from '@/lib/db/seed'
import { manejarGeLogin, responderPreflightGe } from '@/lib/ge-sso/handlers'

// Ruta estática: Next la prioriza sobre el catch-all de better-auth
// (app/api/auth/[...all]). Ver odd/tasks/ge-sso-nivel-jurisdiccional.md (T6).
export const runtime = 'nodejs'

export async function OPTIONS(request: Request) {
  return responderPreflightGe(request)
}

export async function POST(request: Request) {
  await ensureSeeded()
  return manejarGeLogin(request)
}
