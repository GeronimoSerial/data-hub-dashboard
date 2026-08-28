'use client'

import * as React from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ShareView({ url }: { url?: string } = {}) {
  const [copied, setCopied] = React.useState(false)
  const [error, setError] = React.useState(false)

  async function share() {
    const target = url ?? window.location.href
    setError(false)
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    try {
      if (canNativeShare) {
        await navigator.share({ title: document.title, url: target })
      } else {
        await navigator.clipboard.writeText(target)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // Cancelled native sharing is not an error; clipboard failures are reported.
      if (!canNativeShare) setError(true)
    }
  }

  return (
    <span className="share-action">
      <Button variant="ghost" onClick={() => void share()} aria-label={copied ? 'Enlace copiado' : 'Compartir este recurso'}>
        {copied ? <Check size={16} /> : typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? <Share2 size={16} /> : <Copy size={16} />}
        {copied ? 'Enlace copiado' : 'Compartir'}
      </Button>
      {error ? <span role="alert" className="muted">No se pudo copiar el enlace.</span> : null}
    </span>
  )
}
