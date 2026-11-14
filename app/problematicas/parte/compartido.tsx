import { AccesoForm } from '@/components/infraestructura/acceso-form'
import { EncabezadoParte } from '@/components/infraestructura/encabezado-parte'
import { resolverAccesoParteDesdeCookies } from '@/lib/infraestructura/acceso-parte'
import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { crearEjecutorSql, ensureGeSchema, getCorteVigente } from '@/lib/infraestructura/ge-db'
import { getRawClient } from '@/lib/db'
import { cargarCarrerasInstituto, type CargaCarrerasInstituto } from '@/lib/infraestructura/parte/instituto-ui-carga'
import { textosActuales } from '@/lib/i18n'

/**
 * Guarda de la página: devuelve el bloqueo (formulario de acceso) si no hay
 * permiso, y el CUE efectivo de la pantalla. Sin ?cue, el operador de
 * establecimiento recibe el CUE de su sesión; con un ?cue ajeno, queda bloqueado.
 */
export async function bloqueoDeAcceso(cue: string | undefined, titulo: string) {
  const acceso = await resolverAccesoParteDesdeCookies(cue ?? null)
  const bloqueo = acceso.permitido ? null : (
    <div className="publico-content">
      <EncabezadoParte pantalla={titulo} />
      <AccesoForm />
    </div>
  )
  return { bloqueo, cue: acceso.cue ?? undefined }
}

export function ErrorContexto({ kind }: { kind: ContextoErrorKind }) {
  return <p className="estado-actual-aviso__texto" role="alert">{textosActuales().parteResto.errorContexto[kind]}</p>
}

/**
 * Carreras del CUE para el parte de institutos superiores (ver
 * cargarCarrerasInstituto). Usa el cliente SQL de la app.
 */
export async function cargarCarrerasDelCue(cue: string): Promise<CargaCarrerasInstituto> {
  return cargarCarrerasInstituto(crearEjecutorSql(getRawClient()), cue)
}

export async function cargarContextoParte(cue: string | undefined, incluirCorte = true) {
  const clienteGe = crearEjecutorSql(getRawClient())
  await ensureGeSchema(clienteGe)
  const resultado = await resolverContextoPorCue(clienteGe, cue ?? null)
  // The report forms need the current cut on the same client to decide whether
  // to redirect; the status page intentionally only resolves school context.
  const corteId = incluirCorte ? (await getCorteVigente(clienteGe))?.id ?? null : null
  return { resultado, corteId }
}
