import { cookies } from 'next/headers'
import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { ensureSeeded } from '@/lib/db/seed'
import { listarMotivos } from '@/lib/infraestructura/motivos'
import { FormularioProblematica } from '@/components/infraestructura/formulario-problematica'
import { AccesoForm } from '@/components/infraestructura/acceso-form'
import { NOMBRE_COOKIE, tieneAccesoPublicoDesdeValorCookie } from '@/lib/infraestructura/acceso-publico'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MENSAJES_ERROR: Record<ContextoErrorKind, string> = {
  cue_ausente: 'Este enlace no incluye el CUE de la escuela. Pedile a quien te lo compartió que revise el enlace.',
  cue_invalido: 'El CUE del enlace no tiene un formato válido.',
  sin_corte_vigente: 'No hay datos de escuelas disponibles en este momento. Intentá de nuevo más tarde.',
  cue_inexistente: 'No encontramos una escuela con ese CUE.',
  sin_secciones: 'Esta escuela todavía no tiene secciones cargadas.',
}

export default async function NuevaProblematicaPage({
  searchParams,
}: {
  searchParams: Promise<{ cue?: string }>
}) {
  const { cue } = await searchParams

  const cookieStore = await cookies()
  if (!tieneAccesoPublicoDesdeValorCookie(cookieStore.get(NOMBRE_COOKIE)?.value)) {
    return (
      <div className="publico-content">
        <h1 className="publico-content__title">Reportar una problemática</h1>
        <AccesoForm />
      </div>
    )
  }

  const client = openGeDb()
  let resultado
  try {
    await ensureGeSchema(client)
    resultado = await resolverContextoPorCue(client, cue ?? null)
  } finally {
    client.close()
  }

  if (!resultado.ok) {
    return (
      <div className="publico-content">
        <h1 className="publico-content__title">Reportar una problemática</h1>
        <p className="formulario-problematica__error" role="alert">
          {MENSAJES_ERROR[resultado.error.kind]}
        </p>
      </div>
    )
  }

  const { escuela, turnos } = resultado.contexto

  await ensureSeeded()
  const motivos = await listarMotivos()

  return (
    <div className="publico-content">
      <h1 className="publico-content__title">Reportar una problemática</h1>
      <p className="publico-content__intro">
        {escuela.localidad}, {escuela.departamento}
      </p>

      <FormularioProblematica
        cue={escuela.cueAnexo}
        escuelaNombre={escuela.nombre}
        turnos={turnos}
        motivos={motivos}
      />
    </div>
  )
}
