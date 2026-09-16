'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { SeccionesSelector } from '@/components/infraestructura/secciones-selector'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MOTIVOS, SEVERIDADES } from '@/lib/infraestructura/validacion'

export interface FormularioProblematicaProps {
  cue: string
  escuelaNombre: string
  turnos: TurnoContexto[]
}

interface ImpactoResultado {
  alumnos: number
  secciones: number
  seccionesIrresolubles: number
  calculoIncompleto: boolean
  cues: number
  cuis: number | null
  cuiDisponible: boolean
}

interface ResultadoConfirmado {
  id: string
  impacto: ImpactoResultado
}

export function FormularioProblematica({ cue, escuelaNombre, turnos }: FormularioProblematicaProps) {
  const [motivo, setMotivo] = useState('')
  const [severidad, setSeveridad] = useState('')
  const [seccionesSeleccionadas, setSeccionesSeleccionadas] = useState<number[]>([])
  const [descripcion, setDescripcion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [impactoPreliminar, setImpactoPreliminar] = useState<ImpactoResultado | null>(null)
  const [resultadoConfirmado, setResultadoConfirmado] = useState<ResultadoConfirmado | null>(null)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const enviandoRef = useRef(false)

  useEffect(() => {
    let activo = true
    const controlador = new AbortController()
    if (seccionesSeleccionadas.length === 0) {
      queueMicrotask(() => {
        if (activo) setImpactoPreliminar(null)
      })
      return () => {
        activo = false
      }
    }
    async function consultarImpacto() {
      try {
        const respuesta = await fetch('/api/problematicas/impacto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cue, secciones: seccionesSeleccionadas }),
          signal: controlador.signal,
        })
        if (!activo) return
        if (respuesta.status === 200) {
          const datos = await respuesta.json()
          if (activo && datos?.ok) {
            setImpactoPreliminar(datos.impacto)
            return
          }
        }
        setImpactoPreliminar(null)
      } catch {
        if (activo) setImpactoPreliminar(null)
      }
    }
    consultarImpacto()
    return () => {
      activo = false
      controlador.abort()
    }
  }, [cue, seccionesSeleccionadas])

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando || enviandoRef.current) return
    if (!motivo || !severidad || seccionesSeleccionadas.length === 0) {
      setError('Completá motivo, severidad y al menos una sección para registrar.')
      return
    }
    enviandoRef.current = true
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetch('/api/problematicas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cue,
          motivo,
          severidad,
          descripcion: descripcion.trim() || undefined,
          secciones: seccionesSeleccionadas,
          idempotencyKey,
        }),
      })
      if (!respuesta.ok) {
        let mensaje = 'No se pudo guardar. Los datos ingresados se mantuvieron, podés reintentar.'
        const cuerpo = await respuesta.json().catch(() => null)
        if (cuerpo?.error) mensaje = cuerpo.error
        enviandoRef.current = false
        setEnviando(false)
        setError(mensaje)
        return
      }
      const datos = await respuesta.json()
      if (datos?.ok && typeof datos.id === 'string') {
        setResultadoConfirmado({ id: datos.id, impacto: datos.impacto })
        return
      }
      enviandoRef.current = false
      setEnviando(false)
      setError('No se pudo guardar. Los datos ingresados se mantuvieron, podés reintentar.')
    } catch {
      enviandoRef.current = false
      setEnviando(false)
      setError('No se pudo guardar. Los datos ingresados se mantuvieron, podés reintentar.')
    }
  }

  if (resultadoConfirmado) {
    return (
      <div className="formulario-problematica__confirmacion">
        <p>
          Problemática registrada. Afecta a {resultadoConfirmado.impacto.alumnos} alumnos en{' '}
          {resultadoConfirmado.impacto.secciones} secciones.
        </p>
      </div>
    )
  }

  return (
    <form className="formulario-problematica" onSubmit={manejarEnvio}>
      <div className="formulario-problematica__escuela">
        <p>{escuelaNombre}</p>
        <p>CUE {cue}</p>
      </div>

      {/*
        Motivo/Severidad usan <select> nativo a propósito, no el componente Select
        compartido: este formulario lo llena un director desde el celular, sin
        cuenta y a veces con mala conexión. El nativo abre el picker del sistema
        operativo, funciona con lectores de pantalla sin configuración adicional,
        no tiene bugs de touch/scroll y opera 100% por teclado. Un combobox
        custom acá es un riesgo de accesibilidad, no una mejora visual.
      */}
      <div className="formulario-problematica__campo">
        <Label htmlFor="motivo">Motivo</Label>
        <select
          id="motivo"
          className="ui-input"
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          disabled={enviando}
        >
          <option value="" disabled>
            Seleccioná un motivo
          </option>
          {MOTIVOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="formulario-problematica__campo">
        <Label htmlFor="severidad">Severidad</Label>
        <select
          id="severidad"
          className="ui-input"
          value={severidad}
          onChange={(evento) => setSeveridad(evento.target.value)}
          disabled={enviando}
        >
          <option value="" disabled>
            Seleccioná una severidad
          </option>
          {SEVERIDADES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="formulario-problematica__campo">
        <Label>Secciones afectadas</Label>
        <SeccionesSelector
          turnos={turnos}
          seleccionadas={seccionesSeleccionadas}
          onCambiar={setSeccionesSeleccionadas}
          disabled={enviando}
        />
      </div>

      <div className="formulario-problematica__campo">
        <Label htmlFor="descripcion">Descripción (opcional)</Label>
        <Textarea
          id="descripcion"
          value={descripcion}
          onChange={(evento) => setDescripcion(evento.target.value)}
          disabled={enviando}
          maxLength={500}
        />
      </div>

      {impactoPreliminar && (
        <div className="formulario-problematica__impacto-preliminar">
          <p>
            Impacto preliminar: {impactoPreliminar.alumnos} alumnos en {impactoPreliminar.secciones} secciones
            {impactoPreliminar.calculoIncompleto ? ' (cálculo incompleto)' : ''}
          </p>
          <p>Preliminar, se confirma al guardar.</p>
        </div>
      )}

      {error && (
        <p className="formulario-problematica__error" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={enviando}>
        Registrar problemática
      </Button>
    </form>
  )
}