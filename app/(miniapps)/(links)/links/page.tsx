import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { moduloDeRutaHabilitado } from '@/lib/infraestructura/region/modulos'
import { obtenerBasePath } from '@/miniapps/links/lib/base-path'
import { LINKS_URL } from '@/miniapps/links/lib/host'
import { LinksPagina } from '@/miniapps/links/components/links-pagina'
import { cargarConfig } from '@/miniapps/links/lib/store'

// Public page: no session is read. It stays dynamic because the admin edits the content at runtime.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const config = await cargarConfig()
  const description = config.subtitulo || undefined
  return {
    metadataBase: new URL(LINKS_URL),
    alternates: { canonical: LINKS_URL },
    title: { absolute: config.titulo },
    description,
    openGraph: { url: LINKS_URL, title: config.titulo, description },
  }
}

export default async function LinksPage() {
  if (!moduloDeRutaHabilitado('/links')) notFound()
  return <LinksPagina config={await cargarConfig()} basePath={await obtenerBasePath()} />
}
