// Ficha de un parte para el modal del mapa (F3.2): misma proyección que usa
// el director (armarFichaParte, ver lib/infraestructura/parte-consulta.ts),
// pero SIN nombres de alumnos — el mapa se abre con el acceso de lectura
// amplio del hub (verificarAccesoLectura), no con el gate nominal auditado
// que sólo cubre el flujo del director (F3.3). Por eso la respuesta expone
// `totales` por afectación y nunca la lista de alumnos. El corte vigente de
// Gestión Educativa sólo aporta secciones y padrón; los partes y afectaciones
// se consultan aunque no haya corte vigente.
import { getRawClient } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { alcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { obtenerDatosPadronEscuela } from '@/lib/infraestructura/datos-padron-escuela'
import { crearEjecutorSql, getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { armarFichaParte, listarSituacionesRecientes } from '@/lib/infraestructura/parte-consulta'
import { verificarCueEnAlcance } from '@/lib/infraestructura/parte-mapa'
import { totalesMatriculaInstitutos } from '@/lib/infraestructura/alcance'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Sin corte vigente, este id inexistente hace que la consulta de secciones
// devuelva vacío, mientras permite leer el parte y sus afectaciones.
const SIN_CORTE = 0

async function handleGET(request: Request) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const alcance = alcanceMapa(acceso.user)
  if (alcance.tipo === 'ninguno') {
    return Response.json({ error: 'Prohibido' }, { status: 403 })
  }

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const cue = normalizeCue(searchParams.get('cue') ?? '')
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)

  const estadoAlcance = await verificarCueEnAlcance(client, cue.value, alcance)
  if (estadoAlcance === 'sin_alcance') {
    return Response.json({ error: 'Prohibido' }, { status: 403 })
  }
  if (estadoAlcance === 'fuera_de_alcance') {
    return Response.json({ error: 'Escuela no encontrada' }, { status: 404 })
  }

  const corte = await getCorteVigente(client)

  // Independiente de la afectación, el padrón del corte vigente se calcula
  // siempre que haya CUE válido y corte (incluso para escuelas con
  // `parte: null`). Es sólo un agregado por escuela — nunca identidad de
  // alumno. Sin corte no se consulta el padrón.
  // Institutos superiores: matrícula y carreras de la matrícula vigente, no del padrón GE.
  const instituto = (await totalesMatriculaInstitutos(client, cue.value)).get(cue.value)
  const datosPadron = instituto
    ? { niveles: [], secciones: 0, matriculaTotal: instituto.alumnos, turnos: [], carreras: instituto.carreras }
    : corte
      ? await obtenerDatosPadronEscuela(client, corte.id, cue.value)
      : null

  const ficha = await armarFichaParte(cue.value, corte?.id ?? SIN_CORTE)
  const recientes = (await listarSituacionesRecientes(cue.value))
    .filter((situacion) => situacion.cierre === 'solucionada')
    .map(({ id, motivo, severidad, retiradaEn }) => ({ id, motivo, severidad, retiradaEn }))
  if (!ficha) {
    return jsonNoStore({ ok: true, periodo: null, parte: null, datosPadron, recientes })
  }

  return jsonNoStore(
    {
      ok: true,
      periodo: ficha.periodo,
      parte: ficha.parte,
      servicio: ficha.servicio,
      // Deliberadamente sin `secciones` (ids de alumno): sólo id, motivo,
      // categoría, severidad, justificación crítica, descripción, vigencia,
      // causalidad y totales agregados.
      afectaciones: ficha.afectaciones.map((afectacion) => ({
        id: afectacion.id,
        motivo: afectacion.motivo,
        categoria: afectacion.categoria,
        severidad: afectacion.severidad,
        ...(afectacion.justificacionCritica
          ? {
              justificacionCritica: afectacion.justificacionCritica,
              ...(afectacion.justificacionCritica === 'otro' && afectacion.justificacionCriticaDetalle
                ? { justificacionCriticaDetalle: afectacion.justificacionCriticaDetalle }
                : {}),
            }
          : {}),
        impactoAlumnos: afectacion.impactoAlumnos,
        descripcion: afectacion.descripcion,
        causadaPorId: afectacion.causadaPorId,
        rigeDesde: afectacion.rigeDesde,
        creadaEn: afectacion.creadaEn,
        totales: afectacion.totales,
      })),
      secciones: ficha.secciones,
      datosPadron,
      recientes,
      ultimaActualizacion: ficha.ultimaActualizacion,
    },
  )
}

export const GET = ruta('mapas.infraestructura.parte.get', handleGET)
