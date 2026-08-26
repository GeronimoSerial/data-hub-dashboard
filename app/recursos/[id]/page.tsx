import { redirect, notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser } from '@/lib/session'
import { puedeAbrir } from '@/lib/acl'
import { loadRecursoAccess } from '@/lib/db/recurso-access'
import { RecursoViewer } from '@/components/recurso-viewer'

export const runtime = 'nodejs'

export default async function RecursoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await ensureSeeded()
  const { id } = await params
  const [row] = await getDb().select().from(recursos).where(eq(recursos.id, id))
  if (!row) notFound()
  const user = await getSessionUser()
  if (!user) redirect(`/login?callbackUrl=/recursos/${id}`)
  const access = await loadRecursoAccess(id)
  if (!access || !puedeAbrir(user, access)) redirect('/forbidden')
  if (row.ruta && !row.storageKey) redirect(row.ruta)
  return <RecursoViewer recurso={row} />
}
