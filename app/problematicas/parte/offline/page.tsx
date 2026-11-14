import type { Metadata } from 'next'
import { PantallaParteOffline } from '@/components/infraestructura/offline/pantalla-parte-offline'
import { textosActuales } from '@/lib/i18n'

export const dynamic = 'force-static'

const t = textosActuales().parteResto

export const metadata: Metadata = {
  title: `${t.pantallas.reporteSinConexion} · ${t.encabezado.programaCompleto}`,
}

/** Static shell only. Flow data is read by the client from the shared IndexedDB database. */
export default function ParteOfflinePage() {
  return <PantallaParteOffline />
}
