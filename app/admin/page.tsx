import { redirect } from 'next/navigation'
import { AdminPage } from '@/components/admin-page'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { AdminShell } from '@/components/admin-shell'

export default async function Admin() {
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin')
  if (gate === 'forbidden') redirect('/forbidden')
  return <AdminShell role={user!.role}><AdminPage /></AdminShell>
}
