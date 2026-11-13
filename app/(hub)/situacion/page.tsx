import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { ensureSeeded } from '@/lib/db/seed'
import { situacionEnabled } from '@/lib/infraestructura/riesgo/flags'
import { obtenerEstadoSituacion, serializarEstadoSituacion } from '@/lib/infraestructura/riesgo/situacion/consulta'
import { nombresDeEscuelas } from '@/lib/infraestructura/riesgo/situacion/nombres-escuelas'
import { obtenerCorridasPorItemSeguro } from '@/lib/infraestructura/riesgo/estado-datos/latidos'
import { obtenerEstadoDatosSeguro } from '@/lib/infraestructura/riesgo/estado-datos/consulta'
import { SituacionClient } from '@/components/infraestructura/situacion-client'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'
import { textos } from '@/lib/i18n'
import { idiomaEfectivo } from '@/lib/i18n/idioma'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { regionActiva } from '@/lib/infraestructura/region'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const contenedor: React.CSSProperties = { padding: '2rem', color: 'var(--ink)' }

// Igual criterio de acceso que /admin/operacion y /admin/riesgo (staff:
// admin/editor), no la audiencia configurable por recurso de
// /mapas/infraestructura: el Centro de Situación es un panel ejecutivo
// interno, no un recurso del catálogo.
export default async function SituacionPage() {
  await requireServerHubPageAccess('/situacion')
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/situacion')
  if (gate === 'forbidden') redirect('/forbidden')

  // Con el flag apagado no se toca infra_situacion_corte ni nada del motor:
  // ni ensureSeeded() ni consultas (mismo criterio que episodios-derivados).
  // Mismo cálculo que el layout de /mapas/infraestructura: el árbol cliente
  // necesita el IdiomaProvider para que useTextos() coincida con el servidor.
  const region = regionActiva()
  const idioma = idiomaEfectivo({ preferencia: user?.idioma, region })
  const t = textos(idioma)
  if (!situacionEnabled()) {
    return (
      <IdiomaProvider idioma={idioma}>
        <div style={contenedor}>
          <h1>{t.situacion.centroTitulo}</h1>
          <p>{t.situacion.deshabilitado}</p>
        </div>
      </IdiomaProvider>
    )
  }

  await ensureSeeded()
  const [estadoInicial, estadoDatos] = await Promise.all([obtenerEstadoSituacion(), obtenerEstadoDatosSeguro()])
  const [nombresEscuelas, corridasIniciales] = await Promise.all([
    nombresDeEscuelas(estadoInicial.prioridades.map((p) => p.cueAnexo)),
    obtenerCorridasPorItemSeguro(),
  ])

  return (
    <IdiomaProvider idioma={idioma}>
      <div style={contenedor}>
        <SituacionClient
          nombresEscuelas={nombresEscuelas}
          corridasIniciales={corridasIniciales}
          estadoInicial={{
            ...serializarEstadoSituacion(estadoInicial),
            estadoDatos,
          }}
        />
      </div>
    </IdiomaProvider>
  )
}
