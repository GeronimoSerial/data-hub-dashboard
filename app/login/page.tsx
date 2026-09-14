'use client'

import * as React from 'react'
import Link from 'next/link'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { normalizeLoginCallbackUrl } from '@/lib/nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const rawCallback = searchParams.get('callbackUrl')
  const callbackUrl = normalizeLoginCallbackUrl(rawCallback)
  // A safe internal destination lets the user cancel without losing the deep
  // link; otherwise cancellation returns home.
  const cancelHref = rawCallback ? callbackUrl : '/'

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return
    setError(null)
    setPending(true)
    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    })
    if (signInError) {
      setError('No se pudo iniciar sesión')
      setPending(false)
      return
    }
    router.replace(callbackUrl)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="page-title page-title--sm">Iniciar sesión</h1>
          <p className="auth-intro">
            Ingrese con la cuenta asignada por administración.
          </p>
        </div>
        {error ? (
          <p role="alert" aria-live="assertive" className="ui-messagebar ui-messagebar--error">
            {error}
          </p>
        ) : null}
        <form className="auth-form" onSubmit={onSubmit} aria-busy={pending}>
          <Field name="email">
            <FieldLabel>Correo</FieldLabel>
            <Input
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <FieldError />
          </Field>
          <Field name="password">
            <FieldLabel>Contraseña</FieldLabel>
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <FieldError />
          </Field>
          <div className="auth-form__actions">
            <Button type="submit" disabled={pending} aria-live="polite">
              {pending ? 'Ingresando…' : 'Iniciar sesión'}
            </Button>
            <Link
              className="ui-button ui-button--ghost"
              href={cancelHref}
              tabIndex={pending ? -1 : 0}
              aria-disabled={pending}
            >
              Cancelar y volver
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}