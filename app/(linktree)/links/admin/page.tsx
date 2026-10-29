import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AgregarEnlace } from '@/components/linktree/agregar-enlace'
import { adminPageGate } from '@/lib/acl'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'Agregar enlace' },
  robots: { index: false, follow: false },
}

export default async function AgregarEnlacePage() {
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/links/admin')
  if (gate === 'forbidden') redirect('/forbidden')
  return <AgregarEnlace />
}
