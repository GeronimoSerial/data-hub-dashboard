'use client'

import * as React from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const LEGACY_IFRAME_SANDBOX = 'allow-scripts allow-forms allow-downloads'

type LegacyViewerProps = {
  src: string
  fallbackHref: string
  title: string
}

export function LegacyViewer({ src, fallbackHref, title }: LegacyViewerProps) {
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading')

  React.useEffect(() => {
    if (status !== 'loading') return
    const timeout = window.setTimeout(() => setStatus('error'), 15_000)
    return () => window.clearTimeout(timeout)
  }, [src, status])

  return (
    <section className="legacy-viewer" aria-label={`Visor: ${title}`} aria-busy={status === 'loading'}>
      <div className="legacy-viewer__toolbar">
        <div>
          <span className="eyebrow">Visor integrado</span>
          <h2>{title}</h2>
        </div>
        <Button render={<a href={fallbackHref} />} variant="secondary">
          Abrir en pantalla completa <ExternalLink size={16} aria-hidden />
        </Button>
      </div>
      {status === 'loading' ? (
        <p className="legacy-viewer__status" role="status">Cargando visor…</p>
      ) : null}
      {status === 'error' ? (
        <div className="legacy-viewer__error" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <p>No se pudo cargar el visor integrado. Podés abrirlo en pantalla completa.</p>
          <Button render={<a href={fallbackHref} />} variant="secondary">Abrir en pantalla completa</Button>
        </div>
      ) : null}
      <iframe
        className={`legacy-viewer__frame${status === 'error' ? ' legacy-viewer__frame--failed' : ''}`}
        src={src}
        title={title}
        sandbox={LEGACY_IFRAME_SANDBOX}
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
      />
    </section>
  )
}
