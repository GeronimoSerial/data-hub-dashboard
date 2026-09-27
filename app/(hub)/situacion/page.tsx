import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { ensureSeeded } from '@/lib/db/seed'
import { situacionEnabled } from '@/lib/infraestructura/riesgo/flags'
import { obtenerEstadoSituacion } from '@/lib/infraestructura/riesgo/situacion/consulta'
import { SituacionClient } from '@/components/infraestructura/situacion-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const contenedor: React.CSSProperties = { padding: '2rem', color: 'var(--ink)' }

// Igual criterio de acceso que /admin/operacion y /admin/riesgo (staff:
// admin/editor), no la audiencia configurable por recurso de
// /mapas/infraestructura: el Centro de Situación es un panel ejecutivo
// interno, no un recurso del catálogo.
export default async function SituacionPage() {
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/situacion')
  if (gate === 'forbidden') redirect('/forbidden')

  // Con el flag apagado no se toca infra_situacion_corte ni nada del motor:
  // ni ensureSeeded() ni consultas (mismo criterio que episodios-derivados).
  if (!situacionEnabled()) {
    return (
      <div style={contenedor}>
        <h1>Centro de Situación</h1>
        <p>Centro de Situación deshabilitado (SITUACION_ENABLED=false)</p>
      </div>
    )
  }

  await ensureSeeded()
  const estadoInicial = await obtenerEstadoSituacion()

  return (
    <div style={contenedor}>
      <SituacionClient
        estadoInicial={{
          corte: estadoInicial.corte
            ? {
                id: estadoInicial.corte.id,
                generadoEn: estadoInicial.corte.generadoEn,
                kpis: estadoInicial.corte.kpis,
                conteosPorNivelRiesgo: estadoInicial.corte.conteosPorNivelRiesgo,
                fuentesSalud: estadoInicial.corte.fuentesSalud,
                episodiosAbiertos: estadoInicial.corte.episodiosAbiertos,
                episodiosCerradosDesdeAnterior: estadoInicial.corte.episodiosCerradosDesdeAnterior,
              }
            : null,
          briefing: estadoInicial.briefing,
          atraso: estadoInicial.atraso,
          prioridades: estadoInicial.prioridades,
        }}
      />
    </div>
  )
}
