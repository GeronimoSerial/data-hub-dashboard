import { notFound, redirect } from 'next/navigation'
import { AdminSectionView } from '@/components/admin/admin-section-view'
import { adminSection } from '@/components/admin/sections'
import { adminPageGate } from '@/lib/acl'
import { getSessionUser } from '@/lib/session'

export default async function AdminSeccion({ params }: { params: Promise<{ seccion: string }> }) {
  const { seccion } = await params
  const meta = adminSection(seccion)
  if (!meta) notFound()
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect(`/login?callbackUrl=/admin/${meta.slug}`)
  if (gate === 'forbidden') redirect('/forbidden')
  if (meta.adminOnly && user!.role !== 'admin') redirect('/admin/recursos')
  return <AdminSectionView slug={meta.slug} />
}
