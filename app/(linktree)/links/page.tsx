import type { Metadata } from 'next'
import { LinktreePagina } from '@/components/linktree/linktree-pagina'
import { cargarConfig } from '@/lib/linktree/store'

// Public page: no session is read, so it renders for anyone. It stays dynamic
// because the admin edits the content at runtime.
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
  return <LinktreePagina config={await cargarConfig()} />
}
