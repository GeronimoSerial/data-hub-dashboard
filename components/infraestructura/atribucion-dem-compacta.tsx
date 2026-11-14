'use client'

import { fuenteDemDeRegionId } from '@/lib/infraestructura/region/fuente-dem'
import { useRegion } from '@/lib/infraestructura/region/region-provider'
import { useTextos } from '@/lib/i18n/idioma-provider'

const ENLACE_LICENCIA = 'https://creativecommons.org/licenses/by-nc-sa/4.0/'

// Compact FABDEM attribution for the school ficha. Renders nothing unless the active region uses FABDEM.
export function AtribucionDemCompacta() {
  const region = useRegion()
  const t = useTextos().situacion.fuenteDem
  if (fuenteDemDeRegionId(region.id) !== 'fabdem') return null
  return (
    <div className="atribucion-dem-compacta">
      <p>
        {t.compacta} <a href={ENLACE_LICENCIA} target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>
      </p>
      <details>
        <summary>{t.detalle}</summary>
        <p>{t.copernicus}</p>
        <p>{t.modificado}</p>
        <p>{t.noComercial}</p>
      </details>
    </div>
  )
}
