import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'
import { z } from 'zod'
import { destinoPostLogin, rolGeDesdeHub } from './roles'
import { consumirTicket } from './ticket'

/**
 * Plugin de better-auth para el SSO desde GE: canjea el ticket de un solo uso
 * por una sesión con la cookie firmada que arma better-auth (setSessionCookie).
 *
 * El endpoint se invoca desde el route handler de `/auth/ge-callback` con
 * `auth.api.geSsoConsume({ body, returnHeaders: true })`, que devuelve las
 * cabeceras Set-Cookie para reenviarlas en la redirección.
 */
export function geSsoPlugin() {
  return {
    id: 'ge-sso',
    endpoints: {
      geSsoConsume: createAuthEndpoint(
        '/ge-sso/consume',
        {
          method: 'POST',
          body: z.object({ token: z.string().min(1).max(256) }),
        },
        async (ctx) => {
          const userId = await consumirTicket(ctx.body.token)
          if (!userId) {
            throw new APIError('UNAUTHORIZED', { message: 'Ticket inválido o vencido' })
          }
          // El tipo de internalAdapter no incluye los campos del plugin admin
          // (role, banned): se agregan por intersección, sin perder el tipo User.
          const usuario = await ctx.context.internalAdapter.findUserById(userId)
          const user = usuario as (typeof usuario & {
            role?: string | null
            banned?: boolean | null
          }) | null
          if (!user) {
            throw new APIError('UNAUTHORIZED', { message: 'Ticket inválido o vencido' })
          }
          if (user.banned) {
            throw new APIError('FORBIDDEN', { message: 'Usuario bloqueado' })
          }
          const session = await ctx.context.internalAdapter.createSession(user.id)
          await setSessionCookie(ctx, { session, user })
          return ctx.json({
            destino: destinoPostLogin(user.role),
            email: user.email,
            rol: rolGeDesdeHub(user.role),
          })
        },
      ),
    },
  } satisfies BetterAuthPlugin
}
