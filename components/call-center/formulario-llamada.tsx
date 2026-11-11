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
    <section aria-label={`Llamadas de ${nombreEscuela}`} className="flex flex-col gap-6">
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="llamada-caller">Nombre de quien llama</Label>
          <Input
            id="llamada-caller"
            value={callerNombre}
            maxLength={LIMITES.callerNombre}
            onChange={(e) => setCallerNombre(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="llamada-justificacion">Por qué no se actualizó el parte</Label>
          <Textarea
            id="llamada-justificacion"
            value={justificacion}
            maxLength={LIMITES.justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
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

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Llamadas anteriores</h2>
        {errorHistorial ? (
          <p role="alert" className="ui-field__error">
            {errorHistorial}
          </p>
        ) : cargandoHistorial ? (
          <p className="text-sm text-muted">Cargando llamadas…</p>
        ) : llamadas.length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no hay llamadas registradas para esta escuela.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {llamadas.map((llamada) => (
              <li key={llamada.id} className="flex flex-col gap-1 border-b pb-3">
                <p className="text-sm text-muted">
                  {formatearFecha(llamada.creadaEn)} · {llamada.callerNombre}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Motivo: </span>
                  {llamada.justificacion}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Director: </span>
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
