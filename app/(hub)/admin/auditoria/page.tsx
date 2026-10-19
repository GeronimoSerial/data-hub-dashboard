import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { AuditoriaVisor } from '@/components/infraestructura/auditoria-visor'

export const dynamic = 'force-dynamic'

export default async function AuditoriaAdmin() {
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/admin/auditoria')
  if (user.banned || user.role !== 'admin') redirect('/forbidden')
  return <AuditoriaVisor />
}
