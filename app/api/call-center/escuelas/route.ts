import { listarEscuelasSinActualizar } from '@/lib/call-center/escuelas-pendientes'
import { ultimaLlamadaPorCue } from '@/lib/call-center/llamadas'
import { ruta } from '@/lib/http/ruta'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Una llamada cuenta como contacto solo si es posterior a la última
// actualización del parte: si el director actualizó después, la escuela
// vuelve a quedar pendiente.
async function handleGET() {
  const denied = staffGuard(await getSessionUser())
  if (denied) return Response.json({ error: denied.error }, { status: denied.status })

  const [escuelas, ultimas] = await Promise.all([listarEscuelasSinActualizar(), ultimaLlamadaPorCue()])

  const items = escuelas.map((escuela) => {
    const ultimaLlamada = ultimas.get(escuela.cueAnexo) ?? null
    const contactada =
      ultimaLlamada !== null && Date.parse(ultimaLlamada.creadaEn) > Date.parse(escuela.actualizadaEn)
    return { ...escuela, contactada, ultimaLlamada }
  })

  return jsonNoStore({ escuelas: items, total: items.length })
}

export const GET = ruta('call-center.escuelas.get', handleGET)
