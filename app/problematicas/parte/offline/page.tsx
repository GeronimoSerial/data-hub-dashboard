import type { Metadata } from 'next'
import { PantallaParteOffline } from '@/components/infraestructura/offline/pantalla-parte-offline'
import { TITULO_PROGRAMA_COMPLETO } from '@/components/infraestructura/encabezado-parte'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: `Continuar sin conexión · ${TITULO_PROGRAMA_COMPLETO}`,
}

/** Static shell only. Flow data is read by the client from the shared IndexedDB database. */
export default function ParteOfflinePage() {
  return <PantallaParteOffline />
}
