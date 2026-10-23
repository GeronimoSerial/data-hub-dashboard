import { getRawClient } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { crearEjecutorSql } from '@/lib/infraestructura/ge-db'
import { alcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import { afectacionDentroDeNiveles, consultarYRegistrarAfectados } from '@/lib/infraestructura/identidad'
import { puedeVerNominal } from '@/lib/infraestructura/permiso-nominal'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// F3.3: identifica el alcance nominal por afectacionId (infra_afectacion.id)
// en vez de por el id del modelo deprecado, que se retiró por completo en la
// Fase 4 junto con su ruta vieja (app/api/infraestructura/nominal).
//
// verificarAccesoLectura({ section: 'infrastructure' }) gobierna el acceso de LECTURA al mapa
// (/mapas/infraestructura); puedeVerNominal() es un permiso aparte, nunca
// mira el rol ni la audiencia del recurso: se corren las dos, en ese orden,
// porque ver el mapa no implica ver nombres de alumnos.
//
// Abrir este endpoint ES un evento auditado: consultarYRegistrarAfectados
// inserta en infra_acceso_nominal_log en la misma transacción que arma la
// respuesta. Por eso NUNCA se llama especulativamente ni se cachea la
// respuesta — cada GET exitoso es una apertura real del alcance nominal.
export async function GET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura({ section: 'infrastructure' })
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const ahora = new Date()
  const puedeVer = await puedeVerNominal(acceso.user, ahora)
  if (!puedeVer) {
    return Response.json({ error: 'No tiene acceso al alcance nominal' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const afectacionId = searchParams.get('afectacionId')
  if (!afectacionId) {
    return Response.json({ error: 'Falta el parámetro afectacionId' }, { status: 400 })
  }

  // El alcance del rol se chequea ANTES de consultar: una afectación fuera de
  // la dirección del director responde 403 y no deja fila en el log.
  const alcance = alcanceMapa(acceso.user)
  const client = crearEjecutorSql(getRawClient())
  if (alcance.tipo === 'ninguno') {
    return Response.json({ error: 'No tiene acceso al alcance nominal' }, { status: 403 })
  }
  if (alcance.tipo === 'niveles' && !(await afectacionDentroDeNiveles(client, afectacionId, alcance.ids))) {
    return Response.json({ error: 'La afectación queda fuera de su alcance' }, { status: 403 })
  }

  const resultado = await consultarYRegistrarAfectados(client, acceso.user.id, afectacionId, ahora)
  if (!resultado) {
    return Response.json({ error: 'Afectación no encontrada' }, { status: 404 })
  }

  return jsonNoStore(resultado)
}
