'use client'

import { archivoSrc, HTML_IFRAME_SANDBOX, viewerKind } from '@/lib/recurso-viewer'
import { Button } from '@/components/ui/button'

export function RecursoViewer({ recurso }: { recurso: { id: string; titulo: string; mime?: string | null } }) {
  const kind = viewerKind(recurso.mime)
  const src = archivoSrc(recurso.id)
  if (kind === 'html') {
    return <iframe className="resource-frame" sandbox={HTML_IFRAME_SANDBOX} src={src} title={recurso.titulo} />
  }
  if (kind === 'pdf') {
    return <iframe className="resource-frame" src={src} title={recurso.titulo} />
  }
  if (kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="resource-image" src={src} alt={recurso.titulo} />
  }
  return (
    <div className="empty-state resource-download">
      <p>Este archivo no se puede previsualizar en el navegador.</p>
      <Button render={<a href={archivoSrc(recurso.id, true)} />}>Descargar</Button>
    </div>
  )
}
