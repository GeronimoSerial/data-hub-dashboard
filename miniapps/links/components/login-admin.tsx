'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Cinta } from './cinta'
import type { BasePath } from '../lib/host'
import styles from './links.module.css'

export function LoginAdmin({ basePath = '/links' }: { basePath?: BasePath }) {
  const router = useRouter()
  const [usuario, setUsuario] = React.useState('')
  const [clave, setClave] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault()
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`${basePath}/api/sesion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, clave }),
      })
      if (res.ok) {
        router.refresh()
        return
      }
      const data = (await res.json().catch(() => null)) as { error?: unknown } | null
      setError(typeof data?.error === 'string' ? data.error : 'No se pudo ingresar.')
    } catch {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className={styles.pagina}>
      <Cinta />
      <main className={styles.principal}>
        <header className={styles.cabecera}>
          <a className={styles.volver} href={basePath}>
            <ArrowLeft size={16} aria-hidden /> Volver a la página
          </a>
          <h1 className={styles.titulo}>Administrar</h1>
        </header>

        {error ? <p role="alert" className="ui-messagebar ui-messagebar--error">{error}</p> : null}

        <form className={styles.formulario} onSubmit={enviar}>
          <Field name="usuario">
            <FieldLabel>Usuario</FieldLabel>
            <Input name="usuario" autoComplete="username" maxLength={200} value={usuario} onChange={(e) => setUsuario(e.currentTarget.value)} />
          </Field>
          <Field name="clave">
            <FieldLabel>Contraseña</FieldLabel>
            <Input name="clave" type="password" autoComplete="current-password" maxLength={500} value={clave} onChange={(e) => setClave(e.currentTarget.value)} />
          </Field>
          <div>
            <Button type="submit" disabled={!usuario || !clave || enviando}>Ingresar</Button>
          </div>
        </form>
      </main>
    </div>
  )
}
