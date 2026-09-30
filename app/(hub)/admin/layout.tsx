import { AdminShell } from '@/components/admin-shell'
import { getSessionUser } from '@/lib/session'
import { riskEngineEnabled } from '@/lib/infraestructura/riesgo/flags'
import { episodiosDerivadosEnabled } from '@/lib/infraestructura/episodios-derivados/flags'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  return (
    <AdminShell
      role={user?.role ?? 'consulta'}
      flags={{
        riskEngineEnabled: riskEngineEnabled(),
        episodiosDerivadosEnabled: episodiosDerivadosEnabled(),
      }}
    >
      {children}
    </AdminShell>
  )
}
