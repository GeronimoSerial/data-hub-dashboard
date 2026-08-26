import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin as adminPlugin } from 'better-auth/plugins'
import { getDb } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { ac, admin, editor, consulta } from '@/lib/auth-permissions'

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(getDb(), {
    provider: 'sqlite',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  plugins: [
    adminPlugin({
      ac,
      roles: { admin, editor, consulta },
      defaultRole: 'consulta',
      adminRoles: ['admin'],
    }),
    nextCookies(),
  ],
})
