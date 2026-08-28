'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'

function callbackUrlFromSearch(raw: string | null) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    })
    setPending(false)
    if (signInError) {
      setError('No se pudo iniciar sesión')
      return
    }
    router.replace(callbackUrlFromSearch(searchParams.get('callbackUrl')))
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
          <p role="alert" className="ui-messagebar ui-messagebar--error">
            {error}
          </p>
        ) : null}
        <form className="auth-form" onSubmit={onSubmit}>
          <Field name="email">
            <FieldLabel>Correo</FieldLabel>
            <Input
              type="email"
              name="email"
              autoComplete="username"
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
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <FieldError />
          </Field>
          <Button type="submit" disabled={pending}>
            Iniciar sesión
          </Button>
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