'use client'

import { EstadoPagina } from '@/miniapps/links/components/estado-pagina'
import { Button } from '@/components/ui/button'

export default function LinksError({ reset }: { reset: () => void }) {
  return (
    <EstadoPagina role="alert" titulo="No pudimos cargar los accesos." detalle="Probá de nuevo en unos minutos.">
      <Button onClick={reset}>Reintentar</Button>
    </EstadoPagina>
  )
}
