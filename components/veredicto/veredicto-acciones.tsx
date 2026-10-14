'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const RUTA_ENLACES = '/api/infraestructura/veredictos/enlaces'
const RUTA_PDF = '/api/infraestructura/veredictos/pdf'

export function VeredictoAcciones() {
  const [estado, setEstado] = useState('')
  const [urlManual, setUrlManual] = useState<string | null>(null)

  async function copiarEnlace() {
    setUrlManual(null)
    setEstado('')
    try {
      const res = await fetch(RUTA_ENLACES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { url } = (await res.json()) as { url: string }
      const completa = window.location.origin + url
      try {
        await navigator.clipboard.writeText(completa)
        setEstado('Enlace copiado. Vence hoy a las 23:59.')
      } catch {
        setUrlManual(completa)
        setEstado('No se pudo copiar automáticamente. Copia el enlace manualmente.')
      }
    } catch {
      setEstado('No se pudo crear el enlace.')
    }
  }

  async function revocarEnlaces() {
    if (!window.confirm('¿Revocar todos los enlaces creados hoy?')) return
    try {
      const res = await fetch(RUTA_ENLACES, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { revocados } = (await res.json()) as { revocados: number }
      setEstado(`Enlaces revocados: ${revocados}`)
    } catch {
      setEstado('No se pudieron revocar los enlaces.')
    }
  }

  return (
    <div className="veredicto-acciones">
      <Button type="button" variant="secondary" size="sm" onClick={copiarEnlace}>
        Copiar enlace para autoridades
      </Button>
      <a href={RUTA_PDF} download className="ui-button ui-button--secondary ui-button--sm">
        Descargar PDF
      </a>
      <Button type="button" variant="secondary" size="sm" onClick={revocarEnlaces}>
        Revocar enlaces de hoy
      </Button>
      <p aria-live="polite" className="veredicto-acciones__estado">
        {estado}
      </p>
      {urlManual ? (
        <Input
          readOnly
          aria-label="Enlace para autoridades"
          value={urlManual}
          onFocus={(e) => e.currentTarget.select()}
          className="veredicto-acciones__url"
        />
      ) : null}
    </div>
  )
}
