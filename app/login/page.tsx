'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  makeStyles,
  tokens,
  typographyStyles,
  Button,
  Caption1,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Title3,
} from '@fluentui/react-components'
import { authClient } from '@/lib/auth-client'

const useStyles = makeStyles({
  wrap: {
    display: 'flex',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXXL,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  intro: {
    color: tokens.colorNeutralForeground2,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  title: {
    ...typographyStyles.subtitle1,
  },
})

function callbackUrlFromSearch(raw: string | null) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

function LoginForm() {
  const styles = useStyles()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(false)
    setPending(true)
    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    })
    setPending(false)
    if (signInError) {
      setError(true)
      return
    }
    router.replace(callbackUrlFromSearch(searchParams.get('callbackUrl')))
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Title3 className={styles.title}>Iniciar sesión</Title3>
          <Caption1 className={styles.intro}>
            Ingrese con la cuenta asignada por administración.
          </Caption1>
        </div>
        {error ? (
          <MessageBar intent="error">
            <MessageBarBody>No se pudo iniciar sesión</MessageBarBody>
          </MessageBar>
        ) : null}
        <form className={styles.form} onSubmit={onSubmit}>
          <Field label="Correo" required>
            <Input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(_, data) => setEmail(data.value)}
            />
          </Field>
          <Field label="Contraseña" required>
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(_, data) => setPassword(data.value)}
            />
          </Field>
          <Button type="submit" appearance="primary" disabled={pending}>
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
