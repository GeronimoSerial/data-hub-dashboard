'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

export function AccountActions() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  async function logout() {
    setPending(true)
    setError(false)
    try {
      const result = await authClient.signOut()
      if (result.error) {
        setError(true)
        setPending(false)
        return
      }
      router.replace('/login')
    } catch {
      setError(true)
      setPending(false)
    }
  }

  return <>
    {error ? <p role="alert" className="ui-messagebar ui-messagebar--error">No se pudo cerrar la sesión. Intente nuevamente.</p> : null}
    <Button variant="ghost" onClick={logout} disabled={pending}>{pending ? 'Cerrando sesión…' : 'Cerrar sesión'}</Button>
  </>
}
