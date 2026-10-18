'use client'

import { useState } from 'react'
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
      <button type="button" className="veredicto-acciones__boton" onClick={copiarEnlace} aria-label="Copiar enlace para autoridades">
        Copiar enlace
      </button>
      <a href={RUTA_PDF} download className="veredicto-acciones__boton" aria-label="Descargar PDF">
        PDF
      </a>
      <span className="veredicto-acciones__separador" aria-hidden="true" />
      <button type="button" className="veredicto-acciones__boton veredicto-acciones__boton--peligro" onClick={revocarEnlaces} aria-label="Revocar enlaces de hoy">
        Revocar enlaces
      </button>
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
