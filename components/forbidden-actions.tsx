'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

// The forbidden page offers a real "volver" (previous page) instead of a link
// back to the denied target, which would loop, and a change-account action
// that actually signs out before opening the login callback.
export function ForbiddenActions({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter()
  const [switching, setSwitching] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  const onChangeAccount = async () => {
    setSwitching(true)
    setFailed(false)
    try {
      await authClient.signOut()
      router.replace(callbackUrl)
    } catch {
      setFailed(true)
      setSwitching(false)
    }
  }

  return (
    <div className="auth-form">
      {failed ? (
        <p role="alert" className="ui-messagebar ui-messagebar--error">
          No se pudo cambiar de cuenta.
        </p>
      ) : null}
      <button
        className="ui-button ui-button--default"
        type="button"
        onClick={() => router.back()}
      >
        Volver
      </button>
      <Link className="ui-button ui-button--secondary" href="/explorar">
        Ir al catálogo
      </Link>
      <button
        className="ui-button ui-button--ghost"
        type="button"
        onClick={onChangeAccount}
        disabled={switching}
        aria-busy={switching}
      >
        {switching ? 'Cambiando de cuenta…' : 'Cambiar de cuenta'}
      </button>
    </div>
  )
}