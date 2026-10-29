'use client'

import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { LIMITES, urlSegura } from '@/lib/linktree/config'
import styles from './linktree-pagina.module.css'

type Resultado = { tono: 'ok' | 'error'; texto: string } | null

export function AgregarEnlace() {
  const [url, setUrl] = React.useState('')
  const [descripcion, setDescripcion] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)
  const [resultado, setResultado] = React.useState<Resultado>(null)

  const urlLimpia = url.trim()
  const urlInvalida = urlLimpia.length > 0 && !urlSegura(urlLimpia)
  const valido = urlSegura(urlLimpia) && descripcion.trim().length > 0

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!valido || enviando) return
    setEnviando(true)
    setResultado(null)
    try {
      const res = await fetch('/api/linktree/enlaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlLimpia, descripcion: descripcion.trim() }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null
        setResultado({ tono: 'error', texto: typeof data?.error === 'string' ? data.error : 'No se pudo agregar el enlace.' })
        return
      }
      setUrl('')
      setDescripcion('')
      setResultado({ tono: 'ok', texto: 'Enlace agregado.' })
    } catch {
      setResultado({ tono: 'error', texto: 'No se pudo conectar. Revisá tu conexión e intentá de nuevo.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className={styles.pagina}>
      <div className="app-ribbon" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <main className={styles.principal}>
        <header className={styles.cabecera}>
          <a className={styles.volver} href="/links">
            <ArrowLeft size={16} aria-hidden /> Volver a la página
          </a>
          <h1 className={styles.titulo}>Agregar un enlace</h1>
          <p className={styles.subtitulo}>Se publica al final de la lista, en la página pública.</p>
        </header>

        {resultado?.tono === 'error' ? (
          <p role="alert" className="ui-messagebar ui-messagebar--error">{resultado.texto}</p>
        ) : null}
        {resultado?.tono === 'ok' ? (
          <p role="status" className="ui-messagebar ui-messagebar--info">
            Enlace agregado. <a href="/links">Ver la página</a>
          </p>
        ) : null}

        <form className={styles.formulario} onSubmit={enviar}>
          <Field name="url">
            <FieldLabel>Enlace</FieldLabel>
            <Input
              name="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              maxLength={LIMITES.url}
              value={url}
              onChange={(event) => setUrl(event.currentTarget.value)}
            />
            <FieldError match={urlInvalida}>Ingresá una URL que empiece con http://, https:// o /.</FieldError>
          </Field>
          <Field name="descripcion">
            <FieldLabel>Descripción</FieldLabel>
            <Input
              name="descripcion"
              autoComplete="off"
              maxLength={LIMITES.titulo}
              value={descripcion}
              onChange={(event) => setDescripcion(event.currentTarget.value)}
            />
          </Field>
          <div>
            <Button type="submit" disabled={!valido || enviando}>Agregar enlace</Button>
          </div>
        </form>
      </main>
    </div>
  )
}
