import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { resolveServerHubEntry } from '@/lib/hub-entry-server'
import { migrarDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function ContinueLogin({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  await migrarDb()
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const { callbackUrl } = await searchParams
  const destination = await resolveServerHubEntry(user, {
    callbackUrl: Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl,
  })
  redirect(destination ?? '/forbidden')
}
