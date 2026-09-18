import { tieneAccesoPublico } from '@/lib/infraestructura/acceso-publico'
import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { ensureLocalizacionesSeeded } from '@/lib/infraestructura/localizaciones-seed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MENSAJES_ERROR: Record<ContextoErrorKind, string> = {
  cue_ausente: 'Falta indicar el CUE de la escuela.',
  cue_invalido: 'El CUE ingresado no es válido.',
  sin_corte_vigente: 'No hay datos de escuelas disponibles en este momento.',
  cue_inexistente: 'No se encontró una escuela con ese CUE.',
  sin_secciones: 'La escuela no tiene secciones cargadas en el corte vigente.',
}

const STATUS_ERROR: Record<ContextoErrorKind, number> = {
  cue_ausente: 400,
  cue_invalido: 400,
  sin_corte_vigente: 503,
  cue_inexistente: 404,
  sin_secciones: 404,
}

// Antes esta ruta no tenía ninguna guarda a propósito: el director accedía
// al contexto de su escuela desde un enlace con CUE sin autenticarse. El
// titular del dato pidió cerrarla con la contraseña temporal de
// lib/infraestructura/acceso-publico.ts (reemplazo provisorio de la
// autenticación por token que viene después) porque ahora el contexto puede
// incluir identidad de alumnos (ver lib/infraestructura/contexto.ts).
export async function GET(request: Request) {
  if (!tieneAccesoPublico(request)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const cue = url.searchParams.get('cue')

  // Esta ruta no llama ensureSeeded() a proposito: es publica y no debe disparar
  // el seed completo del Hub. Pero si necesita ge_localizacion, que se siembra
  // sola desde el JSON versionado en una instalacion nueva.
  await ensureLocalizacionesSeeded()

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
