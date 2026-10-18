import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { puedeAbrir } from '@/lib/acl'
import { puedeVerNominal } from '@/lib/infraestructura/permiso-nominal'
import { alcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { ensureSeeded } from '@/lib/db/seed'
import { hazardContextEnabled } from '@/lib/infraestructura/riesgo/flags'
import { obtenerEscuelaFichaEnriquecida } from '@/lib/infraestructura/parte-mapa'
import { FichaEscuelaPagina } from '@/components/mapas/ficha-escuela-pagina'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface EscuelaFichaRouteProps {
  params: Promise<{ cue: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function EscuelaFichaRoute({
  params,
  searchParams,
}: EscuelaFichaRouteProps) {
  await ensureSeeded()
  const { cue: cueParam } = await params
  const cueDecoded = decodeURIComponent(cueParam)

  const user = await getSessionUser()
  if (!user) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(
        `/mapas/infraestructura/escuelas/${encodeURIComponent(cueDecoded)}`,
      )}`,
    )
  }

  const found = await loadRecursoAccessByRuta('/mapas/infraestructura')
  const alcance = alcanceMapa(user)
  if (!found || !puedeAbrir(user, found.access) || alcance.tipo === 'ninguno') {
    redirect('/forbidden')
  }

  const resultado = await obtenerEscuelaFichaEnriquecida(cueDecoded, alcance)
  if (resultado.estado !== 'ok') {
    notFound()
  }

  const [mostrarEnlaceNominal, resolvedSearchParams] = await Promise.all([
    puedeVerNominal(user, new Date()),
    searchParams ? searchParams : Promise.resolve({}),
  ])

  return (
    <FichaEscuelaPagina
      escuela={resultado.escuela}
      mostrarEnlaceNominal={mostrarEnlaceNominal}
      hazardContextEnabled={hazardContextEnabled()}
      searchParams={resolvedSearchParams}
    />
  )
}
