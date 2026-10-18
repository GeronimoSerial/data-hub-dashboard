import type { ParteActualizacionInput } from '@/lib/infraestructura/validacion-trayectoria'
import { esViolacionUniqueIdempotencyKey } from '@/lib/infraestructura/parte/idempotencia'
import {
  buscarBorrador,
  buscarCierreBorrador,
  buscarMovimientoPorIdempotencyKey,
  buscarParteDeCueEnPeriodo,
  causasPorId,
  geSectionIdsDeAfectacion,
  hayAfectacionVigentePorSecciones,
  insertarAfectacion,
  insertarAlumnosDeAfectacion,
  insertarBorradorCierre,
  insertarMovimiento,
  insertarParteSiNoExiste,
  insertarSeccionesDeAfectacion,
  leerParte,
  actualizarCamposAfectacion,
  actualizarParte,
  afectacionesPorIds,
  alcancesServicioVigentes,
  marcarBorradorEnviado,
  parteDeFila,
  reemplazarAlcanceServicio,
  reemplazarAlumnosDeAfectacion,
  reemplazarSeccionesDeAfectacion,
  retirarAfectaciones,
  solucionarAfectacion,
  type Ejecutor,
  type FilaMovimiento,
} from '@/lib/infraestructura/parte/parte-repo'
import { getCorteVigente, crearEjecutorSql, type EjecutorSql } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada, obtenerMembresiaSecciones } from '@/lib/infraestructura/impacto'
import type { CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import { validarJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { listarMotivos, type MotivoRow } from '@/lib/infraestructura/motivos'
import { primerBloqueoParte } from '@/lib/infraestructura/consistencia-parte-servidor'
import { alcanceDeSecciones, severidadSugeridaPorAlcance } from '@/lib/infraestructura/consistencia-parte'
import { diffParte, esDiffVacio } from '@/lib/infraestructura/movimiento-diff'
import {
  obtenerAfectacionesYServicio,
  obtenerPeriodoVigente,
  snapshotDesde,
  type ParteActual,
} from '@/lib/infraestructura/parte-consulta'
import { listarSeccionesDelCue } from '@/lib/infraestructura/secciones-cue'
import { calcularEstadoServicioGeneral } from '@/lib/infraestructura/servicio-educativo'
import { evaluarCambioAHabitual, type EstadoEdificioActivo } from '@/lib/infraestructura/consistencia-estado-activo'
import { causaElegible } from '@/lib/infraestructura/causa-afectacion'
import type {
  Afectacion,
  Severidad,
  TipoMovimiento,
} from '@/lib/infraestructura/trayectoria-tipos'
import { resolverCategoria, validarAlumnosPermitidos } from '@/lib/infraestructura/validacion'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { describirMovimiento } from '@/lib/infraestructura/movimiento-descripcion'

export interface DepsActualizarParte {
  db: Ejecutor
  client: EjecutorSql
}

export interface ErrorActualizarParte {
  status: number
  mensaje: string
  codigo?: string
}

export type CuerpoCreado = Record<string, unknown> & { movimientoId: string }

// Resultado del alta/actualización del parte, sin nada de HTTP: la ruta lo
// traduce a NextResponse.
export type ResultadoActualizarParte =
  | { tipo: 'error'; error: ErrorActualizarParte }
  | { tipo: 'replay'; corteId: number; movimiento: FilaMovimiento }
  | { tipo: 'creado'; cuerpo: CuerpoCreado }
  | { tipo: 'fallo_interno'; causa: unknown }


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
  client: EjecutorSql,
  corteId: number,
  geSectionIds: number[],
  alumnosSeleccionados: number[] | undefined,
): Promise<Map<number, { seccionCompleta: boolean; alumnos: Set<number> }>> {
  const membresia = await obtenerMembresiaSecciones(client, { corteId, geSectionIds })
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
  client: EjecutorSql,
  corteId: number,
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
  const esperadas = await seccionesEsperadas(client, corteId, entrada.secciones, entrada.alumnos)
  return posibles.find((existente) => seccionesCoincidenConEsperadas(existente, esperadas))
}

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

// Replay de idempotencia detectado DENTRO de la transacción: se lanza para
// hacer rollback sin escribir nada y responder con el movimiento ya guardado.
class ReplayIdempotencia extends Error {
  readonly movimiento: FilaMovimiento

  constructor(movimiento: FilaMovimiento) {
    super('Movimiento ya registrado para esta idempotencyKey')
    this.name = 'ReplayIdempotencia'
    this.movimiento = movimiento
  }
}

// Id por nombre de motivo, armado una sola vez por request. Gana la primera
// coincidencia, igual que el find que reemplaza.
function indiceMotivoIds(motivos: MotivoRow[]): Map<string, string> {
  const indice = new Map<string, string>()
  for (const motivo of motivos) {
    if (!indice.has(motivo.nombre)) indice.set(motivo.nombre, motivo.id)
  }
  return indice
}

function fallo(mensaje: string, status: number, codigo?: string): ResultadoActualizarParte {
  return { tipo: 'error', error: codigo ? { status, mensaje, codigo } : { status, mensaje } }
}

export async function ejecutarActualizacionParte(
  input: ParteActualizacionInput,
  alcance: { cueAnexo: string; draftId: string | undefined },
  deps: DepsActualizarParte,
): Promise<ResultadoActualizarParte> {
  const { db, client } = deps
  const { cueAnexo, draftId } = alcance
  // Idempotencia, fast path: responde el replay sin el trabajo de validación.
  // La autoridad es la comprobación repetida dentro de la transacción y el
  // índice único; esta lectura previa no basta sola bajo carrera. Deliberadamente
  // NO se aplica CUE_MAX_ALERTAS_ACTIVAS acá (hay un único parte por CUE y
  // período; ese tope era del modelo deprecado).
  const movimientoExistente = await buscarMovimientoPorIdempotencyKey(db, input.idempotencyKey)

  await asegurarGeAdjuntada(client)
  const corte = await getCorteVigente(client)
  if (!corte) return fallo('No hay un corte vigente de Gestión Educativa', 503)
  // Capturada en una const propia: el chequeo de arriba no sobrevive el
  // análisis de flujo de TypeScript dentro de los closures que siguen.
  const corteId = corte.id

  if (movimientoExistente) return { tipo: 'replay', corteId, movimiento: movimientoExistente }

  const periodo = await obtenerPeriodoVigente(db)
  if (!periodo) {
    return fallo('No hay un período hidrometeorológico vigente', 503)
  }

  // --- Validación contra la base, igual que POST /api/problematicas ---

  const motivos = await listarMotivos()
  const motivoIdPorNombre = indiceMotivoIds(motivos)
  const nuevasConCategoria: Array<{
    input: (typeof input.afectacionesNuevas)[number]
    categoria: CategoriaAfectacion
  }> = []
  for (const entrada of input.afectacionesNuevas) {
    const resuelto = resolverCategoria(entrada.motivo, motivos)
    if (!resuelto.ok) {
      return fallo(resuelto.error, 400)
    }
    const permitido = validarAlumnosPermitidos(resuelto.categoria, entrada.alumnos)
    if (!permitido.ok) {
      return fallo(permitido.error, 400)
    }
    nuevasConCategoria.push({ input: entrada, categoria: resuelto.categoria })
  }

  // Reglas de consistencia (mismo módulo que el asistente): una combinación
  // bloqueada no se guarda. Las advertencias no bloquean.
  const bloqueo = primerBloqueoParte(
    nuevasConCategoria.map(({ input: entrada, categoria }) => ({
      categoria,
      motivoId: motivoIdPorNombre.get(entrada.motivo) ?? null,
      severidad: entrada.severidad,
      justificacionCritica: entrada.justificacionCritica,
      descripcion: entrada.descripcion,
      seccionesCantidad: entrada.secciones.length,
    })),
    {
      estadoEstablecimiento: input.estadoEstablecimiento?.estado ?? null,
      servicioEstado: input.servicioEducativo?.estado ?? null,
      asistenciaBrinda: input.asistenciaPedagogica?.brinda ?? null,
    },
  )
  if (bloqueo) {
    return fallo(bloqueo.mensaje, 400, bloqueo.codigo)
  }

  const secciones = await listarSeccionesDelCue(client, corteId, cueAnexo)
  const seccionesCueSet = new Set(secciones.map((s) => s.geSectionId))
  const turnosCueSet = new Set(secciones.map((s) => s.turno))
  const seccionInvalida = (ids: number[]) => ids.some((id) => !seccionesCueSet.has(id))
  // La sugerida depende del alcance real (todas las secciones del CUE), igual
  // que en el formulario: sólo así cliente y servidor exigen lo mismo.
  const todasLasSecciones = secciones.map((s) => s.geSectionId)

  for (const { input: entrada } of nuevasConCategoria) {
    if (seccionInvalida(entrada.secciones)) {
      return fallo('Alguna de las secciones no pertenece al establecimiento indicado', 400)
    }
    const sugerida = severidadSugeridaPorAlcance(
      motivoIdPorNombre.get(entrada.motivo) ?? null,
      alcanceDeSecciones(entrada.secciones, todasLasSecciones),
    )
    const justificada = validarJustificacionCritica({
      severidad: entrada.severidad,
      sugerida,
      justificacion: entrada.justificacionCritica,
      detalle: entrada.justificacionCriticaDetalle,
    })
    if (!justificada.ok) return fallo(justificada.error, 400)
  }
  for (const modificacion of input.afectacionesModificadas) {
    if (modificacion.secciones && seccionInvalida(modificacion.secciones)) {
      return fallo('Alguna de las secciones no pertenece al establecimiento indicado', 400)
    }
  }
  if (input.servicioEducativo?.alcance.tipo === 'seccion' && seccionInvalida(input.servicioEducativo.alcance.secciones)) {
    return fallo('Alguna de las secciones no pertenece al establecimiento indicado', 400)
  }
  if (
    input.servicioEducativo?.alcance.tipo === 'turno' &&
    input.servicioEducativo.alcance.turnos.some((t) => !turnosCueSet.has(t))
  ) {
    return fallo('Alguno de los turnos no pertenece al establecimiento indicado', 400)
  }

  async function alumnosPertenecenASecciones(geSectionIds: number[], alumnoIds: number[] | undefined) {
    if (!alumnoIds || alumnoIds.length === 0) return true
    if (geSectionIds.length === 0) return false
    const membresia = await obtenerMembresiaSecciones(client, { corteId, geSectionIds })
    const todos = new Set<number>()
    for (const set of membresia.values()) for (const id of set) todos.add(id)
    return alumnoIds.every((id) => todos.has(id))
  }

  for (const { input: entrada } of nuevasConCategoria) {
    if (!(await alumnosPertenecenASecciones(entrada.secciones, entrada.alumnos))) {
      return fallo('Alguno de los alumnos seleccionados no pertenece a las secciones indicadas', 400)
    }
  }

  for (const { input: entrada, categoria } of nuevasConCategoria) {
    if (categoria !== 'alumnos') continue
    const membresia = await obtenerMembresiaSecciones(client, { corteId, geSectionIds: entrada.secciones })
    const alumnos = new Set(entrada.alumnos ?? [])
    const todasConAlumno = entrada.secciones.every((seccion) =>
      [...(membresia.get(seccion) ?? [])].some((id) => alumnos.has(id)),
    )
    if (!todasConAlumno) return fallo('Cada sección elegida debe incluir al menos un alumno', 400)
  }

  const parteExistente = await buscarParteDeCueEnPeriodo(db, cueAnexo, periodo.id)

  const evacuaAhora = input.estadoEstablecimiento?.estado === 'evacuado' || input.estadoEstablecimiento?.estado === 'centro_evacuados'
  if (evacuaAhora && !input.confirmarInterrupcionTotal && parteExistente && input.servicioEducativo === undefined) {
    const alcancesVigentes = await alcancesServicioVigentes(db, parteExistente.id)
    const hayAlcanceTotalOTurno = alcancesVigentes.some((tipo) => tipo === 'establecimiento' || tipo === 'turno')
    if (!hayAlcanceTotalOTurno) {
      const hechoPorSecciones = await hayAfectacionVigentePorSecciones(db, parteExistente.id)
      if (hechoPorSecciones) return fallo('Confirme que se interrumpe todo el establecimiento', 400)
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
      return fallo('La afectación indicada no existe en el parte actual', 400)
    }
    const existentes = await afectacionesPorIds(db, parteExistente.id, idsReferenciados)
    const existentesPorId = new Map(existentes.map((a) => [a.id, a]))
    for (const id of idsReferenciados) {
      const fila = existentesPorId.get(id)
      if (!fila || fila.retiradaEn !== null) {
        return fallo('La afectación indicada no existe o ya fue retirada', 400)
      }
    }

    for (const modificacion of input.afectacionesModificadas) {
      if (modificacion.severidad === undefined) continue
      const fila = existentesPorId.get(modificacion.id)
      // Sin secciones en el cambio, el alcance es el que la afectación ya tiene.
      const seccionesActuales = modificacion.secciones ?? (await geSectionIdsDeAfectacion(db, modificacion.id))
      const sugerida = severidadSugeridaPorAlcance(
        (fila ? motivoIdPorNombre.get(fila.motivo) : undefined) ?? null,
        alcanceDeSecciones(seccionesActuales, todasLasSecciones),
      )
      const justificada = validarJustificacionCritica({
        severidad: modificacion.severidad,
        sugerida,
        justificacion: modificacion.justificacionCritica,
        detalle: modificacion.justificacionCriticaDetalle,
      })
      if (!justificada.ok) return fallo(justificada.error, 400)
    }

    for (const modificacion of input.afectacionesModificadas) {
      if (!modificacion.alumnos || modificacion.alumnos.length === 0) continue
      let seccionesEfectivas = modificacion.secciones
      if (!seccionesEfectivas) {
        seccionesEfectivas = await geSectionIdsDeAfectacion(db, modificacion.id)
      }
      if (!(await alumnosPertenecenASecciones(seccionesEfectivas, modificacion.alumnos))) {
        return fallo('Alguno de los alumnos seleccionados no pertenece a las secciones indicadas', 400)
      }
    }
  }

  const idsCausa = [...new Set(input.afectacionesNuevas.flatMap((a) => (a.causadaPorId ? [a.causadaPorId] : [])))]
  const motivoCausaExterna = new Map<string, string>()
  if (idsCausa.length > 0) {
    const causas = await causasPorId(db, idsCausa)
    const porId = new Map(causas.map((c) => [c.id, c]))
    for (const causa of causas) motivoCausaExterna.set(causa.id, causa.motivo)
    for (const id of idsCausa) {
      const causa = porId.get(id)
      if (!causa || !causaElegible(causa, cueAnexo, input.rigeDesde)) {
        return fallo('La situación indicada como causa no es válida', 400)
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
      // Idempotencia, autoritativa: la lectura va dentro de la MISMA
      // transacción que el INSERT. Una request que llega después de que otra
      // ya confirmó el movimiento ve su fila acá y responde replay, en vez de
      // recalcular el diff contra el parte ya escrito (409 "sin cambios").
      const yaRegistrado = await buscarMovimientoPorIdempotencyKey(tx, input.idempotencyKey)
      if (yaRegistrado) throw new ReplayIdempotencia(yaRegistrado)

      if (draftId) {
        const closure = await buscarCierreBorrador(tx, draftId)
        if (closure) throw new ErrorCierreBorrador(410, 'El borrador ya está cerrado')

        const draft = await buscarBorrador(tx, draftId)
        if (!draft) throw new ErrorCierreBorrador(404, 'No se encontró el borrador')
        if (draft.cueAnexo !== cueAnexo) {
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
        parteId = await insertarParteSiNoExiste(tx, {
          id: nuevoId,
          periodoId: periodo.id,
          cueAnexo: cueAnexo,
          rigeDesde: input.rigeDesde,
          corteId,
          ahora,
        })
        esNuevoParte = parteId === nuevoId
      }

      // --- Fotografía "antes" (spec §12), releída DENTRO de la transacción
      // con el lock de escritura ya tomado — nunca la `parteExistente` de
      // más arriba, que pudo quedar desactualizada por la misma carrera.
      const parteFilaActual = await leerParte(tx, parteId)
      const { afectaciones: afectacionesActuales, servicioAlcance: servicioAlcanceActual } =
        await obtenerAfectacionesYServicio(tx, clienteGeEnTx, parteId, corteId)
      const actualAntesReal: ParteActual = parteFilaActual
        ? {
            periodo,
            parte: parteDeFila(parteFilaActual),
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
        servicioActual: calcularEstadoServicioGeneral(servicioAlcanceActual, secciones),
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

      for (const { input: entrada, categoria } of nuevasConCategoria) {
        // Nunca duplicar una afectación que otro dispositivo ya insertó para
        // el mismo evento (misma carrera de alta cross-device): si el
        // contenido coincide exactamente con una ya vigente, esta entrada es
        // un no-op.
        const equivalente = await buscarAfectacionEquivalente(
          clienteGeEnTx,
          corteId,
          afectacionesVigentesActuales,
          entrada,
          categoria,
        )
        if (equivalente) continue

        const id = crypto.randomUUID()
        if (entrada.causadaPorId) causaPorNuevaId.set(id, entrada.causadaPorId)
        await insertarAfectacion(tx, {
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
        await insertarSeccionesDeAfectacion(tx, id, entrada.secciones)
        if (entrada.alumnos && entrada.alumnos.length > 0) {
          await insertarAlumnosDeAfectacion(tx, id, entrada.alumnos)
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
          await actualizarCamposAfectacion(tx, modificacion.id, cambios)
        }
        if (modificacion.secciones !== undefined) {
          await reemplazarSeccionesDeAfectacion(tx, modificacion.id, modificacion.secciones)
        }
        if (modificacion.alumnos !== undefined) {
          await reemplazarAlumnosDeAfectacion(tx, modificacion.id, modificacion.alumnos)
        }
      }

      if (input.afectacionesRetiradas.length > 0) {
        await retirarAfectaciones(tx, input.afectacionesRetiradas, input.rigeDesde)
      }

      for (const solucionada of input.afectacionesSolucionadas) {
        await solucionarAfectacion(tx, solucionada.id, solucionada.solucionadaEn ?? input.rigeDesde)
      }

      if (input.servicioEducativo) {
        const claves: Array<{ tipo: 'establecimiento' | 'turno' | 'seccion'; referenciaId: string | null }> = []
        if (input.servicioEducativo.alcance.tipo === 'establecimiento') {
          claves.push({ tipo: 'establecimiento', referenciaId: null })
        } else if (input.servicioEducativo.alcance.tipo === 'turno') {
          for (const turno of input.servicioEducativo.alcance.turnos) {
            claves.push({ tipo: 'turno', referenciaId: turno })
          }
        } else {
          for (const seccionId of input.servicioEducativo.alcance.secciones) {
            claves.push({ tipo: 'seccion', referenciaId: String(seccionId) })
          }
        }

        for (const clave of claves) {
          await reemplazarAlcanceServicio(tx, parteId, clave, input.servicioEducativo.estado, input.rigeDesde, ahora)
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
      await actualizarParte(tx, parteId, actualizacionParte)

      // Fotografía "después", dentro de la misma transacción: si el diff
      // resulta vacío hay que poder revertir todo lo anterior.
      const { afectaciones: afectacionesDespues, servicioAlcance: servicioAlcanceDespues } =
        await obtenerAfectacionesYServicio(tx, clienteGeEnTx, parteId, corteId)
      const parteDespues = await leerParte(tx, parteId)
      const despues = snapshotDesde(
        {
          periodo,
          parte: parteDespues ? parteDeFila(parteDespues) : null,
          afectaciones: afectacionesDespues,
          servicioAlcance: servicioAlcanceDespues,
          secciones,
        },
        input.rigeDesde,
      )

      const diff = diffParte(antes, despues, { seccionesEstablecimiento: secciones.map((s) => s.geSectionId) })
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
      await insertarMovimiento(tx, {
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
        const draft = await buscarBorrador(tx, draftId)
        if (!draft || draft.cueAnexo !== cueAnexo || draft.estado !== 'open') {
          throw new ErrorCierreBorrador(409, 'El borrador cambió durante el envío')
        }
        const revision = draft.revision + 1
        const updated = await marcarBorradorEnviado(tx, draftId, draft.revision, { movimientoId, revision, ahora })
        if (!updated) throw new ErrorCierreBorrador(409, 'El borrador cambió durante el envío')

        await insertarBorradorCierre(tx, {
          draftId,
          cueAnexo: draft.cueAnexo,
          estadoCierre: 'submitted',
          revisionCierre: revision,
          movimientoId,
          cerradoEn: ahora,
        })
      }

      const estadoGeneral = calcularEstadoServicioGeneral(despues.servicioAlcance, secciones)
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
    if (err instanceof ErrorCierreBorrador) return fallo(err.message, err.status, err.codigo)
    if (err instanceof RollbackDiffVacio) return fallo('Todavía no realizó cambios en el parte actual', 409)
    if (err instanceof ReplayIdempotencia) return { tipo: 'replay', corteId, movimiento: err.movimiento }
    if (esViolacionUniqueIdempotencyKey(err)) {
      // Carrera: otra request con la misma idempotencyKey confirmó su INSERT
      // entre nuestro chequeo y el nuestro. Se responde como replay, releyendo
      // el movimiento que sí quedó escrito.
      const race = await buscarMovimientoPorIdempotencyKey(db, input.idempotencyKey)
      if (race) return { tipo: 'replay', corteId, movimiento: race }
    }
    return { tipo: 'fallo_interno', causa: err }
  }

  return { tipo: 'creado', cuerpo: resultado.body as CuerpoCreado }
}
