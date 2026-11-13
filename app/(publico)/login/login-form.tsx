'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { useTextos } from '@/lib/i18n/idioma-provider'

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter()
  const t = useTextos().shellHub.login
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setPending(true)
    const { error: signInError } = await authClient.signIn.email({ email, password })
    setPending(false)
    if (signInError) {
      setError(t.errorCredenciales)
      return
    }
    const query = callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''
    router.replace(`/login/continue${query}`)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="page-title page-title--sm">{t.titulo}</h1>
          <p className="auth-intro">{t.intro}</p>
        </div>
        {error ? <p role="alert" className="ui-messagebar ui-messagebar--error">{error}</p> : null}
        <form className="auth-form" onSubmit={onSubmit}>
          <Field name="email">
            <FieldLabel>{t.correo}</FieldLabel>
            <Input type="email" name="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
            <FieldError />
          </Field>
          <Field name="password">
            <FieldLabel>{t.contrasena}</FieldLabel>
            <Input type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
            <FieldError />
          </Field>
          <Button type="submit" disabled={pending}>{t.ingresar}</Button>
        </form>
      </div>
    </div>
  )
}
