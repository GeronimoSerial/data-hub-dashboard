'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'

// Alta de un episodio del batch E1 (protocolo ENOS). El período es único en
// esta etapa y lo fija el servidor que monta el formulario; acá sólo se piden
// nombre y descripción. La mutación va por fetch al endpoint ya construido:
// el proyecto no usa server actions.
const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.25rem' }
const input: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 4,
  padding: '0.4rem 0.5rem',
  color: 'var(--ink)',
  background: 'var(--card)',
}
const boton: React.CSSProperties = {
  border: '1px solid var(--action)',
  borderRadius: 4,
  padding: '0.5rem 1rem',
  background: 'var(--action)',
  color: 'var(--white)',
  cursor: 'pointer',
  alignSelf: 'flex-start',
}
const alerta: React.CSSProperties = {
  color: 'var(--danger)',
  background: 'var(--danger-tint)',
  padding: '0.5rem 0.75rem',
  borderRadius: 4,
}

export function EpisodioCrearForm({ periodoId }: { periodoId: string }) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nombreValido = nombre.trim().length > 0

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando || !nombreValido) return
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetch('/api/infraestructura/episodios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodoId,
          nombre: nombre.trim(),
          ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        }),
      })
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => null)
        setError(cuerpo?.error ?? 'No se pudo crear el episodio.')
        setEnviando(false)
        return
      }
      setNombre('')
      setDescripcion('')
      setEnviando(false)
      // Mismo patrón que AccesoForm: refresh vuelve a renderizar el server
      // component de la lista, que ahora incluye el episodio nuevo.
      router.refresh()
    } catch {
      setError('No se pudo crear el episodio.')
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={manejarEnvio} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={campo}>
        <label htmlFor="episodio-nombre">Nombre</label>
        <input
          id="episodio-nombre"
          type="text"
          style={input}
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          disabled={enviando}
        />
      </div>

      <div style={campo}>
        <label htmlFor="episodio-descripcion">Descripción (opcional)</label>
        <input
          id="episodio-descripcion"
          type="text"
          style={input}
          value={descripcion}
          onChange={(evento) => setDescripcion(evento.target.value)}
          disabled={enviando}
        />
      </div>

      {error && (
        <p role="alert" style={alerta}>
          {error}
        </p>
      )}

      <button type="submit" style={boton} disabled={enviando || !nombreValido}>
        Crear episodio
      </button>
    </form>
  )
}
