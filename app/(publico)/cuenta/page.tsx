import { and, eq, isNotNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getDb } from '@/lib/db'
import { account } from '@/lib/db/schema'
import { auth } from '@/lib/auth'
import { getSessionUser } from '@/lib/session'
import { resolveServerHubEntry } from '@/lib/hub-entry-server'
import Link from 'next/link'
import { AccountActions } from './account-actions'
import { ChangePasswordForm } from './change-password-form'

export const dynamic = 'force-dynamic'

export default async function CuentaPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login')
  const user = await getSessionUser()
  const safeReturn = user && !user.banned
    ? await resolveServerHubEntry(user, { currentPath: '/cuenta' })
    : null

  const [credential] = user?.banned ? [] : await getDb().select({ id: account.id }).from(account).where(and(
      eq(account.userId, session.user.id),
      eq(account.providerId, 'credential'),
      isNotNull(account.password),
    )).limit(1)

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="page-title page-title--sm">Cambiar contraseña</h1>
        {user?.banned
          ? <p role="alert" className="ui-messagebar ui-messagebar--error">La cuenta está bloqueada y no puede cambiar la contraseña.</p>
          : credential
          ? <ChangePasswordForm />
          : <p className="auth-intro">Esta cuenta no tiene una contraseña para cambiar.</p>}
        <div className="auth-form">
          {safeReturn ? <Link className="ui-button" href={safeReturn}>Volver al acceso permitido</Link> : null}
          <AccountActions />
        </div>
      </div>
    </div>
  )
}
