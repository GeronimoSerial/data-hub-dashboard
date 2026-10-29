import type { Metadata } from 'next'
import { LinksPagina } from '@/miniapps/links/components/links-pagina'
import { cargarConfig } from '@/miniapps/links/lib/store'

// Public page: no session is read. It stays dynamic because the admin edits the content at runtime.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const config = await cargarConfig()
  const description = config.subtitulo || undefined
  return {
    title: { absolute: config.titulo },
    description,
    openGraph: { title: config.titulo, description },
  }
}

export default async function LinksPage() {
  return <LinksPagina config={await cargarConfig()} />
}
