import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { obtenerPeriodoVigente } from '@/lib/infraestructura/parte-consulta'
import { listarVerificaciones } from '@/lib/infraestructura/verificaciones'
import { VerificacionesCola } from '@/components/infraestructura/verificaciones-cola'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

// UI de operador (staff) para la cola de verificaciones del protocolo ENOS
// (batch E1). El monitoreo es continuo, no episódico: se descartó el
// episodio administrado a mano y esta página quedó como el único lugar
// desde donde se emiten y gestionan pedidos, anclados al período provincial
// vigente.

export default async function VerificacionesAdmin() {
  await requireServerHubPageAccess('/admin/verificaciones', 'infrastructure')
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin/verificaciones')
  if (gate === 'forbidden') redirect('/forbidden')

  const periodo = await obtenerPeriodoVigente()

  if (!periodo) {
    return (
      <div className="admin-page">
        <h1>Verificaciones</h1>
        <section className="admin-panel">
          <p className="ui-hint">
            No hay un período provincial vigente: no se pueden emitir solicitudes de
            verificación hasta que exista uno.
          </p>
        </section>
      </div>
    )
  }

  const verificaciones = await listarVerificaciones({ periodoId: periodo.id })

  return (
    <div className="admin-page">
      <h1>Verificaciones</h1>

      <section className="admin-panel">
        <ul className="admin-plain-list">
          <li>Período vigente: {periodo.nombre}</li>
        </ul>
      </section>

      <VerificacionesCola verificacionesIniciales={verificaciones} />
    </div>
  )
}
