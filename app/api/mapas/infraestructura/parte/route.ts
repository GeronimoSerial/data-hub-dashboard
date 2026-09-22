// Ficha de un parte para el modal del mapa (F3.2): misma proyección que usa
// el director (armarFichaParte, ver lib/infraestructura/parte-consulta.ts),
// pero SIN nombres de alumnos — el mapa se abre con el acceso de lectura
// amplio del hub (verificarAccesoLectura), no con el gate nominal auditado
// que sólo cubre el flujo del director (F3.3). Por eso la respuesta expone
// `totales` por afectación y nunca la lista de alumnos.
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'
import { armarFichaParte } from '@/lib/infraestructura/parte-consulta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    return Response.json(
      { error: acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso' },
      { status: acceso.status },
    )
  }

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const cue = normalizeCue(searchParams.get('cue') ?? '')
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  const db = getDb()
  const client = db.$client
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }

  const ficha = await armarFichaParte(cue.value, corte.id)
  if (!ficha) {
    return Response.json({ ok: true, periodo: null, parte: null }, { status: 200, headers: CACHE_HEADERS })
  }

  return Response.json(
    {
      ok: true,
      periodo: ficha.periodo,
      parte: ficha.parte,
      servicio: ficha.servicio,
      // Deliberadamente sin `secciones` (ids de alumno): sólo id, motivo,
      // categoría, severidad, descripción, vigencia y totales agregados.
      afectaciones: ficha.afectaciones.map((afectacion) => ({
        id: afectacion.id,
        motivo: afectacion.motivo,
        categoria: afectacion.categoria,
        severidad: afectacion.severidad,
        descripcion: afectacion.descripcion,
        rigeDesde: afectacion.rigeDesde,
        totales: afectacion.totales,
      })),
      secciones: ficha.secciones,
      ultimaActualizacion: ficha.ultimaActualizacion,
    },
    { status: 200, headers: CACHE_HEADERS },
  )
}
