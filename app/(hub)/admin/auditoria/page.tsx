import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { AuditoriaVisor } from '@/components/infraestructura/auditoria-visor'
import { regionActiva } from '@/lib/infraestructura/region'
import { idiomaEfectivo } from '@/lib/i18n/idioma'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'

export const dynamic = 'force-dynamic'

// Solo admin. La carga del historial ocurre en el cliente, al abrir la pantalla:
// esta página no consulta la auditoría en el servidor.
export default async function AuditoriaAdmin() {
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/admin/auditoria')
  if (user.banned || user.role !== 'admin') redirect('/forbidden')
  const idioma = idiomaEfectivo({ preferencia: user.idioma, region: regionActiva() })
  return (
    <IdiomaProvider idioma={idioma}>
      <AuditoriaVisor />
    </IdiomaProvider>
  )
}
