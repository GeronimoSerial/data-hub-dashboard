import { redirect } from 'next/navigation'
import { AdminPage } from '@/components/admin-page'
import { getSessionUser } from '@/lib/session'
import { isStaff } from '@/lib/acl'

export default async function Admin() {
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/admin')
  if (!isStaff(user.role)) redirect('/forbidden')
  return <AdminPage />
}
