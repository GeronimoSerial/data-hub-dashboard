'use client'

import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { ResourceExplanation } from '@/lib/explain-resource'

type Status = 'idle' | 'loading' | 'success' | 'unavailable' | 'insufficient-context' | 'error'

type ExplainResponse =
  | {
      status?: 'success' | 'insufficient-context'
      explanation?: ResourceExplanation
    }
  | {
      error?: { code?: string; message?: string }
    }

export function ExplainResource({ resourceId }: { resourceId: string }) {
  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = React.useState<Status>('idle')
  const [explanation, setExplanation] = React.useState<ResourceExplanation | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const requestIdRef = React.useRef(0)

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setStatus('idle')
      setExplanation(null)
      setMessage(null)
      return
    }
    const requestId = ++requestIdRef.current
    setStatus('loading')
    setMessage(null)
    fetch(`/api/recursos/${encodeURIComponent(resourceId)}/explain`, { method: 'POST' })
      .then(async (response) => {
        if (requestId !== requestIdRef.current) return null
        const body = (await response.json().catch(() => null)) as ExplainResponse | null
        if (!response.ok) {
          const code = body && 'error' in body ? body.error?.code : undefined
          if (code === 'ai_unavailable') {
            setStatus('unavailable')
            return null
          }
          setMessage(
            body && 'error' in body && body.error?.message
              ? body.error.message
              : 'No se pudo generar la explicación',
          )
          setStatus('error')
          return null
        }
        if (!body || !('explanation' in body) || !body.explanation) {
          setStatus('error')
          return null
        }
        if (body.status === 'insufficient-context') {
          setExplanation(body.explanation)
          setStatus('insufficient-context')
          return null
        }
        setExplanation(body.explanation)
        setStatus('success')
        return null
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setStatus('error')
      })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="secondary" />}><Sparkles size={16} /> Explícame este recurso</DialogTrigger>
      <DialogContent>
        <DialogTitle>¿Qué es este recurso?</DialogTitle>
        <DialogDescription>Una explicación breve basada únicamente en el contexto publicado.</DialogDescription>
        {status === 'loading' ? <p aria-live="polite">Preparando explicación…</p> : null}
        {status === 'unavailable' ? (
          <p role="alert" className="muted">
            El resumen con IA todavía no está configurado en este despliegue. Podés consultar el recurso igualmente.
          </p>
        ) : null}
        {status === 'insufficient-context' ? (
          <div className="explain-result" role="alert" aria-live="polite">
            <p>{explanation?.summary}</p>
          </div>
        ) : null}
        {status === 'error' ? (
          <p role="alert">{message ?? 'No se pudo generar la explicación. Podés consultar el recurso igualmente.'}</p>
        ) : null}
        {status === 'success' && explanation ? (
          <div className="explain-result">
            <p>{explanation.summary}</p>
            {explanation.usefulFor.length ? <><h3>Te puede servir para</h3><ul>{explanation.usefulFor.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
            {explanation.firstLook ? <><h3>Qué mirar primero</h3><p>{explanation.firstLook}</p></> : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}