import type { Metadata } from 'next'
import { AdminEnlaces } from '@/miniapps/links/components/admin-enlaces'
import { LoginAdmin } from '@/miniapps/links/components/login-admin'
import { EstadoPagina } from '@/miniapps/links/components/estado-pagina'
import { esAdmin } from '@/miniapps/links/lib/admin'
import { leerCredenciales } from '@/miniapps/links/lib/sesion'
import { cargarConfig } from '@/miniapps/links/lib/store'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'Administrar enlaces' },
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  if (!leerCredenciales()) {
    return <EstadoPagina role="alert" titulo="La administración no está habilitada." detalle="Falta configurar el usuario y la contraseña del servidor." />
  }
  if (!(await esAdmin())) return <LoginAdmin />
  return <AdminEnlaces inicial={await cargarConfig()} />
}
