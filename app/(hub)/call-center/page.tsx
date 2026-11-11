import { redirect } from 'next/navigation'
import { adminPageGate } from '@/lib/acl'
import { getSessionUser, getShellUser } from '@/lib/session'
import { ListaEscuelas } from '@/components/call-center/lista-escuelas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function CallCenterPage() {
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/call-center')
  if (gate === 'forbidden') redirect('/forbidden')
  const shell = await getShellUser()

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>Call center</h1>
        <p className="page-intro">Escuelas con el parte sin actualizar por más de 72 horas.</p>
      </header>
      <ListaEscuelas callerNombreInicial={shell?.name ?? ''} />
    </div>
  )
}
