'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// Copia de LIMITES_LLAMADA (lib/call-center/llamadas.ts): ese módulo importa la
// base de datos y no puede entrar en código de cliente.
const LIMITES = {
  callerNombre: 120,
  justificacion: 2000,
  respuestaDirector: 2000,
} as const

const MENSAJE_ERROR_GENERICO = 'No se pudo guardar la llamada. Intentá de nuevo.'
const MENSAJE_ERROR_HISTORIAL = 'No se pudo cargar el historial de llamadas.'

type LlamadaRegistrada = {
  id: string
  callerNombre: string
  justificacion: string
  respuestaDirector: string
  creadaEn: string
}

export type FormularioLlamadaProps = {
  cueAnexo: string
  nombreEscuela: string
  callerNombreInicial: string
  onGuardada: () => void
}

function formatearFecha(valor: string): string {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  return fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

async function leerError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' && body.error ? body.error : MENSAJE_ERROR_GENERICO
}

type HistorialResultado =
  | { ok: true; llamadas: LlamadaRegistrada[] }
  | { ok: false; error: string }

async function pedirHistorial(cueAnexo: string): Promise<HistorialResultado> {
  try {
    const response = await fetch('/api/call-center/llamadas?cue=' + encodeURIComponent(cueAnexo))
    if (!response.ok) return { ok: false, error: await leerError(response) }
    const body = (await response.json()) as { llamadas: LlamadaRegistrada[] }
    return { ok: true, llamadas: body.llamadas }
  } catch {
    return { ok: false, error: MENSAJE_ERROR_HISTORIAL }
  }
}

export function FormularioLlamada({
  cueAnexo,
  nombreEscuela,
  callerNombreInicial,
  onGuardada,
}: FormularioLlamadaProps) {
  const [callerNombre, setCallerNombre] = useState(callerNombreInicial)
  const [justificacion, setJustificacion] = useState('')
  const [respuestaDirector, setRespuestaDirector] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [llamadas, setLlamadas] = useState<LlamadaRegistrada[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(true)
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null)

  const aplicarHistorial = useCallback((resultado: HistorialResultado) => {
    if (resultado.ok) {
      setErrorHistorial(null)
      setLlamadas(resultado.llamadas)
    } else {
      setErrorHistorial(resultado.error)
    }
    setCargandoHistorial(false)
  }, [])

  useEffect(() => {
    let cancelado = false
    void pedirHistorial(cueAnexo).then((resultado) => {
      if (!cancelado) aplicarHistorial(resultado)
    })
    return () => {
      cancelado = true
    }
  }, [cueAnexo, aplicarHistorial])

  // Con nombre de sesión el campo queda fijo; sin nombre, el operador debe poder escribirlo.
  const nombreBloqueado = callerNombreInicial.trim() !== ''

  const camposCompletos =
    callerNombre.trim() !== '' && justificacion.trim() !== '' && respuestaDirector.trim() !== ''

  async function guardar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enviando || !camposCompletos) return
    setEnviando(true)
    setErrorEnvio(null)
    try {
      const response = await fetch('/api/call-center/llamadas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cueAnexo,
          callerNombre: callerNombre.trim(),
          justificacion: justificacion.trim(),
          respuestaDirector: respuestaDirector.trim(),
        }),
      })
      if (response.status !== 201) {
        setErrorEnvio(await leerError(response))
        return
      }
      setJustificacion('')
      setRespuestaDirector('')
      setCargandoHistorial(true)
      aplicarHistorial(await pedirHistorial(cueAnexo))
      onGuardada()
    } catch {
      setErrorEnvio(MENSAJE_ERROR_GENERICO)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section aria-label={`Llamadas de ${nombreEscuela}`} style={{ display: 'grid', gap: 'var(--s-6, 2rem)' }}>
      <form onSubmit={guardar} style={{ display: 'grid', gap: 'var(--s-4)' }}>
        <div style={{ display: 'grid', gap: 'var(--s-1)' }}>
          <Label htmlFor="llamada-caller">Nombre de quien llama</Label>
          <Input
            id="llamada-caller"
            value={callerNombre}
            maxLength={LIMITES.callerNombre}
            disabled={nombreBloqueado}
            onChange={(e) => setCallerNombre(e.target.value)}
          />
        </div>
        <div style={{ display: 'grid', gap: 'var(--s-1)' }}>
          <Label htmlFor="llamada-justificacion">Por qué no se actualizó el parte</Label>
          <Textarea
            id="llamada-justificacion"
            value={justificacion}
            maxLength={LIMITES.justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
          />
        </div>
        <div style={{ display: 'grid', gap: 'var(--s-1)' }}>
          <Label htmlFor="llamada-director">Qué dijo el director</Label>
          <Textarea
            id="llamada-director"
            value={respuestaDirector}
            maxLength={LIMITES.respuestaDirector}
            onChange={(e) => setRespuestaDirector(e.target.value)}
          />
        </div>
        {errorEnvio ? (
          <p role="alert" className="ui-field__error">
            {errorEnvio}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={enviando || !camposCompletos}>
            Guardar llamada
          </Button>
        </div>
      </form>

      <div style={{ display: 'grid', gap: 'var(--s-3)', paddingTop: 'var(--s-5)', borderTop: '1px solid var(--line)' }}>
        <h2 style={{ fontSize: 'var(--t-h3)', margin: 0 }}>Llamadas anteriores</h2>
        {errorHistorial ? (
          <p role="alert" className="ui-field__error">
            {errorHistorial}
          </p>
        ) : cargandoHistorial ? (
          <p className="ui-hint">Cargando llamadas…</p>
        ) : llamadas.length === 0 ? (
          <p className="ui-hint">
            Todavía no hay llamadas registradas para esta escuela.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-3)' }}>
            {llamadas.map((llamada) => (
              <li key={llamada.id} style={{ display: 'grid', gap: 'var(--s-1)', paddingBottom: 'var(--s-3)', borderBottom: '1px solid var(--line)' }}>
                <p className="ui-hint">
                  {formatearFecha(llamada.creadaEn)} · {llamada.callerNombre}
                </p>
                <p style={{ fontSize: 'var(--t-small)', margin: 0 }}>
                  <span style={{ fontWeight: 600 }}>Motivo: </span>
                  {llamada.justificacion}
                </p>
                <p style={{ fontSize: 'var(--t-small)', margin: 0 }}>
                  <span style={{ fontWeight: 600 }}>Director: </span>
                  {llamada.respuestaDirector}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
