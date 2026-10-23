import { AdminShell } from '@/components/admin-shell'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { redirect } from 'next/navigation'
import { riskEngineEnabled } from '@/lib/infraestructura/riesgo/flags'
import { episodiosDerivadosEnabled } from '@/lib/infraestructura/episodios-derivados/flags'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin')
  if (gate === 'forbidden') redirect('/forbidden')
  return (
    <AdminShell
      role={user!.role}
      hubPolicy={user!.hubPolicy!}
      flags={{
        riskEngineEnabled: riskEngineEnabled(),
        episodiosDerivadosEnabled: episodiosDerivadosEnabled(),
      }}
    >
      {children}
    </AdminShell>
  )
}
