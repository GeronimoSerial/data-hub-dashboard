import { hasAnyBookletAccess } from '@/lib/cuadernillos/permissions'
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { puedeVerNominal } from '@/lib/infraestructura/permiso-nominal'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { puedeLeerMapaInfraestructura } from '@/lib/infraestructura/acceso-lectura'
import { ensureSeeded } from '@/lib/db/seed'
import {
  hazardContextEnabled,
  riskRadarEnabled,
  seasonalEnabled,
} from '@/lib/infraestructura/riesgo/flags'
import { can } from '@/lib/access/capabilities'
import { InfraestructuraLayoutShell } from './infraestructura-layout-shell'
import { RUTA_MAPA_INFRAESTRUCTURA } from '@/lib/infraestructura/rutas-hub'
import { regionActiva } from '@/lib/infraestructura/region'
import { esIdioma, idiomaEfectivo, mostrarSelectorIdioma } from '@/lib/i18n/idioma'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function InfraestructuraMapLayout({
  children,
}: {
  children: ReactNode
}) {
  await ensureSeeded()
  const user = await getSessionUser()
  if (!user) redirect(`/login?callbackUrl=${RUTA_MAPA_INFRAESTRUCTURA}`)
  const found = await loadRecursoAccessByRuta(RUTA_MAPA_INFRAESTRUCTURA)
  if (!puedeLeerMapaInfraestructura(user, found?.access ?? null)) {
    redirect('/forbidden')
  }
  const mostrarEnlaceNominal = await puedeVerNominal(user, new Date())
  const region = regionActiva()
  const idioma = idiomaEfectivo({ preferencia: user.idioma, region })

  return (
    <IdiomaProvider idioma={idioma}>
    <InfraestructuraLayoutShell
      mostrarEnlaceNominal={mostrarEnlaceNominal}
      mostrarCallCenter={can(user, 'callcenter.access')}
      mostrarCuadernillos={await hasAnyBookletAccess(user)}
      hazardContextEnabled={hazardContextEnabled()}
      riskRadarEnabled={riskRadarEnabled()}
      seasonalEnabled={seasonalEnabled()}
      mostrarSelectorIdioma={mostrarSelectorIdioma(region)}
      idioma={idioma}
      idiomasRegion={region.idiomas.filter(esIdioma)}
    >
      {children}
    </InfraestructuraLayoutShell>
    </IdiomaProvider>
  )
}
