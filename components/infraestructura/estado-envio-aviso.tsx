'use client'

import type { JSX } from 'react'
import { CircleAlert, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MENSAJES_ESTADO } from '@/lib/infraestructura/parte/envio-offline'

export function EstadoEnvioAviso({
  estado,
  onRetry,
}: {
  estado: 'pendiente-envio' | 'error-servidor'
  onRetry?: () => void
}): JSX.Element {
  const desconectado = estado === 'pendiente-envio'
  const Icono = desconectado ? WifiOff : CircleAlert

  return (
    <div className="estado-envio-aviso" role={desconectado ? 'status' : 'alert'}>
      <Icono className="estado-envio-aviso__icono" aria-hidden="true" />
      <p>{MENSAJES_ESTADO[estado]}</p>
      {!desconectado && onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry}>
          Reintentar ahora
        </Button>
      ) : null}
    </div>
  )
}
