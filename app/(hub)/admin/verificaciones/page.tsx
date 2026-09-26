import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { adminPageGate } from '@/lib/acl'
import { obtenerPeriodoVigente } from '@/lib/infraestructura/parte-consulta'
import { listarVerificaciones } from '@/lib/infraestructura/verificaciones'
import { VerificacionesCola } from '@/components/infraestructura/verificaciones-cola'

// UI de operador (staff) para la cola de verificaciones del protocolo ENOS
// (batch E1). El monitoreo es continuo, no episódico: se descartó el
// episodio administrado a mano y esta página quedó como el único lugar
// desde donde se emiten y gestionan pedidos, anclados al período provincial
// vigente. Mismo gate y estética inline que app/(hub)/admin/operacion/page.tsx.
const contenedor: React.CSSProperties = { padding: '2rem', color: 'var(--ink)' }
const bloque: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '1rem',
  marginBottom: '1.5rem',
  background: 'var(--fill)',
}

export default async function VerificacionesAdmin() {
  const user = await getSessionUser()
  const gate = adminPageGate(user)
  if (gate === 'login') redirect('/login?callbackUrl=/admin/verificaciones')
  if (gate === 'forbidden') redirect('/forbidden')

  const periodo = await obtenerPeriodoVigente()

  if (!periodo) {
    return (
      <div style={contenedor}>
        <h1>Verificaciones</h1>
        <section style={bloque}>
          <p style={{ color: 'var(--ink-soft)' }}>
            No hay un período provincial vigente: no se pueden emitir solicitudes de
            verificación hasta que exista uno.
          </p>
        </section>
      </div>
    )
  }

  const verificaciones = await listarVerificaciones({ periodoId: periodo.id })

  return (
    <div style={contenedor}>
      <h1>Verificaciones</h1>

      <section style={bloque}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li>Período vigente: {periodo.nombre}</li>
        </ul>
      </section>

      <VerificacionesCola verificacionesIniciales={verificaciones} />
    </div>
  )
}
