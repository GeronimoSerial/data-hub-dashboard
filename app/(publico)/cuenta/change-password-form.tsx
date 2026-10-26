'use client'

import * as React from 'react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import Link from 'next/link'

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmation, setConfirmation] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = React.useState(false)
  const [success, setSuccess] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSessionExpired(false)
    setSuccess(false)
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmation) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }
    setPending(true)
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      if (result.error) {
        setSessionExpired(result.error.status === 401)
        setError(result.error.status === 401
          ? 'La sesión venció.'
          : 'No se pudo cambiar la contraseña. Verifique la contraseña actual e intente nuevamente.')
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      setSuccess(true)
    } catch {
      setError('No se pudo cambiar la contraseña. Intente nuevamente.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <p className="auth-intro">La contraseña asignada por administración sigue vigente hasta que usted la cambie.</p>
      {error ? <p role="alert" className="ui-messagebar ui-messagebar--error">{error}</p> : null}
      {sessionExpired ? <Link href="/login">Iniciar sesión</Link> : null}
      {success ? <p role="status" className="ui-messagebar">La contraseña se cambió. Esta sesión continúa activa y las demás sesiones se cerraron.</p> : null}
      <form className="auth-form" onSubmit={onSubmit}>
        <Field name="currentPassword">
          <FieldLabel>Contraseña actual</FieldLabel>
          <Input type="password" name="currentPassword" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.currentTarget.value)} />
          <FieldError />
        </Field>
        <Field name="newPassword">
          <FieldLabel>Nueva contraseña</FieldLabel>
          <Input type="password" name="newPassword" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.currentTarget.value)} />
          <FieldError />
        </Field>
        <Field name="confirmation">
          <FieldLabel>Repita la nueva contraseña</FieldLabel>
          <Input type="password" name="confirmation" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} />
          <FieldError />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? 'Cambiando contraseña…' : 'Cambiar contraseña'}</Button>
      </form>
    </>
  )
}
