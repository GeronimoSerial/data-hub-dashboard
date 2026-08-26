import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'
import { ac, admin, editor, consulta } from '@/lib/auth-permissions'

export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles: { admin, editor, consulta } })],
})
