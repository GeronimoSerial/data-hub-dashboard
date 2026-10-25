// Estado actual del parte (spec §6, §17) y alta/actualización (spec §7, §8,
// §13). Un único POST cubre ambos casos — la decisión del producto mató
// "Continuar como otro episodio" (ver docs/trayectoria-contrato-implementacion.md):
// si ya existe un parte para el CUE en el período vigente, iniciar un reporte
// ES actualizar el parte. Mismo patrón de guardas que
// app/api/problematicas/route.ts: acceso público, ensureSeeded, rate limit,
// idempotencia, validación contra la base, transacción.
import { z } from 'zod'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb, getRawClient } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { ensureSeeded } from '@/lib/db/seed'
import {
  infraAfectacion,
  infraAfectacionAlumno,
  infraAfectacionCarrera,
  infraAfectacionSeccion,
  infraBorrador,
  infraBorradorCierre,
  infraMovimiento,
  infraParte,
  infraServicioAlcance,
} from '@/lib/db/schema'
import { codigoSinAccesoParte, tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import type { CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { crearEjecutorSql, getCorteVigente, type EjecutorSql } from '@/lib/infraestructura/ge-db'
import { alcanceGeParaCue, alcanceParaCue, type AlcanceCue, type AlcanceProvider } from '@/lib/infraestructura/alcance'
import { crearAlcanceMatricula } from '@/lib/infraestructura/alcance/matricula'
import {
  cambiosAlcanceInstituto,
  efectivoInstituto,
  efectivosPorAfectacion,
  leerScopeInstituto,
  mismoEfectivoInstituto,
  reemplazarScopeInstituto,
  resumenEfectivoInstituto,
  SCOPE_VACIO,
  type ScopeLeido,
} from '@/lib/infraestructura/parte/instituto-alcance'
import { estadoGeneralDelCue } from '@/lib/infraestructura/parte/instituto-estado'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'
import { getClientIp, ipExcedeLimite } from '@/lib/infraestructura/limites'
import { validarJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { listarMotivos } from '@/lib/infraestructura/motivos'
import { primerBloqueoParte } from '@/lib/infraestructura/consistencia-parte-servidor'
import { alcanceDeSecciones, severidadSugeridaPorAlcance } from '@/lib/infraestructura/consistencia-parte'
import { describirMovimiento } from '@/lib/infraestructura/movimiento-descripcion'
import { diffParte, esDiffVacio, type DiffParte } from '@/lib/infraestructura/movimiento-diff'
import {
  armarFichaParte,
  listarMovimientosDescritos,
  listarSituacionesRecientes,
  obtenerAfectacionesYServicio,
  obtenerParteActual,
  obtenerPeriodoVigente,
  snapshotDesde,
  type ParteActual,
} from '@/lib/infraestructura/parte-consulta'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { evaluarCambioAHabitual, type EstadoEdificioActivo } from '@/lib/infraestructura/consistencia-estado-activo'
import { causaElegible } from '@/lib/infraestructura/causa-afectacion'
import type {
  Afectacion,
  EstadoEstablecimiento,
  Severidad,
  TipoMovimiento,
} from '@/lib/infraestructura/trayectoria-tipos'
import { resolverCategoria, validarAlumnosPermitidos } from '@/lib/infraestructura/validacion'
import {
  parseParteActualizacionInput,
  parseParteInstitutoInput,
  type ParteInstitutoInput,
} from '@/lib/infraestructura/validacion-trayectoria'
import {
  registrarIntentoVinculoFallido,
  responderPorEnlace,
} from '@/lib/infraestructura/verificaciones'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MENSAJE_SIN_SITUACION =
  'No hay una situación hidrometeorológica en seguimiento para este establecimiento.'

class ErrorCierreBorrador extends Error {
  readonly status: number
  readonly codigo: string | undefined

  constructor(status: number, message: string, codigo?: string) {
    super(message)
    this.name = 'ErrorCierreBorrador'
    this.status = status
    this.codigo = codigo
  }
}

// Marca interna para distinguir, dentro del catch de la transacción de
// POST, un rollback deliberado (diff vacío, spec §17) de un error real de
// escritura. Nunca sale de este archivo.
class RollbackDiffVacio extends Error {}

// Corrección de la carrera cross-device del gate N1 (ver
// docs/ejecucion-enos/E1b/registro.md, "Correcciones del gate N1" → riesgo
// residual): dos dispositivos que mandan la primera alta del mismo CUE+
// período casi al mismo tiempo, cada uno con su propia idempotencyKey, no
// deben terminar duplicando la afectación que describe el mismo evento. Acá
// se compara el contenido de una entrada de `afectacionesNuevas` contra una
// afectación YA vigente en el parte (releída dentro de la transacción, con
// el lock de escritura tomado) para decidir si hay que insertarla de nuevo o
// si ya está cubierta. La comparación reconstruye el mismo alcance por
// sección que arma cargarAfectaciones (parte-consulta.ts) para que sea
// exacta, no una aproximación.
function motivoCategoriaSeveridadDescripcionCoinciden(
  existente: Afectacion,
  entrada: { motivo: string; severidad: Severidad; descripcion?: string | null },
  categoria: CategoriaAfectacion,
): boolean {
  return (
    existente.motivo === entrada.motivo &&
    existente.categoria === categoria &&
    existente.severidad === entrada.severidad &&
    (existente.descripcion ?? null) === (entrada.descripcion ?? null)
  )
}

async function seccionesEsperadas(
  alcance: AlcanceProvider,
  geSectionIds: number[],
  alumnosSeleccionados: number[] | undefined,
): Promise<Map<number, { seccionCompleta: boolean; alumnos: Set<number> }>> {
  const membresia = await alcance.listMembers(geSectionIds)
  const seleccionados = new Set(alumnosSeleccionados ?? [])
  const resultado = new Map<number, { seccionCompleta: boolean; alumnos: Set<number> }>()
  for (const geSectionId of geSectionIds) {
    const matriculados = membresia.get(geSectionId) ?? new Set<number>()
    const interseccion = [...matriculados].filter((id) => seleccionados.has(id))
    resultado.set(
      geSectionId,
      interseccion.length > 0
        ? { seccionCompleta: false, alumnos: new Set(interseccion) }
        : { seccionCompleta: true, alumnos: matriculados },
    )
  }
  return resultado
}

function seccionesCoincidenConEsperadas(
  existente: Afectacion,
  esperadas: Map<number, { seccionCompleta: boolean; alumnos: Set<number> }>,
): boolean {
  if (existente.secciones.length !== esperadas.size) return false
  for (const seccion of existente.secciones) {
    const esperada = esperadas.get(seccion.geSectionId)
    if (!esperada) return false
    if (esperada.seccionCompleta !== seccion.seccionCompleta) return false
    if (esperada.alumnos.size !== seccion.alumnos.length) return false
    for (const id of seccion.alumnos) {
      if (!esperada.alumnos.has(id)) return false
    }
  }
  return true
}

// Busca, entre las afectaciones vigentes ya persistidas, una que describa
// EXACTAMENTE el mismo evento que `entrada` (mismo motivo/categoría/
// severidad/descripción y el mismo alcance de secciones+alumnos). El chequeo
// barato (campos escalares) va primero para no pagar la consulta de
// membresía en el caso común de una afectación genuinamente nueva.
async function buscarAfectacionEquivalente(
  alcance: AlcanceProvider,
  candidatas: Afectacion[],
  entrada: {
    motivo: string
    severidad: Severidad
    descripcion?: string | null
    causadaPorId?: string | null
    secciones: number[]
    alumnos?: number[]
  },
  categoria: CategoriaAfectacion,
): Promise<Afectacion | undefined> {
  const posibles = candidatas.filter((existente) =>
    motivoCategoriaSeveridadDescripcionCoinciden(existente, entrada, categoria) &&
    (existente.causadaPorId ?? null) === (entrada.causadaPorId ?? null),
  )
  if (posibles.length === 0) return undefined
  const esperadas = await seccionesEsperadas(alcance, entrada.secciones, entrada.alumnos)
  return posibles.find((existente) => seccionesCoincidenConEsperadas(existente, esperadas))
}

// Equivalente para institutos: mismo evento (motivo, categoría, severidad,
// descripción y causa) con el mismo alcance efectivo de carreras y alumnos.
async function buscarAfectacionEquivalenteInstituto(
  client: EjecutorSql,
  alcance: AlcanceProvider,
  lector: Parameters<typeof leerScopeInstituto>[0],
  cueAnexo: string,
  corteVigente: number,
  candidatas: Afectacion[],
  entrada: {
    motivo: string
    severidad: Severidad
    descripcion?: string | null
    causadaPorId?: string | null
    carreras?: number[]
    alumnos?: number[]
  },
  categoria: CategoriaAfectacion,
): Promise<Afectacion | undefined> {
  const posibles = candidatas.filter((existente) =>
    motivoCategoriaSeveridadDescripcionCoinciden(existente, entrada, categoria) &&
    (existente.causadaPorId ?? null) === (entrada.causadaPorId ?? null),
  )
  if (posibles.length === 0) return undefined
  const esperado = await efectivoInstituto(alcance, {
    carreras: entrada.carreras ?? [],
    alumnos: entrada.alumnos ?? [],
  })
  const scopes = await leerScopeInstituto(lector, posibles.map((p) => p.id))
  // Cada candidata se compara con el corte con que se guardó; una consulta de
  // miembros por corte, no una por candidata.
  const efectivos = await efectivosPorAfectacion(client, cueAnexo, scopes, corteVigente)
  for (const existente of posibles) {
    if (mismoEfectivoInstituto(esperado, efectivos.get(existente.id))) return existente
  }
  return undefined
}

// Campo hermano opcional a nivel raíz del mismo body de POST (batch E1). Vive
// SEPARADO de parteActualizacionInputSchema para no tocar el contrato del
// parte: si viene con forma inválida se ignora en silencio, nunca es un 400.
const verificacionVinculoSchema = z
  .object({
    id: z.string().trim().min(1),
    token: z.string().trim().min(1),
  })
  .optional()

async function handleGET(request: Request) {
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
      const alcanceCue = await alcanceParaCue(client, corte.id, cue.value)
      const resueltas = await alcanceCue.resolveIdentities([...idsAlumnos])
      // La clave es el id de miembro (en GE, el ge_person_id que ya viaja en
      // alumnos[].gePersonId de la respuesta).
      identidades = new Map(resueltas.map((i) => [i.miembroId, { nombre: i.nombre, apellido: i.apellido }]))
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
  alcanceCue: AlcanceCue,
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
  // Institutos: el estado general se calcula sobre sus carreras del corte vigente.
  const carrerasReplay = alcanceCue.sistema === 'matricula'
    ? (await alcanceCue.listUnits()).map((u) => u.id)
    : []
  const estadoGeneral = estadoGeneralDelCue(snapshot.servicioAlcance, snapshot.secciones, carrerasReplay)

  // Best-effort, igual que en el camino de transacción nueva: un replay
  // idempotente o la carrera de idempotencia también pueden traer el vínculo
  // de verificación (batch E1), y nunca deben bloquear esta respuesta.
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
    const resultado = await responderPorEnlace({
      verificacionId: vinculo.id,
      token: vinculo.token,
      resultado: 'con_afectacion',
      movimientoId,
    })
    if (resultado.ok) return { vinculado: true }
    await registrarIntentoVinculoFallido({ verificacionId: vinculo.id, motivo: resultado.motivo })
    return { vinculado: false, motivo: resultado.motivo }
  } catch (err) {
    const motivo = err instanceof Error ? err.message : 'error_interno'
    await registrarIntentoVinculoFallido({ verificacionId: vinculo.id, motivo })
    return { vinculado: false, motivo }
  }
}

// Sistema del CUE para elegir el esquema de parseo (GE salvo instituto superior
// con corte de matrícula vigente).
async function sistemaDelCue(cue: string): Promise<'ge' | 'matricula'> {
  try {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)
    return (await alcanceParaCue(client, 0, cue)).sistema
  } catch {
    return 'ge'
  }
}

// Verdadero si el cuerpo trae `carreras` en alguna afectación o en el servicio.
function declaraCarreras(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const b = body as {
    afectacionesNuevas?: unknown
    afectacionesModificadas?: unknown
    servicioEducativo?: { alcance?: { tipo?: unknown } } | null
  }
  const lista = (v: unknown): Array<Record<string, unknown>> =>
    Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []
  return (
    [...lista(b.afectacionesNuevas), ...lista(b.afectacionesModificadas)].some((a) => 'carreras' in a) ||
    b.servicioEducativo?.alcance?.tipo === 'carrera'
  )
}

async function handlePOST(request: Request) {
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

  // El sistema del CUE decide el esquema de parseo. Se resuelve con el mismo
  // criterio que alcanceParaCue (más abajo, con el corte en mano); acá sólo
  // hace falta para elegir el esquema. Ante un fallo de lectura queda GE, que
  // es el comportamiento anterior.
  const cueCrudo = typeof (body as { cue?: unknown } | null)?.cue === 'string'
    ? normalizeCue((body as { cue: string }).cue)
    : null
  const sistemaCrudo = cueCrudo ? await sistemaDelCue(cueCrudo.value) : 'ge'
  // En GE, `carreras` no existe: se rechaza antes del parseo para que el mensaje
  // sea siempre el de la ruta, sin depender de qué campo falló primero.
  if (sistemaCrudo === 'ge' && declaraCarreras(body)) {
    return jsonError('Este establecimiento informa por secciones', 400)
  }
  let input: ParteInstitutoInput
  if (sistemaCrudo === 'matricula') {
    const parsed = parseParteInstitutoInput(body)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
    input = parsed.data
  } else {
    // Esquema GE de HEAD, sin cambios: mismos mensajes y mismo orden de errores.
    const parsed = parseParteActualizacionInput(body)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
    input = parsed.data
  }

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

  // Idempotencia: antes de cualquier escritura. Deliberadamente NO se aplica
  // CUE_MAX_ALERTAS_ACTIVAS acá (ver docs/trayectoria-contrato-implementacion.md
  // y batch-3-spec.md): hay un único parte por CUE y período, ese tope era
  // del modelo deprecado (retirado en la Fase 4) y capar actualizaciones
  // dejaría a un director afuera en medio de una inundación.
  const [movimientoExistente] = await db
    .select()
    .from(infraMovimiento)
    .where(eq(infraMovimiento.idempotencyKey, input.idempotencyKey))
    .limit(1)

  await asegurarGeAdjuntada(client)
  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }
  // Capturada en una const propia: el chequeo de arriba no sobrevive el
  // análisis de flujo de TypeScript dentro de los closures que siguen
  // (alumnosPertenecenAUnidades, el callback de la transacción).
  const corteId = corte.id
  // Un único alcance por request: GE (padrón) o matrícula (instituto superior).
  // Lo usan la idempotencia, la validación y la transacción.
  const alcanceCue = await alcanceParaCue(client, corteId, cue.value)
  const esInstituto = alcanceCue.sistema === 'matricula'
  // Corte de matrícula con el que se escriben las filas de institutos.
  const corteInstituto = alcanceCue.sistema === 'matricula' ? alcanceCue.corteId : corteId

  if (movimientoExistente) {
    return respuestaExito(
      cue.value,
      corteId,
      alcanceCue,
      movimientoExistente.parteId,
      movimientoExistente.id,
      movimientoExistente.tipo as TipoMovimiento,
      movimientoExistente.resumen as unknown as DiffParte,
      200,
      verificacionVinculo,
    )
  }

  const periodo = await obtenerPeriodoVigente(db)
  if (!periodo) {
    return Response.json({ error: 'No hay un período hidrometeorológico vigente' }, { status: 503 })
  }

  // --- Validación contra la base, igual que POST /api/problematicas ---

  const motivos = await listarMotivos()
  const nuevasConCategoria: Array<{
    input: (typeof input.afectacionesNuevas)[number]
    categoria: CategoriaAfectacion
  }> = []
  for (const entrada of input.afectacionesNuevas) {
    const resuelto = resolverCategoria(entrada.motivo, motivos)
    if (!resuelto.ok) {
      return Response.json({ error: resuelto.error }, { status: 400 })
    }
    const permitido = validarAlumnosPermitidos(resuelto.categoria, entrada.alumnos)
    if (!permitido.ok) {
      return Response.json({ error: permitido.error }, { status: 400 })
    }
    nuevasConCategoria.push({ input: entrada, categoria: resuelto.categoria })
  }

  // Reglas de consistencia (mismo módulo que el asistente): una combinación
  // bloqueada no se guarda. Las advertencias no bloquean.
  const bloqueo = primerBloqueoParte(
    nuevasConCategoria.map(({ input: entrada, categoria }) => ({
      categoria,
      motivoId: motivos.find((m) => m.nombre === entrada.motivo)?.id ?? null,
      severidad: entrada.severidad,
      justificacionCritica: entrada.justificacionCritica,
      descripcion: entrada.descripcion,
      seccionesCantidad: (entrada.secciones?.length ?? 0) + (entrada.carreras?.length ?? 0),
    })),
    {
      estadoEstablecimiento: input.estadoEstablecimiento?.estado ?? null,
      servicioEstado: input.servicioEducativo?.estado ?? null,
      asistenciaBrinda: input.asistenciaPedagogica?.brinda ?? null,
    },
  )
  if (bloqueo) {
    return Response.json({ error: bloqueo.mensaje, codigo: bloqueo.codigo }, { status: 400 })
  }

  // Toda la validación y las lecturas del CUE usan el alcance resuelto arriba;
  // sus unidades son secciones en GE y carreras en matrícula.
  const unidades = await alcanceCue.listUnits()
  if (esInstituto && unidades.length === 0) {
    return jsonError('No hay carreras cargadas para este establecimiento', 400)
  }
  const unidadesCueSet = new Set(unidades.map((u) => u.id))
  const turnosCueSet = new Set(unidades.map((u) => u.turno))
  const seccionInvalida = (ids: number[]) => ids.some((id) => !unidadesCueSet.has(id))
  // La sugerida depende del alcance real (todas las unidades del CUE), igual
  // que en el formulario: sólo así cliente y servidor exigen lo mismo.
  const todasLasUnidades = unidades.map((u) => u.id)
  const mensajeUnidadInvalida = esInstituto
    ? 'Alguna de las carreras no pertenece al establecimiento indicado'
    : 'Alguna de las secciones no pertenece al establecimiento indicado'
  const mensajeAlumnosUnidad = esInstituto
    ? 'Alguno de los alumnos seleccionados no pertenece a las carreras indicadas'
    : 'Alguno de los alumnos seleccionados no pertenece a las secciones indicadas'
  const mensajeCadaUnidad = esInstituto
    ? 'Cada carrera elegida debe incluir al menos un alumno'
    : 'Cada sección elegida debe incluir al menos un alumno'
  // Snapshot GE-shaped (ParteActual.secciones): sólo GE tiene secciones. Los
  // institutos no las usan y su estado general se calcula con sus carreras.
  const secciones = alcanceCue.sistema === 'ge' ? await alcanceCue.listarSeccionesGe() : []
  const carrerasCue = esInstituto ? todasLasUnidades : []
  // Unidades que elige una entrada: carreras en matrícula, secciones en GE.
  const unidadesDe = (entrada: { secciones?: number[]; carreras?: number[] }): number[] =>
    (esInstituto ? entrada.carreras : entrada.secciones) ?? []

  // Cada CUE informa con su forma: GE por secciones, institutos por carreras.
  const pideCarreras =
    input.afectacionesNuevas.some((e) => (e.carreras?.length ?? 0) > 0) ||
    input.afectacionesModificadas.some((m) => m.carreras !== undefined) ||
    input.servicioEducativo?.alcance.tipo === 'carrera'
  const pideSecciones =
    input.afectacionesNuevas.some((e) => (e.secciones?.length ?? 0) > 0) ||
    input.afectacionesModificadas.some((m) => m.secciones !== undefined) ||
    input.servicioEducativo?.alcance.tipo === 'seccion'
  if (esInstituto && pideSecciones) {
    return jsonError('Este establecimiento informa por carreras, no por secciones', 400)
  }
  if (!esInstituto && pideCarreras) {
    return jsonError('Este establecimiento informa por secciones', 400)
  }

  for (const { input: entrada } of nuevasConCategoria) {
    const unidadesEntrada = unidadesDe(entrada)
    if (seccionInvalida(unidadesEntrada)) return jsonError(mensajeUnidadInvalida, 400)
    const sugerida = severidadSugeridaPorAlcance(
      motivos.find((m) => m.nombre === entrada.motivo)?.id ?? null,
      alcanceDeSecciones(unidadesEntrada, todasLasUnidades),
    )
    const justificada = validarJustificacionCritica({
      severidad: entrada.severidad,
      sugerida,
      justificacion: entrada.justificacionCritica,
      detalle: entrada.justificacionCriticaDetalle,
    })
    if (!justificada.ok) return jsonError(justificada.error, 400)
  }
  for (const modificacion of input.afectacionesModificadas) {
    const unidadesCambio = esInstituto ? modificacion.carreras : modificacion.secciones
    if (unidadesCambio && seccionInvalida(unidadesCambio)) return jsonError(mensajeUnidadInvalida, 400)
  }
  if (esInstituto && input.afectacionesModificadas.some((m) => m.carreras?.length === 0)) {
    return jsonError('Debe incluir al menos una carrera', 400)
  }
  const alcanceServicio = input.servicioEducativo?.alcance
  if (alcanceServicio?.tipo === 'seccion' && seccionInvalida(alcanceServicio.secciones)) {
    return jsonError(mensajeUnidadInvalida, 400)
  }
  if (alcanceServicio?.tipo === 'carrera' && seccionInvalida(alcanceServicio.carreras)) {
    return jsonError(mensajeUnidadInvalida, 400)
  }
  if (
    input.servicioEducativo?.alcance.tipo === 'turno' &&
    input.servicioEducativo.alcance.turnos.some((t) => !turnosCueSet.has(t))
  ) {
    return jsonError('Alguno de los turnos no pertenece al establecimiento indicado', 400)
  }

  async function alumnosPertenecenAUnidades(unidadIds: number[], alumnoIds: number[] | undefined) {
    if (!alumnoIds || alumnoIds.length === 0) return true
    if (unidadIds.length === 0) return false
    const membresia = await alcanceCue.listMembers(unidadIds)
    const todos = new Set<number>()
    for (const set of membresia.values()) for (const id of set) todos.add(id)
    return alumnoIds.every((id) => todos.has(id))
  }

  for (const { input: entrada } of nuevasConCategoria) {
    if (!(await alumnosPertenecenAUnidades(unidadesDe(entrada), entrada.alumnos))) {
      return jsonError(mensajeAlumnosUnidad, 400)
    }
  }

  for (const { input: entrada, categoria } of nuevasConCategoria) {
    if (categoria !== 'alumnos') continue
    const unidadesEntrada = unidadesDe(entrada)
    const membresia = await alcanceCue.listMembers(unidadesEntrada)
    const alumnos = new Set(entrada.alumnos ?? [])
    const todasConAlumno = unidadesEntrada.every((unidad) =>
      [...(membresia.get(unidad) ?? [])].some((id) => alumnos.has(id)),
    )
    if (!todasConAlumno) return jsonError(mensajeCadaUnidad, 400)
  }

  const [parteExistente] = await db
    .select()
    .from(infraParte)
    .where(and(eq(infraParte.cueAnexo, cue.value), eq(infraParte.periodoId, periodo.id)))
    .limit(1)

  const evacuaAhora = input.estadoEstablecimiento?.estado === 'evacuado' || input.estadoEstablecimiento?.estado === 'centro_evacuados'
  if (evacuaAhora && !input.confirmarInterrupcionTotal && parteExistente && input.servicioEducativo === undefined) {
    const alcancesVigentes = await db.select({ tipo: infraServicioAlcance.tipo }).from(infraServicioAlcance)
      .where(and(eq(infraServicioAlcance.parteId, parteExistente.id), isNull(infraServicioAlcance.retiradaEn)))
    const hayAlcanceTotalOTurno = alcancesVigentes.some((a) => a.tipo === 'establecimiento' || a.tipo === 'turno')
    if (!hayAlcanceTotalOTurno) {
      // Afectación por secciones (GE) o por carreras (institutos): cualquiera de
      // las dos cuenta como interrupción parcial.
      const [hechoPorSecciones] = await db.select({ id: infraAfectacionSeccion.geSectionId })
        .from(infraAfectacionSeccion)
        .innerJoin(infraAfectacion, eq(infraAfectacion.id, infraAfectacionSeccion.afectacionId))
        .where(and(eq(infraAfectacion.parteId, parteExistente.id), isNull(infraAfectacion.retiradaEn)))
        .limit(1)
      const [hechoPorCarreras] = await db.select({ id: infraAfectacionCarrera.carreraId })
        .from(infraAfectacionCarrera)
        .innerJoin(infraAfectacion, eq(infraAfectacion.id, infraAfectacionCarrera.afectacionId))
        .where(and(eq(infraAfectacion.parteId, parteExistente.id), isNull(infraAfectacion.retiradaEn)))
        .limit(1)
      if (hechoPorSecciones || hechoPorCarreras) return jsonError('Confirme que se interrumpe todo el establecimiento', 400)
    }
  }

  const idsReferenciados = [
    ...input.afectacionesModificadas.map((m) => m.id),
    ...input.afectacionesRetiradas,
    ...input.afectacionesSolucionadas.map((s) => s.id),
    ...input.afectacionesConfirmadas,
  ]
  if (idsReferenciados.length > 0) {
    if (!parteExistente) {
      return jsonError('La afectación indicada no existe en el parte actual', 400)
    }
    const existentes = await db
      .select()
      .from(infraAfectacion)
      .where(and(eq(infraAfectacion.parteId, parteExistente.id), inArray(infraAfectacion.id, idsReferenciados)))
    const existentesPorId = new Map(existentes.map((a) => [a.id, a]))
    for (const id of idsReferenciados) {
      const fila = existentesPorId.get(id)
      if (!fila || fila.retiradaEn !== null) {
        return jsonError('La afectación indicada no existe o ya fue retirada', 400)
      }
    }

    // Unidades vigentes de una afectación: sólo se leen si el cambio no trae
    // las suyas. Institutos: carreras de la matrícula; GE: filas de sección.
    const scopesActuales = esInstituto
      ? await leerScopeInstituto(db, input.afectacionesModificadas.map((m) => m.id))
      : new Map<string, ScopeLeido>()
    const unidadesVigentes = async (afectacionId: string): Promise<number[]> => {
      if (esInstituto) return scopesActuales.get(afectacionId)?.carreras ?? []
      const filas = await db
        .select({ geSectionId: infraAfectacionSeccion.geSectionId })
        .from(infraAfectacionSeccion)
        .where(eq(infraAfectacionSeccion.afectacionId, afectacionId))
      return filas.map((s) => s.geSectionId)
    }

    for (const modificacion of input.afectacionesModificadas) {
      if (modificacion.severidad === undefined) continue
      const fila = existentesPorId.get(modificacion.id)
      // Sin unidades en el cambio, el alcance es el que la afectación ya tiene.
      const unidadesCambio = esInstituto ? modificacion.carreras : modificacion.secciones
      const unidadesActuales = unidadesCambio ?? (await unidadesVigentes(modificacion.id))
      const sugerida = severidadSugeridaPorAlcance(
        motivos.find((m) => m.nombre === fila?.motivo)?.id ?? null,
        alcanceDeSecciones(unidadesActuales, todasLasUnidades),
      )
      const justificada = validarJustificacionCritica({
        severidad: modificacion.severidad,
        sugerida,
        justificacion: modificacion.justificacionCritica,
        detalle: modificacion.justificacionCriticaDetalle,
      })
      if (!justificada.ok) return jsonError(justificada.error, 400)
    }

    // Un instituto no mezcla cortes: cambiar alumnos sin elegir carreras de nuevo
    // sobre una afectación de un corte reemplazado daría filas de dos cortes.
    for (const modificacion of input.afectacionesModificadas) {
      if (!esInstituto || modificacion.alumnos === undefined || modificacion.carreras !== undefined) continue
      const corteAfectacion = scopesActuales.get(modificacion.id)?.corteId
      if (corteAfectacion != null && corteAfectacion !== corteInstituto) {
        return jsonError('La matrícula se actualizó: vuelva a elegir las carreras', 400)
      }
    }

    for (const modificacion of input.afectacionesModificadas) {
      if (!modificacion.alumnos || modificacion.alumnos.length === 0) continue
      const unidadesCambio = esInstituto ? modificacion.carreras : modificacion.secciones
      const unidadesEfectivas = unidadesCambio ?? (await unidadesVigentes(modificacion.id))
      if (!(await alumnosPertenecenAUnidades(unidadesEfectivas, modificacion.alumnos))) {
        return jsonError(mensajeAlumnosUnidad, 400)
      }
    }
  }

  const idsCausa = [...new Set(input.afectacionesNuevas.flatMap((a) => (a.causadaPorId ? [a.causadaPorId] : [])))]
  const motivoCausaExterna = new Map<string, string>()
  if (idsCausa.length > 0) {
    const causas = await db
      .select({ id: infraAfectacion.id, motivo: infraAfectacion.motivo, retiradaEn: infraAfectacion.retiradaEn, cueAnexo: infraParte.cueAnexo })
      .from(infraAfectacion)
      .innerJoin(infraParte, eq(infraParte.id, infraAfectacion.parteId))
      .where(inArray(infraAfectacion.id, idsCausa))
    const porId = new Map(causas.map((c) => [c.id, c]))
    for (const causa of causas) motivoCausaExterna.set(causa.id, causa.motivo)
    for (const id of idsCausa) {
      const causa = porId.get(id)
      if (!causa || !causaElegible(causa, cue.value, input.rigeDesde)) {
        return jsonError('La situación indicada como causa no es válida', 400)
      }
    }
  }

  const ahora = new Date().toISOString()
  // Definite assignment: cada iteración del loop de reintentos de más abajo
  // o bien asigna `resultado` y hace `break`, o bien `return`-ea antes de
  // salir del bloque — TypeScript no puede seguir esa garantía a través del
  // `for` + `break`.
  let resultado!: { status: number; body: unknown }

  // Transacción real de Postgres vía db.transaction() de Drizzle
  // (drizzle-orm/node-postgres, o drizzle-orm/pglite en tests): a diferencia
  // del driver de libsql, acá db.transaction() abre un BEGIN real sobre una
  // única conexión reservada del pool y hace COMMIT/ROLLBACK automáticamente.
  // Ese es justamente el comportamiento que el workaround manual con BEGIN
  // IMMEDIATE de SQLite intentaba conseguir; en Postgres el problema que lo
  // forzaba no existe, así que se usa la transacción nativa de Drizzle (mismo
  // query builder `tx`) y se elimina la ventana de carrera que motivaba el
  // BEGIN IMMEDIATE.
  //
  // Todo el bloque sigue viviendo dentro de un reintento manual
  // (lib/db/reintento.ts#conReintentoPorBloqueo): si esta request pierde la
  // carrera por el lock de escritura contra otra, se entera y reintenta el
  // bloque COMPLETO tras una espera corta con jitter, releyendo el estado
  // real dentro de la nueva transacción — nunca sólo el BEGIN, porque toda la
  // lógica de "¿existe ya el parte?" de más abajo depende de ese estado
  // fresco. Cada reintento vuelve a llamar a db.transaction() de cero, con
  // una conexión y un BEGIN nuevos.
  try {
    resultado = await conReintentoPorBloqueo(async () => {
      return await db.transaction(async (tx) => {
      if (draftId) {
        const [closure] = await tx.select().from(infraBorradorCierre)
          .where(eq(infraBorradorCierre.draftId, draftId)).limit(1)
        if (closure) throw new ErrorCierreBorrador(410, 'El borrador ya está cerrado')

        const [draft] = await tx.select().from(infraBorrador)
          .where(eq(infraBorrador.id, draftId)).limit(1)
        if (!draft) throw new ErrorCierreBorrador(404, 'No se encontró el borrador')
        if (draft.cueAnexo !== cue.value) {
          throw new ErrorCierreBorrador(409, 'El borrador no corresponde al CUE del reporte')
        }
        if (draft.estado !== 'open') throw new ErrorCierreBorrador(410, 'El borrador ya está cerrado')
      }
      // Ejecutor de GE ligado a la MISMA conexión que sostiene esta
      // transacción. Nunca se usa `client` (el pool/raw separado) dentro del
      // callback: bajo PGlite, emitir una query por el cliente raw mientras la
      // transacción tiene la única sesión ocupada esperando el COMMIT produce
      // un deadlock real (la query raw queda encolada detrás del COMMIT y la
      // transacción no puede cerrar hasta que el callback —que espera esa
      // query— termine). Ver crearEjecutorSql en ge-db.ts.
      const clienteGeEnTx = crearEjecutorSql(tx)
      let parteId: string
      let esNuevoParte: boolean
      if (parteExistente) {
        parteId = parteExistente.id
        esNuevoParte = false
      } else {
        const nuevoId = crypto.randomUUID()
        await tx
          .insert(infraParte)
          .values({
            id: nuevoId,
            periodoId: periodo.id,
            cueAnexo: cue.value,
            estadoEstablecimiento: 'habitual',
            asistenciaPedagogica: null,
            estadoEstablecimientoRigeDesde: input.rigeDesde,
            corteId,
            creadaEn: ahora,
            actualizadaEn: ahora,
          })
          // Carrera en (cue_anexo, periodo_id): si otra request ya creó el
          // parte mientras ésta esperaba el lock de escritura, este insert
          // simplemente no hace nada y releemos abajo.
          .onConflictDoNothing()
        const [fila] = await tx
          .select({ id: infraParte.id })
          .from(infraParte)
          .where(and(eq(infraParte.cueAnexo, cue.value), eq(infraParte.periodoId, periodo.id)))
          .limit(1)
        if (!fila) throw new Error('No se pudo crear ni leer el parte')
        parteId = fila.id
        // Si `fila.id` no es el id que generamos, otra transacción ganó la
        // carrera del alta y ya creó el parte: esta request pasa a tratarse
        // como una actualización, no como un segundo "reporte_inicial" del
        // mismo parte (riesgo residual de E1b).
        esNuevoParte = fila.id === nuevoId
      }

      // --- Fotografía "antes" (spec §12), releída DENTRO de la transacción
      // con el lock de escritura ya tomado — nunca la `parteExistente` de
      // más arriba, que pudo quedar desactualizada por la misma carrera.
      const [parteFilaActual] = await tx.select().from(infraParte).where(eq(infraParte.id, parteId)).limit(1)
      const { afectaciones: afectacionesActuales, servicioAlcance: servicioAlcanceActual } =
        await obtenerAfectacionesYServicio(tx, clienteGeEnTx, cue.value, parteId, corteId)
      const actualAntesReal: ParteActual = parteFilaActual
        ? {
            periodo,
            parte: { ...parteFilaActual, estadoEstablecimiento: parteFilaActual.estadoEstablecimiento as EstadoEstablecimiento, asistenciaPedagogica: parteFilaActual.asistenciaPedagogica ? JSON.parse(parteFilaActual.asistenciaPedagogica) : null },
            afectaciones: afectacionesActuales,
            servicioAlcance: servicioAlcanceActual,
            secciones,
          }
        : { periodo, parte: null, afectaciones: [], servicioAlcance: [], secciones }
      const antes = snapshotDesde(actualAntesReal, input.rigeDesde)
      const afectacionesVigentesActuales = afectacionesActuales.filter((a) => a.retiradaEn === null)

      // Contradicción con la situación activa (T6), evaluada contra el estado
      // releído con el lock de escritura: cubre a dos personas que reportan a
      // la vez. Una combinación bloqueada aborta la transacción entera.
      const cambioAHabitual = evaluarCambioAHabitual({
        estadoActual: (parteFilaActual?.estadoEstablecimiento as EstadoEdificioActivo | undefined) ?? null,
        nuevoEstado: input.estadoEstablecimiento?.estado ?? null,
        servicioActual: estadoGeneralDelCue(servicioAlcanceActual, secciones, carrerasCue),
        servicioEnvio: input.servicioEducativo?.estado ?? null,
        afectacionesActivas: afectacionesVigentesActuales.map((a) => ({ id: a.id })),
        solucionadas: [...input.afectacionesSolucionadas.map((s) => s.id), ...input.afectacionesRetiradas],
        sigueActiva: input.afectacionesConfirmadas,
      })
      const bloqueoActivo = cambioAHabitual.bloqueos[0]
      if (bloqueoActivo) {
        throw new ErrorCierreBorrador(409, bloqueoActivo.mensaje, bloqueoActivo.codigo)
      }
      const causaPorNuevaId = new Map<string, string>()
      // Alcance del CUE dentro de la transacción, sobre el ejecutor ligado a
      // `tx`. Institutos: carreras y alumnos de matrícula; GE: secciones.
      const alcanceTx: AlcanceCue = alcanceCue.sistema === 'matricula'
        ? crearAlcanceMatricula(clienteGeEnTx, alcanceCue.corteId, cue.value)
        : alcanceGeParaCue(clienteGeEnTx, corteId, cue.value)
      // Alcance de institutos ANTES de escribir: base del diff de carreras y alumnos.
      const scopesAntes = esInstituto
        ? await leerScopeInstituto(tx, afectacionesVigentesActuales.map((a) => a.id))
        : new Map<string, ScopeLeido>()

      for (const { input: entrada, categoria } of nuevasConCategoria) {
        // Nunca duplicar una afectación que otro dispositivo ya insertó para
        // el mismo evento (misma carrera de alta cross-device): si el
        // contenido coincide exactamente con una ya vigente, esta entrada es
        // un no-op.
        const equivalente = esInstituto
          ? await buscarAfectacionEquivalenteInstituto(
            clienteGeEnTx,
            alcanceTx,
            tx,
            cue.value,
            corteInstituto,
            afectacionesVigentesActuales,
            entrada,
            categoria,
          )
          : await buscarAfectacionEquivalente(
            alcanceTx,
            afectacionesVigentesActuales,
            { ...entrada, secciones: entrada.secciones ?? [] },
            categoria,
          )
        if (equivalente) continue

        const id = crypto.randomUUID()
        if (entrada.causadaPorId) causaPorNuevaId.set(id, entrada.causadaPorId)
        await tx.insert(infraAfectacion).values({
          id,
          parteId,
          motivo: entrada.motivo,
          categoria,
          severidad: entrada.severidad,
          justificacionCritica: entrada.justificacionCritica ?? null,
          justificacionCriticaDetalle: entrada.justificacionCriticaDetalle ?? null,
          descripcion: entrada.descripcion ?? null,
          causadaPorId: entrada.causadaPorId ?? null,
          rigeDesde: input.rigeDesde,
          creadaEn: ahora,
          retiradaEn: null,
        })
        if (esInstituto) {
          await reemplazarScopeInstituto(tx, id, corteInstituto, {
            carreras: entrada.carreras ?? [],
            alumnos: entrada.alumnos ?? [],
          })
        } else {
          await tx
            .insert(infraAfectacionSeccion)
            .values((entrada.secciones ?? []).map((geSectionId) => ({ afectacionId: id, geSectionId })))
          if (entrada.alumnos && entrada.alumnos.length > 0) {
            await tx
              .insert(infraAfectacionAlumno)
              .values(entrada.alumnos.map((gePersonId) => ({ afectacionId: id, gePersonId })))
          }
        }
      }

      for (const modificacion of input.afectacionesModificadas) {
        const cambios: {
          severidad?: string
          descripcion?: string | null
          justificacionCritica?: string | null
          justificacionCriticaDetalle?: string | null
        } = {}
        if (modificacion.severidad !== undefined) {
          cambios.severidad = modificacion.severidad
          cambios.justificacionCritica = modificacion.justificacionCritica ?? null
          cambios.justificacionCriticaDetalle = modificacion.justificacionCriticaDetalle ?? null
        }
        if (modificacion.descripcion !== undefined) cambios.descripcion = modificacion.descripcion
        if (Object.keys(cambios).length > 0) {
          await tx.update(infraAfectacion).set(cambios).where(eq(infraAfectacion.id, modificacion.id))
        }
        if (esInstituto) {
          if (modificacion.carreras !== undefined || modificacion.alumnos !== undefined) {
            const actual = (await leerScopeInstituto(tx, [modificacion.id])).get(modificacion.id) ?? SCOPE_VACIO
            const carreras = modificacion.carreras ?? actual.carreras
            // Un alumno sobrevive sólo si sigue dentro de las carreras elegidas.
            const dentro = new Set([...(await efectivoInstituto(alcanceTx, { carreras, alumnos: [] })).values()].flatMap((set) => [...set]))
            const alumnos = (modificacion.alumnos ?? actual.alumnos).filter((id) => dentro.has(id))
            await reemplazarScopeInstituto(tx, modificacion.id, corteInstituto, { carreras, alumnos })
          }
        } else {
          if (modificacion.secciones !== undefined) {
            await tx.delete(infraAfectacionSeccion).where(eq(infraAfectacionSeccion.afectacionId, modificacion.id))
            if (modificacion.secciones.length > 0) {
              await tx
                .insert(infraAfectacionSeccion)
                .values(modificacion.secciones.map((geSectionId) => ({ afectacionId: modificacion.id, geSectionId })))
            }
          }
          if (modificacion.alumnos !== undefined) {
            await tx.delete(infraAfectacionAlumno).where(eq(infraAfectacionAlumno.afectacionId, modificacion.id))
            if (modificacion.alumnos.length > 0) {
              await tx
                .insert(infraAfectacionAlumno)
                .values(modificacion.alumnos.map((gePersonId) => ({ afectacionId: modificacion.id, gePersonId })))
            }
          }
        }
      }

      if (input.afectacionesRetiradas.length > 0) {
        await tx
          .update(infraAfectacion)
          .set({ retiradaEn: input.rigeDesde, cierre: 'retirada' })
          .where(inArray(infraAfectacion.id, input.afectacionesRetiradas))
      }

      for (const solucionada of input.afectacionesSolucionadas) {
        await tx
          .update(infraAfectacion)
          .set({ retiradaEn: solucionada.solucionadaEn ?? input.rigeDesde, cierre: 'solucionada' })
          .where(eq(infraAfectacion.id, solucionada.id))
      }

      if (input.servicioEducativo) {
        const claves: Array<{ tipo: 'establecimiento' | 'turno' | 'seccion' | 'carrera'; referenciaId: string | null }> = []
        const alcanceServicioTx = input.servicioEducativo.alcance
        if (alcanceServicioTx.tipo === 'establecimiento') {
          claves.push({ tipo: 'establecimiento', referenciaId: null })
        } else if (alcanceServicioTx.tipo === 'turno') {
          for (const turno of alcanceServicioTx.turnos) {
            claves.push({ tipo: 'turno', referenciaId: turno })
          }
        } else if (alcanceServicioTx.tipo === 'carrera') {
          for (const carreraId of alcanceServicioTx.carreras) {
            claves.push({ tipo: 'carrera', referenciaId: String(carreraId) })
          }
        } else {
          for (const seccionId of alcanceServicioTx.secciones) {
            claves.push({ tipo: 'seccion', referenciaId: String(seccionId) })
          }
        }

        for (const clave of claves) {
          const condicionReferencia =
            clave.referenciaId === null
              ? isNull(infraServicioAlcance.referenciaId)
              : eq(infraServicioAlcance.referenciaId, clave.referenciaId)
          // Baja blanda de la fila vigente para esta clave puntual (spec
          // §10: suspender una sección no debe tocar a las demás).
          await tx
            .update(infraServicioAlcance)
            .set({ retiradaEn: input.rigeDesde })
            .where(
              and(
                eq(infraServicioAlcance.parteId, parteId),
                eq(infraServicioAlcance.tipo, clave.tipo),
                condicionReferencia,
                isNull(infraServicioAlcance.retiradaEn),
              ),
            )
          await tx.insert(infraServicioAlcance).values({
            id: crypto.randomUUID(),
            parteId,
            tipo: clave.tipo,
            referenciaId: clave.referenciaId,
            estado: input.servicioEducativo.estado,
            rigeDesde: input.rigeDesde,
            creadaEn: ahora,
            retiradaEn: null,
          })
        }
      }

      const actualizacionParte: {
        actualizadaEn: string
        estadoEstablecimiento?: string
        estadoEstablecimientoRigeDesde?: string
        asistenciaPedagogica?: string | null
      } = { actualizadaEn: ahora }
      if (input.estadoEstablecimiento) {
        actualizacionParte.estadoEstablecimiento = input.estadoEstablecimiento.estado
        actualizacionParte.estadoEstablecimientoRigeDesde = input.rigeDesde
      }
      if (input.asistenciaPedagogica !== undefined) actualizacionParte.asistenciaPedagogica = JSON.stringify(input.asistenciaPedagogica)
      await tx.update(infraParte).set(actualizacionParte).where(eq(infraParte.id, parteId))

      // Fotografía "después", dentro de la misma transacción: si el diff
      // resulta vacío hay que poder revertir todo lo anterior.
      const { afectaciones: afectacionesDespues, servicioAlcance: servicioAlcanceDespues } =
        await obtenerAfectacionesYServicio(tx, clienteGeEnTx, cue.value, parteId, corteId)
      const [parteDespues] = await tx.select().from(infraParte).where(eq(infraParte.id, parteId)).limit(1)
      const despues = snapshotDesde(
        {
          periodo,
          parte: parteDespues
            ? { ...parteDespues, estadoEstablecimiento: parteDespues.estadoEstablecimiento as EstadoEstablecimiento, asistenciaPedagogica: parteDespues.asistenciaPedagogica ? JSON.parse(parteDespues.asistenciaPedagogica) : null }
            : null,
          afectaciones: afectacionesDespues,
          servicioAlcance: servicioAlcanceDespues,
          secciones,
        },
        input.rigeDesde,
      )

      const diff = diffParte(antes, despues, { seccionesEstablecimiento: secciones.map((s) => s.geSectionId) })
      if (esInstituto) {
        // El alcance de un instituto vive en carreras y alumnos: el diff GE no lo
        // ve, así que se suma acá. Sólo cuentan las afectaciones que siguen vigentes.
        const idsVigentesDespues = new Set(afectacionesDespues.filter((a) => a.retiradaEn === null).map((a) => a.id))
        const scopesDespues = await leerScopeInstituto(tx, [...idsVigentesDespues])
        const scopesAntesVigentes = new Map([...scopesAntes].filter(([id]) => idsVigentesDespues.has(id)))
        const motivoDeAfectacion = new Map(afectacionesDespues.map((a) => [a.id, a.motivo]))
        const cambiosAlcance = await cambiosAlcanceInstituto(
          clienteGeEnTx,
          cue.value,
          corteInstituto,
          scopesAntesVigentes,
          scopesDespues,
        )
        for (const cambio of cambiosAlcance) {
          diff.alcancesCambiados.push({
            afectacionId: cambio.afectacionId,
            motivo: motivoDeAfectacion.get(cambio.afectacionId) ?? '',
            unidad: 'carrera',
            seccionesAgregadas: cambio.carrerasAgregadas,
            seccionesRetiradas: cambio.carrerasRetiradas,
            alumnosAgregados: cambio.alumnosAgregados,
            alumnosRetirados: cambio.alumnosRetirados,
          })
        }
        // Las afectaciones nuevas cuentan carreras y alumnos, no secciones GE.
        const efectivosDespues = await efectivosPorAfectacion(clienteGeEnTx, cue.value, scopesDespues, corteInstituto)
        const agregadasConAlcance: typeof diff.afectacionesAgregadas = []
        for (const agregada of diff.afectacionesAgregadas) {
          const resumen = resumenEfectivoInstituto(efectivosDespues.get(agregada.afectacionId) ?? new Map())
          agregadasConAlcance.push({ ...agregada, secciones: resumen.carreras, alumnos: resumen.alumnos, unidad: 'carrera' })
        }
        diff.afectacionesAgregadas = agregadasConAlcance
      }
      const motivoPorId = new Map(afectacionesActuales.map((a) => [a.id, a.motivo]))
      diff.afectacionesConfirmadas = input.afectacionesConfirmadas.map((id) => ({ afectacionId: id, motivo: motivoPorId.get(id) ?? '' }))
      const solucionadas = new Set(input.afectacionesSolucionadas.map((s) => s.id))
      diff.afectacionesRetiradas = diff.afectacionesRetiradas.map((r) => ({ ...r, cierre: solucionadas.has(r.afectacionId) ? 'solucionada' : 'retirada' }))
      diff.afectacionesAgregadas = diff.afectacionesAgregadas.map((a) => {
        const causaId = causaPorNuevaId.get(a.afectacionId)
        return causaId ? { ...a, causadaPor: { afectacionId: causaId, motivo: motivoPorId.get(causaId) ?? motivoCausaExterna.get(causaId) ?? '' } } : a
      })
      if (esDiffVacio(diff)) {
        // Revierte todo lo escrito en la transacción: al lanzar desde el
        // callback, db.transaction() hace ROLLBACK real y relanza este mismo
        // error, que el catch de más abajo reconoce.
        throw new RollbackDiffVacio()
      }

      const soloConfirmaciones = (diff.afectacionesConfirmadas?.length ?? 0) > 0 &&
        diff.afectacionesAgregadas.length === 0 && diff.afectacionesRetiradas.length === 0 &&
        diff.severidadesCambiadas.length === 0 && diff.alcancesCambiados.length === 0 &&
        diff.datosCambiados.length === 0 && diff.serviciosCambiados.length === 0 &&
        diff.establecimientoCambiado === null && diff.asistenciaPedagogicaCambiada == null
      const tipoMovimiento: TipoMovimiento = soloConfirmaciones ? 'confirmacion' : esNuevoParte ? 'reporte_inicial' : 'actualizacion'
      const movimientoId = crypto.randomUUID()
      await tx.insert(infraMovimiento).values({
        id: movimientoId,
        parteId,
        tipo: tipoMovimiento,
        rol: 'director',
        resumen: diff as unknown as Record<string, unknown>,
        rigeDesde: input.rigeDesde,
        creadaEn: ahora,
        idempotencyKey: input.idempotencyKey,
      })

      if (draftId) {
        const [draft] = await tx.select().from(infraBorrador)
          .where(eq(infraBorrador.id, draftId)).limit(1)
        if (!draft || draft.cueAnexo !== cue.value || draft.estado !== 'open') {
          throw new ErrorCierreBorrador(409, 'El borrador cambió durante el envío')
        }
        const revision = draft.revision + 1
        const [updated] = await tx.update(infraBorrador).set({
          estado: 'submitted',
          movimientoId,
          revision,
          actividadEn: ahora,
          sincronizadoEn: ahora,
        }).where(and(
          eq(infraBorrador.id, draftId),
          eq(infraBorrador.revision, draft.revision),
          eq(infraBorrador.estado, 'open'),
        )).returning({ revision: infraBorrador.revision })
        if (!updated) throw new ErrorCierreBorrador(409, 'El borrador cambió durante el envío')

        await tx.insert(infraBorradorCierre).values({
          draftId,
          cueAnexo: draft.cueAnexo,
          estadoCierre: 'submitted',
          revisionCierre: revision,
          movimientoId,
          cerradoEn: ahora,
        })
      }

      const estadoGeneral = estadoGeneralDelCue(despues.servicioAlcance, secciones, carrerasCue)
      return {
        status: 201,
        body: {
          ok: true,
          parteId,
          movimientoId,
          tipo: tipoMovimiento,
          cambios: describirMovimiento(diff, { tipo: tipoMovimiento }),
          servicio: { estadoGeneral, alcanceVigente: despues.servicioAlcance },
        },
      }
      })
    })
  } catch (err) {
    if (err instanceof ErrorCierreBorrador) {
      return Response.json(
        err.codigo ? { error: err.message, codigo: err.codigo } : { error: err.message },
        { status: err.status },
      )
    }
    if (err instanceof RollbackDiffVacio) {
      return jsonError('Todavía no realizó cambios en el parte actual', 409)
    }
    // Violación del constraint único de idempotency_key. En SQLite (driver
    // libsql, fallback para entornos que aún no migraron) el texto es
    // "UNIQUE constraint failed: infra_movimiento.idempotency_key", envuelto
    // por drizzle-orm en DrizzleQueryError — según la versión el texto puede
    // caer en `err.message` o en `err.cause.message`, así que se revisan
    // ambos. En Postgres el error trae `code === '23505'` y el nombre de la
    // constraint (o el mensaje "duplicate key value violates unique
    // constraint ...") menciona la columna; `code`/`constraint` pueden venir
    // en el error envuelto por Drizzle, dentro de `err.cause`.
    const msg = err instanceof Error ? err.message : String(err)
    const causaMsg =
      err instanceof Error && err.cause instanceof Error ? err.cause.message : ''
    const causa = (err as { cause?: unknown }).cause
    const errCode =
      (err as { code?: string }).code ??
      (causa && typeof causa === 'object' ? (causa as { code?: string }).code : undefined)
    const constraint =
      (err as { constraint?: string }).constraint ??
      (causa && typeof causa === 'object' ? (causa as { constraint?: string }).constraint : undefined) ??
      ''
    const duplicadoIdempotencyKeyPostgres =
      errCode === '23505' && /idempotency_key/i.test(`${msg} ${causaMsg} ${constraint}`)
    if (
      /UNIQUE constraint failed.*idempotency_key/i.test(msg) ||
      /UNIQUE constraint failed.*idempotency_key/i.test(causaMsg) ||
      duplicadoIdempotencyKeyPostgres
    ) {
      // Carrera: otra request con la misma idempotencyKey ganó mientras se
      // procesaba ésta. Se responde como si fuera un replay, releyendo el
      // movimiento que sí se escribió.
      const [race] = await db
        .select()
        .from(infraMovimiento)
        .where(eq(infraMovimiento.idempotencyKey, input.idempotencyKey))
        .limit(1)
      if (race) {
        return respuestaExito(
          cue.value,
          corteId,
          alcanceCue,
          race.parteId,
          race.id,
          race.tipo as TipoMovimiento,
          race.resumen as unknown as DiffParte,
          200,
          verificacionVinculo,
        )
      }
    }
    return Response.json({ error: 'No se pudo guardar la actualización' }, { status: 500 })
  }

  // Único punto de retorno final de POST (éxito de la transacción): acá se
  // enlaza el movimiento con la verificación de origen, best-effort. Si no
  // vino `verificacion`, `verificacionVinculada` es false (no undefined) para
  // que la forma de la respuesta sea siempre la misma.
  const bodyResultado = resultado.body as { movimientoId: string } & Record<string, unknown>
  const { vinculado, motivo } = await intentarVincularVerificacion(
    verificacionVinculo,
    bodyResultado.movimientoId,
  )
  return Response.json(
    {
      ...bodyResultado,
      verificacionVinculada: vinculado,
      ...(motivo ? { verificacionVinculoMotivo: motivo } : {}),
    },
    { status: resultado.status },
  )
}

export const GET = ruta('parte.get', handleGET)
export const POST = ruta('parte.post', handlePOST)
