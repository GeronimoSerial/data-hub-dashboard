import { AccesoForm } from '@/components/infraestructura/acceso-form'
import { EncabezadoParte } from '@/components/infraestructura/encabezado-parte'
import { tieneAccesoAlParteDesdeCookies, tieneAccesoAlParteParaCueDesdeCookies } from '@/lib/infraestructura/acceso-parte'
import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { crearEjecutorSql, ensureGeSchema, getCorteVigente } from '@/lib/infraestructura/ge-db'
import { getRawClient } from '@/lib/db'

// Keep one consistent explanation of the same context errors for every public parte entry point.
const MENSAJES_ERROR: Record<ContextoErrorKind, string> = {
  cue_ausente: 'Este enlace no incluye el CUE de la escuela. Solicite el enlace nuevamente a quien se lo compartió.',
  cue_invalido: 'El CUE incluido en el enlace no tiene un formato válido.',
  sin_corte_vigente: 'No hay datos de escuelas disponibles en este momento. Intente nuevamente más tarde.',
  cue_inexistente: 'No se encontró una escuela con ese CUE.',
  sin_secciones: 'Esta escuela todavía no tiene secciones cargadas.',
}

export async function bloqueoDeAcceso(cue: string | undefined, titulo: string) {
  const tieneAcceso = cue
    ? await tieneAccesoAlParteParaCueDesdeCookies(cue)
    : await tieneAccesoAlParteDesdeCookies()
  return tieneAcceso ? null : (
    <div className="publico-content">
      <EncabezadoParte pantalla={titulo} />
      <AccesoForm />
    </div>
  )
}

export function ErrorContexto({ kind }: { kind: ContextoErrorKind }) {
  return <p className="estado-actual-aviso__texto" role="alert">{MENSAJES_ERROR[kind]}</p>
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
