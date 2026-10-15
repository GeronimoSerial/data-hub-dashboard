import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'
import {
  ac,
  admin,
  editor,
  consulta,
  directorNivel,
  operadorEstablecimiento,
} from '@/lib/auth-permissions'

export const authClient = createAuthClient({
  plugins: [
    adminClient({
      ac,
      roles: {
        admin,
        editor,
        consulta,
        director_nivel: directorNivel,
        operador_establecimiento: operadorEstablecimiento,
      },
    }),
  ],
})
