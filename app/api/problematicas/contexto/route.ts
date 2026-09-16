import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MENSAJES_ERROR: Record<ContextoErrorKind, string> = {
  cue_ausente: 'Falta indicar el CUE de la escuela.',
  cue_invalido: 'El CUE ingresado no es válido.',
  sin_corte_vigente: 'No hay datos de escuelas disponibles en este momento.',
  cue_inexistente: 'No encontramos una escuela con ese CUE.',
  sin_secciones: 'La escuela no tiene secciones cargadas en el corte vigente.',
}

const STATUS_ERROR: Record<ContextoErrorKind, number> = {
  cue_ausente: 400,
  cue_invalido: 400,
  sin_corte_vigente: 503,
  cue_inexistente: 404,
  sin_secciones: 404,
}

// Sin guarda de sesión: esta ruta es pública a propósito, para que el director
// acceda al contexto de su escuela desde un enlace con CUE sin autenticarse.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const cue = url.searchParams.get('cue')

  const client = openGeDb()
  try {
    await ensureGeSchema(client)
    const resultado = await resolverContextoPorCue(client, cue)

    if (!resultado.ok) {
      return Response.json(
        { error: MENSAJES_ERROR[resultado.error.kind] },
        { status: STATUS_ERROR[resultado.error.kind] },
      )
    }

    return Response.json(resultado.contexto)
  } finally {
    client.close()
  }
}
