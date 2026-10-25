import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { resolveServerHubEntry } from '@/lib/hub-entry-server'
import { migrarDb } from '@/lib/db'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  await migrarDb()
  const user = await getSessionUser()
  const { callbackUrl } = await searchParams
  if (user) {
    const destination = await resolveServerHubEntry(user, {
      callbackUrl: Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl,
    })
    redirect(destination ?? '/forbidden')
  }
  return <LoginForm callbackUrl={Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl} />
}
