import { ensureSeeded } from '@/lib/db/seed'
import { manejarGeLogin, responderPreflightGe } from '@/lib/ge-sso/handlers'
import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'

// Ruta estática: Next la prioriza sobre el catch-all de better-auth
// (app/api/auth/[...all]). Ver odd/tasks/ge-sso-nivel-jurisdiccional.md (T6).
export const runtime = 'nodejs'

const limitador = crearLimitador({ ventanaMs: 60_000, max: 10 })

async function handleOPTIONS(request: Request) {
  return responderPreflightGe(request)
}

async function handlePOST(request: Request) {
  await ensureSeeded()
  return manejarGeLogin(request)
}

export const OPTIONS = ruta('auth.ge-login.options', handleOPTIONS)
export const POST = ruta('auth.ge-login.post', handlePOST, { limite: { limitador } })
