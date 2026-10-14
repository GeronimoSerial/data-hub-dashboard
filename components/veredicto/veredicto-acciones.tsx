'use client'

import { useState } from 'react'

const RUTA_ENLACES = '/api/infraestructura/veredictos/enlaces'
const RUTA_PDF = '/api/infraestructura/veredictos/pdf'

const claseBoton =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50'

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
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={claseBoton} onClick={copiarEnlace}>
        Copiar enlace para autoridades
      </button>
      <a href={RUTA_PDF} download className={claseBoton}>
        Descargar PDF
      </a>
      <button type="button" className={claseBoton} onClick={revocarEnlaces}>
        Revocar enlaces de hoy
      </button>
      <p aria-live="polite" className="text-sm text-slate-600">
        {estado}
      </p>
      {urlManual ? (
        <input
          readOnly
          aria-label="Enlace para autoridades"
          value={urlManual}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      ) : null}
    </div>
  )
}
