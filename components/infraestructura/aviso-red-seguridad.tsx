'use client'

import type { JSX } from 'react'
import { Button } from '@/components/ui/button'
import type { AccionRedSeguridad, AvisoRedSeguridad } from '@/lib/infraestructura/red-seguridad'

export function AvisosRedSeguridad({
  avisos,
  onAccion,
}: {
  avisos: AvisoRedSeguridad[]
  onAccion: (tipo: AccionRedSeguridad) => void
}): JSX.Element | null {
  if (avisos.length === 0) return null
  return (
    <div className="aviso-red-seguridad" role="status">
      {avisos.map((a) => (
        <p key={a.id} className="aviso-badge">
          <span className="aviso-badge__texto">{a.mensaje}</span>
          <Button type="button" variant="secondary" onClick={() => onAccion(a.accion.tipo)}>
            {a.accion.etiqueta}
          </Button>
        </p>
      ))}
    </div>
  )
}
