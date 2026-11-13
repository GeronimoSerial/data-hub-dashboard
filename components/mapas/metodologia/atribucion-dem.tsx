'use client'

import { fuenteDemDeRegionId } from '@/lib/infraestructura/region/fuente-dem'
import { useRegion } from '@/lib/infraestructura/region/region-provider'
import { useTextos } from '@/lib/i18n/idioma-provider'

const ENLACE_LICENCIA = 'https://creativecommons.org/licenses/by-nc-sa/4.0/'

// Attribution for the FABDEM terrain. Renders nothing unless the active region uses it.
export function AtribucionDem() {
  const region = useRegion()
  const t = useTextos().situacion.fuenteDem
  if (fuenteDemDeRegionId(region.id) !== 'fabdem') return null
  return (
    <div className="card atribucion-dem">
      <h3>{t.titulo}</h3>
      <p>{t.cuerpo}</p>
      <p>
        <a href={ENLACE_LICENCIA} target="_blank" rel="noopener noreferrer">{t.licencia}</a>. {t.noComercial}
      </p>
      <p>{t.copernicus}</p>
      <p>{t.modificado}</p>
    </div>
  )
}
