import { conAuditoria, respuestaAuditada } from '@/lib/infraestructura/auditoria/servidor'
import { rolAuditoria, describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
// Estado actual del parte (spec §6, §17) y alta/actualización (spec §7, §8,
// §13). Un único POST cubre ambos casos — la decisión del producto mató
// "Continuar como otro episodio" (ver docs/trayectoria-contrato-implementacion.md):
// si ya existe un parte para el CUE en el período vigente, iniciar un reporte
// ES actualizar el parte. Mismo patrón de guardas que
// app/api/problematicas/route.ts: acceso público, ensureSeeded, rate limit,
// idempotencia, validación contra la base, transacción.
import { z } from 'zod'
import { getDb, getRawClient } from '@/lib/db'
import { transaccionContextual } from '@/lib/db/contexto'
import { ensureSeeded } from '@/lib/db/seed'
import { codigoSinAccesoParte, tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { crearEjecutorSql, getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'
import { listarIdentidadesPorPersonas } from '@/lib/infraestructura/identidad'
import { getClientIp, ipExcedeLimite } from '@/lib/infraestructura/limites'
import { describirMovimiento } from '@/lib/infraestructura/movimiento-descripcion'
import type { DiffParte } from '@/lib/infraestructura/movimiento-diff'
import {
  armarFichaParte,
  listarMovimientosDescritos,
  listarSituacionesRecientes,
  obtenerParteActual,
  snapshotDesde,
  type ParteActual,
} from '@/lib/infraestructura/parte-consulta'
import { ejecutarActualizacionParte } from '@/lib/infraestructura/parte/actualizar-parte'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { calcularEstadoServicioGeneral } from '@/lib/infraestructura/servicio-educativo'
import type { TipoMovimiento } from '@/lib/infraestructura/trayectoria-tipos'
import { parseParteActualizacionInput } from '@/lib/infraestructura/validacion-trayectoria'
import {
  registrarIntentoVinculoFallido,
  responderPorEnlace,
} from '@/lib/infraestructura/verificaciones'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MENSAJE_SIN_SITUACION =
  'No hay una situación hidrometeorológica en seguimiento para este establecimiento.'

// Campo hermano opcional a nivel raíz del mismo body de POST (batch E1). Vive
// SEPARADO de parteActualizacionInputSchema para no tocar el contrato del
// parte: si viene con forma inválida se ignora en silencio, nunca es un 400.
const verificacionVinculoSchema = z
  .object({
    id: z.string().trim().min(1),
    token: z.string().trim().min(1),
  })
  .optional()

async function atenderGET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cue = normalizeCue(searchParams.get('cue') ?? '')
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  // El CUE tiene que conocerse ANTES de la guarda para poder validar la
  // sesión acotada por CUE del batch E1; quien ya tenía contraseña/sesión
  // admin entra exactamente igual que antes porque tieneAccesoAlParteParaCue
  // prueba esa vía primero.
  if (!(await tieneAccesoAlParteParaCue(request, cue.value))) {
    return Response.json({ error: 'No autorizado' }, { status: await codigoSinAccesoParte() })
  }

  await ensureSeeded()

  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }

  const ficha = await armarFichaParte(cue.value, corte.id)
  if (!ficha) {
    // Sin período vigente: no es un error, es "sin situación en seguimiento"
    // (spec §17).
    return jsonNoStore({ ok: true, periodo: null, parte: null, mensaje: MENSAJE_SIN_SITUACION })
  }

  // La ficha compartida (armarFichaParte) no resuelve nombres — ver
  // parte-consulta.ts. Sólo acá, autenticado por cookie del director, se
  // resuelven: se juntan los ids de TODAS las afectaciones vigentes y se
  // resuelven en una única llamada por lotes (spec batch 3: nunca por
  // afectación, nunca por alumno).
  const idsAlumnos = new Set<number>()
  for (const afectacion of ficha.afectaciones) {
    for (const seccion of afectacion.secciones) {
      for (const id of seccion.alumnos) idsAlumnos.add(id)
    }
  }

  let identidades = new Map<number, { nombre: string; apellido: string }>()
  if (idsAlumnos.size > 0) {
    try {
      const resueltas = await listarIdentidadesPorPersonas(client, [...idsAlumnos])
      identidades = new Map(resueltas.map((i) => [i.gePersonId, { nombre: i.nombre, apellido: i.apellido }]))
    } catch {
      // Degradar a mostrar el id solo (ver map abajo): nunca se cae la
      // pantalla de estado actual por no poder resolver un nombre.
    }
  }

  const afectacionesRespuesta = ficha.afectaciones.map((afectacion) => ({
    id: afectacion.id,
    motivo: afectacion.motivo,
    categoria: afectacion.categoria,
    severidad: afectacion.severidad,
    descripcion: afectacion.descripcion,
    rigeDesde: afectacion.rigeDesde,
    creadaEn: afectacion.creadaEn,
    causadaPorId: afectacion.causadaPorId,
    secciones: afectacion.secciones.map((seccion) => ({
      geSectionId: seccion.geSectionId,
      seccionCompleta: seccion.seccionCompleta,
      alumnos: seccion.alumnos.map((id) => {
        const identidad = identidades.get(id)
        return identidad
          ? { gePersonId: id, nombre: identidad.nombre, apellido: identidad.apellido }
          : { gePersonId: id, nombre: String(id), apellido: '' }
      }),
    })),
    totales: afectacion.totales,
  }))

  const [recientes, movimientos] = await Promise.all([
    listarSituacionesRecientes(cue.value),
    listarMovimientosDescritos(cue.value, corte.id),
  ])
  const ultimaCarga = movimientos[0]
    ? { creadaEn: movimientos[0].creadaEn, titulo: movimientos[0].titulo, cambios: movimientos[0].cambios }
    : null

  return jsonNoStore(
    {
      ok: true,
      periodo: ficha.periodo,
      parte: ficha.parte,
      servicio: ficha.servicio,
      afectaciones: afectacionesRespuesta,
      secciones: ficha.secciones,
      ultimaActualizacion: ficha.ultimaActualizacion,
      recientes,
      ultimaCarga,
    },
  )
}

// Arma la respuesta de éxito (201 en el camino normal, 200 en un replay
// idempotente) releyendo el estado actual — nunca reconstruyéndolo a mano —
// para que la respuesta nunca pueda discrepar de lo que después devuelve
// GET /parte.
async function respuestaExito(
  cueAnexo: string,
  corteId: number,
  parteId: string,
  movimientoId: string,
  tipo: TipoMovimiento,
  resumen: DiffParte,
  status: number,
  verificacionVinculo?: { id: string; token: string },
) {
  const actual = await obtenerParteActual(cueAnexo, corteId)
  const snapshot: Pick<ParteActual, 'secciones'> & { servicioAlcance: ReturnType<typeof snapshotDesde>['servicioAlcance'] } =
    actual
      ? { secciones: actual.secciones, servicioAlcance: snapshotDesde(actual).servicioAlcance }
      : { secciones: [], servicioAlcance: [] }
  const estadoGeneral = calcularEstadoServicioGeneral(snapshot.servicioAlcance, snapshot.secciones)

  // Best-effort, igual que en el camino de transacción nueva: un replay
  // idempotente o la carrera de idempotencia también pueden traer el vínculo
  // de verificación (batch E1), y nunca deben bloquear esta respuesta.
  describirAuditoria({ objetoTipo: 'parte', objetoId: parteId, cueAnexo, resultado: 'repetido',
    metadatos: { parteId, movimientoId } })
  return respuestaAuditada(async () => {
    const { vinculado, motivo } = await intentarVincularVerificacion(verificacionVinculo, movimientoId)

    return Response.json(
      {
        ok: true,
        parteId,
        movimientoId,
        tipo,
        cambios: describirMovimiento(resumen, { tipo }),
        servicio: { estadoGeneral, alcanceVigente: snapshot.servicioAlcance },
        verificacionVinculada: vinculado,
        ...(motivo ? { verificacionVinculoMotivo: motivo } : {}),
      },
      { status },
    )
  })
}

// Best-effort: enlazar el movimiento con la verificación de origen NUNCA
// bloquea la respuesta del parte. Cualquier motivo de rechazo de
// responderPorEnlace (credencial inválida/vencida/revocada, contradicción,
// etc.) se informa en el campo `verificacionVinculada` de la respuesta para
// que la UI pueda mostrar una advertencia si corresponde. Cuando el intento
// falla, además se deja un evento de auditoría append-only
// (`vinculo_fallido`) visible para el operador, y el motivo viaja en
// `verificacionVinculoMotivo` (sólo presente cuando hay un motivo).
async function intentarVincularVerificacion(
  vinculo: { id: string; token: string } | undefined,
  movimientoId: string,
): Promise<{ vinculado: boolean; motivo?: string }> {
  if (!vinculo) return { vinculado: false }
  try {
    return await getDb().transaction(tx => transaccionContextual.run(tx, async () => {
      const resultado = await responderPorEnlace({
        verificacionId: vinculo.id,
        token: vinculo.token,
        resultado: 'con_afectacion',
        movimientoId,
      })
      if (resultado.ok) return { vinculado: true }
      await registrarIntentoVinculoFallido({ verificacionId: vinculo.id, motivo: resultado.motivo })
      return { vinculado: false, motivo: resultado.motivo }
    }))
  } catch {
    const motivo = 'error_interno'
    await registrarIntentoVinculoFallido({ verificacionId: vinculo.id, motivo })
    return { vinculado: false, motivo }
  }
}

async function atenderPOST(request: Request) {
  await ensureSeeded()

  const ip = getClientIp(request)
  if (ipExcedeLimite(ip)) {
    return Response.json({ error: 'Demasiadas solicitudes. Intente nuevamente más tarde.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  // Enlace opcional con la verificación de origen (batch E1). Se extrae del
  // body crudo, aparte de parseParteActualizacionInput: es un campo hermano y
  // best-effort, una forma inválida se ignora en silencio en vez de dar 400.
  const verificacionRaw =
    body && typeof body === 'object' && 'verificacion' in body
      ? (body as { verificacion?: unknown }).verificacion
      : undefined
  const verificacionParsed = verificacionVinculoSchema.safeParse(verificacionRaw)
  const verificacionVinculo = verificacionParsed.success ? verificacionParsed.data : undefined

  const draftIdRaw = body && typeof body === 'object' && 'draftId' in body
    ? (body as { draftId?: unknown }).draftId
    : undefined
  const draftIdParsed = z.string().uuid().safeParse(draftIdRaw)
  if (draftIdRaw !== undefined && !draftIdParsed.success) {
    return Response.json({ error: 'draftId inválido' }, { status: 400 })
  }
  const draftId = draftIdParsed.success ? draftIdParsed.data : undefined

  const parsed = parseParteActualizacionInput(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const input = parsed.data

  const cue = normalizeCue(input.cue)
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  // La guarda va después de parsear el body y normalizar el CUE por la misma
  // razón que en GET: el CUE tiene que conocerse ANTES para poder validar la
  // sesión acotada por CUE del batch E1; quien ya tenía contraseña/sesión
  // admin entra exactamente igual que antes porque tieneAccesoAlParteParaCue
  // prueba esa vía primero.
  //
  // CONSECUENCIA DE SEGURIDAD EXPLÍCITA: un llamador sin ninguna credencial
  // ahora recibe 400 de validación de body/CUE ANTES que 401 de autorización
  // (antes era al revés). Esto no debilita el control de acceso real —nadie
  // sin credencial válida logra escribir nada, la guarda sigue siendo la
  // última puerta antes de cualquier escritura—, sólo cambia qué mensaje de
  // error ve primero un llamador no autenticado.
  if (!(await tieneAccesoAlParteParaCue(request, cue.value))) {
    return Response.json({ error: 'No autorizado' }, { status: await codigoSinAccesoParte() })
  }

  const db = getDb()
  const client = crearEjecutorSql(getRawClient())

  const resultado = await ejecutarActualizacionParte(input, { cueAnexo: cue.value, draftId }, { db, client,
    antesDeConfirmar: async movimientoId => {
      const { vinculado, motivo } = await intentarVincularVerificacion(verificacionVinculo, movimientoId)
      return { verificacionVinculada: vinculado, ...(motivo ? { verificacionVinculoMotivo: motivo } : {}) }
    },
  })

  if (resultado.tipo === 'error') {
    const { error } = resultado
    return Response.json(
      error.codigo ? { error: error.mensaje, codigo: error.codigo } : { error: error.mensaje },
      { status: error.status },
    )
  }
  if (resultado.tipo === 'fallo_interno') {
    // Solo nombre y mensaje: nunca el cuerpo de la request ni datos del parte.
    console.error('[problematicas/parte] POST failed', {
      error: resultado.causa instanceof Error ? `${resultado.causa.name}: ${resultado.causa.message}` : String(resultado.causa),
    })
    return Response.json({ error: 'No se pudo guardar la actualización' }, { status: 500 })
  }
  if (resultado.tipo === 'replay') {
    const { corteId, movimiento } = resultado
    return respuestaExito(
      cue.value,
      corteId,
      movimiento.parteId,
      movimiento.id,
      movimiento.tipo as TipoMovimiento,
      movimiento.resumen as unknown as DiffParte,
      200,
      verificacionVinculo,
    )
  }

  return Response.json(resultado.cuerpo, { status: 201 })
}

export const POST = conAuditoria('parte.guardar', '/api/problematicas/parte', atenderPOST)

export const GET = conAuditoria('parte.consultar', '/api/problematicas/parte', atenderGET)
