'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { useTextos } from '@/lib/i18n/idioma-provider'

const RUTA_ENLACES = '/api/infraestructura/veredictos/enlaces'
const RUTA_PDF = '/api/infraestructura/veredictos/pdf'

export function VeredictoAcciones() {
  const ta = useTextos().residuos.veredicto.acciones
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
        setEstado(ta.copiado)
      } catch {
        setUrlManual(completa)
        setEstado(ta.noCopiado)
      }
    } catch {
      setEstado(ta.noCreado)
    }
  }

  async function revocarEnlaces() {
    if (!window.confirm(ta.confirmarRevocar)) return
    try {
      const res = await fetch(RUTA_ENLACES, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { revocados } = (await res.json()) as { revocados: number }
      setEstado(ta.revocados(revocados))
    } catch {
      setEstado(ta.noRevocados)
    }
  }

  return (
    <div className="veredicto-acciones">
      <button type="button" className="veredicto-acciones__boton" onClick={copiarEnlace} aria-label={ta.ariaCopiar}>
        {ta.copiarEnlace}
      </button>
      <a href={RUTA_PDF} download className="veredicto-acciones__boton" aria-label={ta.ariaPdf}>
        {ta.pdf}
      </a>
      <span className="veredicto-acciones__separador" aria-hidden="true" />
      <button type="button" className="veredicto-acciones__boton veredicto-acciones__boton--peligro" onClick={revocarEnlaces} aria-label={ta.ariaRevocar}>
        {ta.revocarEnlaces}
      </button>
      <p aria-live="polite" className="veredicto-acciones__estado">
        {estado}
      </p>
      {urlManual ? (
        <Input
          readOnly
          aria-label={ta.ariaEnlace}
          value={urlManual}
          onFocus={(e) => e.currentTarget.select()}
          className="veredicto-acciones__url"
        />
      ) : null}
    </div>
  )
}
