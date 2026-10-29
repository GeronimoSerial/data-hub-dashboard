'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { LIMITES, urlSegura, type Enlace, type LinksConfig } from '@/miniapps/links/lib/config'
import { Cinta } from './cinta'
import styles from './links.module.css'

type Resultado = { tono: 'ok' | 'error'; texto: string } | null

const nuevoId = () => crypto.randomUUID()

function mover<T>(lista: T[], indice: number, delta: -1 | 1) {
  const destino = indice + delta
  if (destino < 0 || destino >= lista.length) return lista
  const copia = [...lista]
  ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
  return copia
}

function EditorEnlace({ inicial, onGuardar, onCerrar }: { inicial: Enlace | null; onGuardar: (enlace: Enlace) => void; onCerrar: () => void }) {
  const [titulo, setTitulo] = React.useState(inicial?.titulo ?? '')
  const [descripcion, setDescripcion] = React.useState(inicial?.descripcion ?? '')
  const [url, setUrl] = React.useState(inicial?.url ?? '')

  const urlLimpia = url.trim()
  const urlInvalida = urlLimpia.length > 0 && !urlSegura(urlLimpia)
  const valido = titulo.trim().length > 0 && urlSegura(urlLimpia)

  const enviar = (event: React.FormEvent) => {
    event.preventDefault()
    if (!valido) return
    onGuardar({ id: inicial?.id ?? nuevoId(), titulo: titulo.trim(), descripcion: descripcion.trim(), url: urlLimpia })
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent>
        <DialogTitle>{inicial ? 'Editar enlace' : 'Agregar enlace'}</DialogTitle>
        <form className={styles.formulario} onSubmit={enviar}>
          <Field name="titulo">
            <FieldLabel>Título</FieldLabel>
            <Input name="titulo" autoComplete="off" maxLength={LIMITES.enlaceTitulo} value={titulo} onChange={(e) => setTitulo(e.currentTarget.value)} />
          </Field>
          <Field name="descripcion">
            <FieldLabel>Descripción</FieldLabel>
            <Input name="descripcion" autoComplete="off" maxLength={LIMITES.descripcion} value={descripcion} onChange={(e) => setDescripcion(e.currentTarget.value)} />
          </Field>
          <Field name="url">
            <FieldLabel>Enlace</FieldLabel>
            <Input name="url" inputMode="url" autoComplete="off" placeholder="https://" maxLength={LIMITES.url} value={url} onChange={(e) => setUrl(e.currentTarget.value)} />
            <FieldError match={urlInvalida}>Ingresá una URL que empiece con http:// o https://.</FieldError>
          </Field>
          <div className="ui-dialog-actions">
            <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" disabled={!valido}>{inicial ? 'Aplicar' : 'Agregar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AdminEnlaces({ inicial }: { inicial: LinksConfig }) {
  const router = useRouter()
  const [guardado, setGuardado] = React.useState(inicial)
  const [borrador, setBorrador] = React.useState(inicial)
  const [editando, setEditando] = React.useState<Enlace | 'nuevo' | null>(null)
  const [guardando, setGuardando] = React.useState(false)
  const [resultado, setResultado] = React.useState<Resultado>(null)

  const sucio = JSON.stringify(borrador) !== JSON.stringify(guardado)
  const tituloValido = borrador.titulo.trim().length > 0

  const guardarEnlace = (enlace: Enlace) => {
    setBorrador((actual) => {
      const existe = actual.enlaces.some((e) => e.id === enlace.id)
      return { ...actual, enlaces: existe ? actual.enlaces.map((e) => (e.id === enlace.id ? enlace : e)) : [...actual.enlaces, enlace] }
    })
    setEditando(null)
  }

  const guardar = async () => {
    if (!sucio || !tituloValido || guardando) return
    setGuardando(true)
    setResultado(null)
    try {
      const res = await fetch('/links/api/contenido', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(borrador),
      })
      if (res.status === 401) {
        router.refresh()
        return
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null
        setResultado({ tono: 'error', texto: typeof data?.error === 'string' ? data.error : 'No se pudo guardar.' })
        return
      }
      setGuardado(borrador)
      setResultado({ tono: 'ok', texto: 'Cambios guardados.' })
    } catch {
      setResultado({ tono: 'error', texto: 'No se pudo conectar. Revisá tu conexión e intentá de nuevo.' })
    } finally {
      setGuardando(false)
    }
  }

  const salir = async () => {
    await fetch('/links/api/sesion', { method: 'DELETE' }).catch(() => null)
    router.refresh()
  }

  const enlaces = borrador.enlaces
  return (
    <div className={styles.pagina}>
      <Cinta />
      <main className={styles.principal}>
        <header className={styles.cabecera}>
          <div className={styles.barraAdmin}>
            <a className={styles.volver} href="/links">
              <ArrowLeft size={16} aria-hidden /> Ver la página
            </a>
            <Button variant="ghost" size="sm" onClick={salir}>Salir</Button>
          </div>
          <h1 className={styles.titulo}>Administrar</h1>
        </header>

        {resultado?.tono === 'error' ? <p role="alert" className="ui-messagebar ui-messagebar--error">{resultado.texto}</p> : null}
        {resultado?.tono === 'ok' ? <p role="status" className="ui-messagebar ui-messagebar--info">{resultado.texto}</p> : null}

        <section className={styles.seccion} aria-labelledby="sec-pagina">
          <h2 className={styles.seccionTitulo} id="sec-pagina">Página</h2>
          <div className={styles.formulario}>
            <Field name="pagina-titulo">
              <FieldLabel>Título</FieldLabel>
              <Input maxLength={LIMITES.titulo} value={borrador.titulo} onChange={(e) => setBorrador({ ...borrador, titulo: e.currentTarget.value })} />
            </Field>
            <Field name="pagina-subtitulo">
              <FieldLabel>Descripción</FieldLabel>
              <Input maxLength={LIMITES.subtitulo} value={borrador.subtitulo} onChange={(e) => setBorrador({ ...borrador, subtitulo: e.currentTarget.value })} />
            </Field>
          </div>
        </section>

        <section className={styles.seccion} aria-labelledby="sec-enlaces">
          <div className={styles.cabeceraSeccion}>
            <h2 className={styles.seccionTitulo} id="sec-enlaces">Enlaces</h2>
            <Button size="sm" onClick={() => setEditando('nuevo')} disabled={enlaces.length >= LIMITES.enlaces}>
              <Plus size={16} aria-hidden /> Agregar enlace
            </Button>
          </div>
          {enlaces.length === 0 ? (
            <p className={styles.pendiente}>Todavía no cargaste enlaces.</p>
          ) : (
            <ul className={styles.lista}>
              {enlaces.map((enlace, indice) => (
                <li key={enlace.id} className={`${styles.item} ${styles.filaAdmin}`}>
                  <span className={styles.texto}>
                    <span className={styles.nombre}>{enlace.titulo}</span>
                    {enlace.descripcion ? <span className={styles.descripcion}>{enlace.descripcion}</span> : null}
                    <span className={styles.dominio}>{enlace.url}</span>
                  </span>
                  <span className={styles.acciones}>
                    <Button variant="ghost" size="icon" aria-label={`Subir ${enlace.titulo}`} disabled={indice === 0} onClick={() => setBorrador({ ...borrador, enlaces: mover(enlaces, indice, -1) })}>
                      <ArrowUp size={16} aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Bajar ${enlace.titulo}`} disabled={indice === enlaces.length - 1} onClick={() => setBorrador({ ...borrador, enlaces: mover(enlaces, indice, 1) })}>
                      <ArrowDown size={16} aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Editar ${enlace.titulo}`} onClick={() => setEditando(enlace)}>
                      <Pencil size={16} aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Eliminar ${enlace.titulo}`} onClick={() => setBorrador({ ...borrador, enlaces: enlaces.filter((e) => e.id !== enlace.id) })}>
                      <Trash2 size={16} aria-hidden />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={styles.guardar}>
          <Button onClick={guardar} disabled={!sucio || !tituloValido || guardando}>Guardar cambios</Button>
          {sucio ? <span className={styles.pendiente}>Hay cambios sin guardar.</span> : null}
        </div>
      </main>

      {editando ? (
        <EditorEnlace inicial={editando === 'nuevo' ? null : editando} onGuardar={guardarEnlace} onCerrar={() => setEditando(null)} />
      ) : null}
    </div>
  )
}
