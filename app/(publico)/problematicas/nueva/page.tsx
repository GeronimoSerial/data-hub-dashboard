import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { FormularioProblematica } from '@/components/infraestructura/formulario-problematica'

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
      <div className="p-6">
        <h1 className="text-xl font-semibold">Reportar una problemática</h1>
        <p className="text-sm text-destructive">{MENSAJES_ERROR[resultado.error.kind]}</p>
      </div>
    )
  }

  const { escuela, turnos } = resultado.contexto

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Reportar una problemática</h1>
      <section className="mt-2">
        <p className="text-sm text-muted-foreground">
          {escuela.localidad}, {escuela.departamento}
        </p>
      </section>

      <section className="mt-4">
        <FormularioProblematica
          cue={escuela.cueAnexo}
          escuelaNombre={escuela.nombre}
          turnos={turnos}
        />
      </section>
    </div>
  )
}
