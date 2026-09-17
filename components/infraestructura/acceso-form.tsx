'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

// Pantalla de ingreso para la contraseña temporal de acceso público (ver
// lib/infraestructura/acceso-publico.ts). Simple a propósito: es lo único
// que ve un director sin cuenta antes de llegar al formulario.
export function AccesoForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetch('/api/problematicas/acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => null)
        setError(cuerpo?.error ?? 'No se pudo verificar la contraseña.')
        setEnviando(false)
        return
      }
      // La cookie de sesión ya quedó seteada por la respuesta; refresh vuelve
      // a renderizar la página del servidor, que ahora la va a encontrar.
      router.refresh()
    } catch {
      setError('No se pudo verificar la contraseña.')
      setEnviando(false)
    }
  }

  return (
    <form className="acceso-form" onSubmit={manejarEnvio}>
      <p className="acceso-form__intro">Este formulario requiere una contraseña de acceso.</p>
      <div className="formulario-problematica__campo">
        <Label htmlFor="acceso-password">Contraseña</Label>
        <input
          id="acceso-password"
          type="password"
          className="ui-input"
          value={password}
          onChange={(evento) => setPassword(evento.target.value)}
          disabled={enviando}
          autoFocus
        />
      </div>

      {error && (
        <p className="formulario-problematica__error" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={enviando || password.length === 0}>
        Ingresar
      </Button>
    </form>
  )
}
