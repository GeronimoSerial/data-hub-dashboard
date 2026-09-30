// Proyección de los partes vigentes para el mapa de infraestructura (Fase 1
// de odd/tasks/mapa-parte-operativo.md). Es la proyección, sobre el modelo de
// parte/trayectoria (infra_parte / infra_afectacion / infra_servicio_alcance),
// que reemplazó a la consulta de alertas del modelo deprecado retirado en la
// Fase 4.
//
// REQUISITO NO NEGOCIABLE: nada de N+1. Toda la carga es un número CONSTANTE
// de queries (no depende de cuántos partes/afectaciones haya): período +
// corte, partes+localización, afectaciones, servicio_alcance, secciones de
// todos los CUEs de un saque (listarSeccionesDeCues), membresía de secciones
// de un saque (obtenerMembresiaSecciones) y las dos tablas de alcance de
// afectación (secciones/alumnos) por IN. Todo lo demás (vigencia, alcance,
// estado general de servicio, dedupe de alumnos) se resuelve en memoria con
// las funciones puras que ya existen — nunca una consulta por parte.
import { getRawClient } from '@/lib/db'
import { crearEjecutorSql, getCorteVigente, type EjecutorSql } from './ge-db'
import { asegurarGeAdjuntada, obtenerMembresiaSecciones } from './impacto'
import { obtenerPeriodoVigente } from './parte-consulta'
import { listarSeccionesDeCues } from './secciones-cue'
import { calcularEstadoServicioGeneral } from './servicio-educativo'
import { claveServicioAlcance, resolverAlcanceVigente } from './vigencia-alcance'
import { esCategoria, type CategoriaAfectacion } from './categorias'
import { normalizarNombreDepartamento } from '@/lib/mapas/departamentos'
import { SEVERIDADES, type Severidad } from './validacion'
import type {
  Afectacion,
  AfectacionAlcanceSeccion,
  EstadoEstablecimiento,
  EstadoServicioGeneral,
  ServicioAlcance,
} from './trayectoria-tipos'

// Mismos filtros de establecimiento/afectación que FiltrosAlertas
// (consulta.ts), más los dos que agrega el modelo de parte: `categoria`
// (de la afectación) y `servicio` (el estado general calculado, nunca
// persistido — ver servicio-educativo.ts).
export interface FiltrosMapa {
  territorio?: string
  nivel?: string
  cueAnexo?: string
  motivo?: string
  severidad?: string
  categoria?: CategoriaAfectacion
  servicio?: EstadoServicioGeneral
}

export interface AfectacionMapa {
  id: string
  motivo: string
  categoria: CategoriaAfectacion
  severidad: string
  descripcion: string | null
  rigeDesde: string
}

export interface ParteMapa {
  parteId: string
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
  servicio: EstadoServicioGeneral
  estadoEstablecimiento: EstadoEstablecimiento
  peorSeveridad: string
  categorias: CategoriaAfectacion[]
  afectaciones: AfectacionMapa[]
  seccionesAlcanzadas: number
  alumnosDelHecho: number
  alumnosAlcanzados: number
  // El rigeDesde vigente MÁS ANTIGUO entre las afectaciones que quedaron
  // (post filtro): responde "¿desde cuándo viene esta situación?", no
  // "cuál es el cambio más reciente".
  rigeDesde: string
  actualizadaEn: string
}

export interface IndicadoresMapa {
  escuelas: number
  conServicioSuspendido: number
  conServicioParcial: number
  evacuadas: number
  establecimientosParciales: number
  centrosDeEvacuados: number
  sinReportar: number
  alumnosAlcanzados: number
  seccionesAlcanzadas: number
}

export function calcularAlumnosAlcanzados(params: {
  alumnosDelHecho: number
  estado: EstadoEstablecimiento
  alumnosDelEstablecimiento: number | null
}): number {
  if (params.estado === 'evacuado' || params.estado === 'centro_evacuados') {
    return params.alumnosDelEstablecimiento ?? params.alumnosDelHecho
  }
  return params.alumnosDelHecho
}

// El umbral vive en umbrales.ts, un modulo sin importaciones de servidor:
// el mapa lo necesita en runtime y este modulo arrastra node:fs via getDb.
import { UMBRAL_SIN_REPORTAR_HORAS } from './umbrales'
export { UMBRAL_SIN_REPORTAR_HORAS }

const resultadoVacio = { partes: [] as ParteMapa[], indicadores: indicadoresVacios() }

function indicadoresVacios(): IndicadoresMapa {
  return {
    escuelas: 0,
    conServicioSuspendido: 0,
    conServicioParcial: 0,
    evacuadas: 0,
    establecimientosParciales: 0,
    centrosDeEvacuados: 0,
    sinReportar: 0,
    alumnosAlcanzados: 0,
    seccionesAlcanzadas: 0,
  }
}

function activo(valor: string | undefined): boolean {
  return valor !== undefined && valor !== ''
}

function coordenada(original: unknown): number | null {
  return original === null || original === undefined ? null : Number(original)
}

// Las coordenadas del padrón llegan con hasta 15 decimales (double de SQLite);
// para el mapa no aportan precisión real y sólo inflan el payload, así que se
// fijan a 5 decimales (~1 m). null se conserva tal cual.
export function redondearCoordenada(valor: number | null): number | null {
  return valor === null ? null : Math.round(valor * 1e5) / 1e5
}

function stringValor(original: unknown): string {
  return original === null || original === undefined ? '' : String(original)
}

interface ParteRow {
  id: string
  cueAnexo: string
  estadoEstablecimiento: EstadoEstablecimiento
  actualizadaEn: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
}

// Filtros de establecimiento (territorio, nivel, cueAnexo): se aplican acá,
// en SQL, contra infra_parte + ge.ge_localizacion (+ EXISTS contra
// ge.ge_seccion para nivel, porque el nivel es un atributo de las secciones
// del establecimiento en el corte vigente, no una columna del parte).
function filtrosParteSql(filtros: FiltrosMapa): { clausulas: string[]; args: (string | number)[] } {
  const clausulas: string[] = []
  const args: (string | number)[] = []

  if (activo(filtros.territorio)) {
    // El GeoJSON usa "Capital"/"Concepción" y GE guarda "CAPITAL" y
    // variantes con o sin tilde. SQLite NOCASE sólo resuelve ASCII: plegamos
    // explícitamente los acentos antes de comparar el departamento.
    const acentos = [
      ['Á', 'A'], ['É', 'E'], ['Í', 'I'], ['Ó', 'O'], ['Ú', 'U'], ['Ü', 'U'], ['Ñ', 'N'],
      ['á', 'A'], ['é', 'E'], ['í', 'I'], ['ó', 'O'], ['ú', 'U'], ['ü', 'U'], ['ñ', 'N'],
    ]
    const departamentoNormalizado = acentos.reduce(
      (sql, [acento, base]) => `REPLACE(${sql}, '${acento}', '${base}')`,
      'UPPER(l.departamento)',
    )
    clausulas.push(`(${departamentoNormalizado} = ? OR l.localidad = ?)`)
    args.push(normalizarNombreDepartamento(filtros.territorio!), filtros.territorio!)
  }
  if (activo(filtros.cueAnexo)) {
    clausulas.push('p.cue_anexo = ?')
    args.push(filtros.cueAnexo!)
  }
  return { clausulas, args }
}

async function cargarPartes(
  client: EjecutorSql,
  periodoId: string,
  corteId: number,
  filtros: FiltrosMapa,
): Promise<ParteRow[]> {
  const { clausulas, args } = filtrosParteSql(filtros)

  const clausulasFinal = ['p.periodo_id = ?', ...clausulas]
  const argsFinal: (string | number)[] = [periodoId, ...args]

  if (activo(filtros.nivel)) {
    clausulasFinal.push(
      `EXISTS (
        SELECT 1 FROM ge.ge_seccion s
        WHERE s.corte_id = ? AND s.cue_anexo = p.cue_anexo AND s.nivel = ?
      )`,
    )
    argsFinal.push(corteId, filtros.nivel!)
  }

  const res = await client.execute({
    sql: `SELECT p.id, p.cue_anexo, p.estado_establecimiento, p.actualizada_en,
                 l.nombre, l.departamento, l.localidad, l.lat, l.lon
          FROM infra_parte p
          JOIN ge.ge_localizacion l ON l.cue_anexo = p.cue_anexo
          WHERE ${clausulasFinal.join('\n  AND ')}`,
    args: argsFinal,
  })

  return res.rows.map((r) => ({
    id: stringValor(r.id),
    cueAnexo: stringValor(r.cue_anexo),
    estadoEstablecimiento: stringValor(r.estado_establecimiento) as EstadoEstablecimiento,
    actualizadaEn: stringValor(r.actualizada_en),
    nombre: stringValor(r.nombre),
    departamento: stringValor(r.departamento),
    localidad: stringValor(r.localidad),
    lat: coordenada(r.lat),
    lon: coordenada(r.lon),
  }))
}

// Carga TODAS las afectaciones (vigentes y retiradas) de los partes dados,
// con sus secciones/alumnos ya resueltos contra la matrícula real del corte
// — mismo criterio que cargarAfectaciones en parte-consulta.ts, pero
// batcheado para TODOS los partes en una sola tanda de queries en vez de una
// tanda por parte.
export async function cargarAfectacionesDeVariosPartes(
  client: EjecutorSql,
  corteId: number,
  parteIds: string[],
): Promise<Afectacion[]> {
  if (parteIds.length === 0) return []

  const placeholders = parteIds.map(() => '?').join(',')
  const res = await client.execute({
    sql: `SELECT id, parte_id, motivo, categoria, severidad, descripcion, rige_desde, creada_en, retirada_en
          FROM infra_afectacion WHERE parte_id IN (${placeholders})`,
    args: parteIds,
  })
  if (res.rows.length === 0) return []

  const afectacionIds = res.rows.map((r) => stringValor(r.id))
  const seccionesPlaceholders = afectacionIds.map(() => '?').join(',')

  const [seccionesRes, alumnosRes] = await Promise.all([
    client.execute({
      sql: `SELECT afectacion_id, ge_section_id FROM infra_afectacion_seccion WHERE afectacion_id IN (${seccionesPlaceholders})`,
      args: afectacionIds,
    }),
    client.execute({
      sql: `SELECT afectacion_id, ge_person_id FROM infra_afectacion_alumno WHERE afectacion_id IN (${seccionesPlaceholders})`,
      args: afectacionIds,
    }),
  ])

  const seccionesPorAfectacion = new Map<string, number[]>()
  for (const s of seccionesRes.rows) {
    const afectacionId = stringValor(s.afectacion_id)
    const lista = seccionesPorAfectacion.get(afectacionId) ?? []
    lista.push(Number(s.ge_section_id))
    seccionesPorAfectacion.set(afectacionId, lista)
  }
  const alumnosPorAfectacion = new Map<string, number[]>()
  for (const a of alumnosRes.rows) {
    const afectacionId = stringValor(a.afectacion_id)
    const lista = alumnosPorAfectacion.get(afectacionId) ?? []
    lista.push(Number(a.ge_person_id))
    alumnosPorAfectacion.set(afectacionId, lista)
  }

  // Una sola consulta de membresía para TODAS las secciones de TODAS las
  // afectaciones de TODOS los partes: nunca una por afectación ni una por
  // parte.
  const todasLasSecciones = [...new Set(seccionesRes.rows.map((s) => Number(s.ge_section_id)))]
  const membresia = await obtenerMembresiaSecciones(client, { corteId, geSectionIds: todasLasSecciones })

  return res.rows.map((fila): Afectacion => {
    const id = stringValor(fila.id)
    const seccionIds = seccionesPorAfectacion.get(id) ?? []
    const alumnosSeleccionados = new Set(alumnosPorAfectacion.get(id) ?? [])
    const secciones: AfectacionAlcanceSeccion[] = seccionIds.map((geSectionId) => {
      const matriculados = membresia.get(geSectionId) ?? new Set<number>()
      const interseccion = [...matriculados].filter((personId) => alumnosSeleccionados.has(personId))
      if (interseccion.length > 0) {
        return { geSectionId, seccionCompleta: false, alumnos: interseccion }
      }
      return { geSectionId, seccionCompleta: true, alumnos: [...matriculados] }
    })

    const categoriaValor = stringValor(fila.categoria)
    return {
      id,
      parteId: stringValor(fila.parte_id),
      motivo: stringValor(fila.motivo),
      // Conservador, mismo criterio que consulta.ts: una categoría
      // inesperada nunca se trata como 'alumnos'.
      categoria: esCategoria(categoriaValor) ? categoriaValor : 'establecimiento',
      severidad: stringValor(fila.severidad) as Severidad,
      descripcion: fila.descripcion === null || fila.descripcion === undefined ? null : stringValor(fila.descripcion),
      rigeDesde: stringValor(fila.rige_desde),
      creadaEn: stringValor(fila.creada_en),
      retiradaEn: fila.retirada_en === null || fila.retirada_en === undefined ? null : stringValor(fila.retirada_en),
      secciones,
    }
  })
}

export async function cargarServicioAlcanceDeVariosPartes(
  client: EjecutorSql,
  parteIds: string[],
): Promise<ServicioAlcance[]> {
  if (parteIds.length === 0) return []

  const placeholders = parteIds.map(() => '?').join(',')
  const res = await client.execute({
    sql: `SELECT id, parte_id, tipo, referencia_id, estado, rige_desde, creada_en, retirada_en
          FROM infra_servicio_alcance WHERE parte_id IN (${placeholders})`,
    args: parteIds,
  })

  return res.rows.map((fila): ServicioAlcance => ({
    id: stringValor(fila.id),
    parteId: stringValor(fila.parte_id),
    tipo: stringValor(fila.tipo) as ServicioAlcance['tipo'],
    referenciaId: fila.referencia_id === null || fila.referencia_id === undefined ? null : stringValor(fila.referencia_id),
    estado: stringValor(fila.estado) as ServicioAlcance['estado'],
    rigeDesde: stringValor(fila.rige_desde),
    creadaEn: stringValor(fila.creada_en),
    retiradaEn: fila.retirada_en === null || fila.retirada_en === undefined ? null : stringValor(fila.retirada_en),
  }))
}

function coincideFiltrosAfectacion(afectacion: Afectacion, filtros: FiltrosMapa): boolean {
  if (activo(filtros.motivo) && afectacion.motivo !== filtros.motivo) return false
  if (activo(filtros.severidad) && afectacion.severidad !== filtros.severidad) return false
  if (filtros.categoria !== undefined && afectacion.categoria !== filtros.categoria) return false
  return true
}

export async function listarPartesVigentes(
  filtros: FiltrosMapa = {},
): Promise<{ partes: ParteMapa[]; indicadores: IndicadoresMapa }> {
  const periodo = await obtenerPeriodoVigente()
  if (!periodo) return resultadoVacio

  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) return resultadoVacio

  const parteRows = await cargarPartes(client, periodo.id, corte.id, filtros)
  if (parteRows.length === 0) return resultadoVacio

  const parteIds = parteRows.map((p) => p.id)
  const cueAnexos = [...new Set(parteRows.map((p) => p.cueAnexo))]

  const [afectacionesRows, servicioRows, seccionesPorCue] = await Promise.all([
    cargarAfectacionesDeVariosPartes(client, corte.id, parteIds),
    cargarServicioAlcanceDeVariosPartes(client, parteIds),
    listarSeccionesDeCues(client, corte.id, cueAnexos),
  ])
  const todasLasSeccionesDelPadron = [...new Set([...seccionesPorCue.values()].flat().map((s) => s.geSectionId))]
  const padronCompleto = await obtenerMembresiaSecciones(client, { corteId: corte.id, geSectionIds: todasLasSeccionesDelPadron })

  // Vigencia de afectaciones: sin `clave` de agrupación porque cada
  // afectación es su propia fila independiente (spec §3.2) — a diferencia
  // del servicio, acá no hay "reemplazo" de una fila por otra del mismo
  // alcance.
  const afectacionesVigentes = resolverAlcanceVigente(afectacionesRows)
  const vigentesPorParte = new Map<string, Afectacion[]>()
  for (const a of afectacionesVigentes) {
    const lista = vigentesPorParte.get(a.parteId) ?? []
    lista.push(a)
    vigentesPorParte.set(a.parteId, lista)
  }

  // El servicio SÍ necesita agrupar por parte antes de aplicar
  // resolverAlcanceVigente con clave: claveServicioAlcance sólo distingue
  // tipo+referenciaId, no parteId, así que aplicarlo sobre el conjunto
  // global de golpe colapsaría filas de partes distintos que comparten,
  // p. ej., tipo 'establecimiento'.
  const servicioPorParte = new Map<string, ServicioAlcance[]>()
  for (const s of servicioRows) {
    const lista = servicioPorParte.get(s.parteId) ?? []
    lista.push(s)
    servicioPorParte.set(s.parteId, lista)
  }

  const partes: ParteMapa[] = []

  for (const parteRow of parteRows) {
    const vigentes = vigentesPorParte.get(parteRow.id) ?? []
    // Regla de dominio: un parte sin afectaciones vigentes no aparece en el
    // mapa (nada que mostrar, aunque el parte exista).
    if (vigentes.length === 0) continue

    const filtradas = vigentes.filter((a) => coincideFiltrosAfectacion(a, filtros))
    // Un parte cuyas afectaciones vigentes no matchean el filtro tampoco
    // aparece: el filtro no oculta afectaciones dentro de una escuela que sí
    // se muestra, oculta la escuela entera si no le queda ninguna.
    if (filtradas.length === 0) continue

    const secciones = seccionesPorCue.get(parteRow.cueAnexo) ?? []
    const servicioVigente = resolverAlcanceVigente(servicioPorParte.get(parteRow.id) ?? [], {
      clave: claveServicioAlcance,
    })
    const servicioGeneral = calcularEstadoServicioGeneral(servicioVigente, secciones)
    if (filtros.servicio !== undefined && servicioGeneral !== filtros.servicio) continue

    const alumnosAlcanzados = new Set<number>()
    const seccionesAlcanzadas = new Set<number>()
    const categorias = new Set<CategoriaAfectacion>()
    let peorSeveridad = filtradas[0].severidad
    let peorIndice = SEVERIDADES.indexOf(peorSeveridad as Severidad)
    let rigeDesdeMasAntiguo = filtradas[0].rigeDesde

    for (const afectacion of filtradas) {
      categorias.add(afectacion.categoria)

      const indice = SEVERIDADES.indexOf(afectacion.severidad as Severidad)
      if (indice > peorIndice) {
        peorIndice = indice
        peorSeveridad = afectacion.severidad
      }

      if (new Date(afectacion.rigeDesde).getTime() < new Date(rigeDesdeMasAntiguo).getTime()) {
        rigeDesdeMasAntiguo = afectacion.rigeDesde
      }

      for (const seccion of afectacion.secciones) {
        seccionesAlcanzadas.add(seccion.geSectionId)
        // Dedupe a nivel PARTE, no a nivel afectación: un alumno alcanzado
        // por dos afectaciones distintas del mismo parte cuenta una vez.
        for (const alumnoId of seccion.alumnos) alumnosAlcanzados.add(alumnoId)
      }
    }

    const alumnosDelHecho = alumnosAlcanzados.size
    let alumnosDelEstablecimiento: number | null = null
    if (parteRow.estadoEstablecimiento === 'evacuado' || parteRow.estadoEstablecimiento === 'centro_evacuados') {
      const turnosInterrumpidos = new Set(servicioVigente.filter((s) => s.estado === 'suspendido' && s.tipo === 'turno').map((s) => s.referenciaId))
      const seccionesInterrumpidas = turnosInterrumpidos.size > 0
        ? secciones.filter((s) => turnosInterrumpidos.has(s.turno))
        : secciones
      const roster = new Set<number>()
      for (const seccion of seccionesInterrumpidas) {
        for (const alumno of padronCompleto.get(seccion.geSectionId) ?? []) roster.add(alumno)
      }
      if (seccionesInterrumpidas.length > 0) alumnosDelEstablecimiento = roster.size
    }
    const alumnosConsecuencia = calcularAlumnosAlcanzados({ alumnosDelHecho, estado: parteRow.estadoEstablecimiento, alumnosDelEstablecimiento })

    partes.push({
      parteId: parteRow.id,
      cueAnexo: parteRow.cueAnexo,
      nombre: parteRow.nombre,
      departamento: parteRow.departamento,
      localidad: parteRow.localidad,
      lat: parteRow.lat,
      lon: parteRow.lon,
      servicio: servicioGeneral,
      estadoEstablecimiento: parteRow.estadoEstablecimiento,
      peorSeveridad,
      categorias: [...categorias],
      afectaciones: filtradas.map((a) => ({
        id: a.id,
        motivo: a.motivo,
        categoria: a.categoria,
        severidad: a.severidad,
        descripcion: a.descripcion,
        rigeDesde: a.rigeDesde,
      })),
      seccionesAlcanzadas: seccionesAlcanzadas.size,
      alumnosDelHecho,
      alumnosAlcanzados: alumnosConsecuencia,
      rigeDesde: rigeDesdeMasAntiguo,
      actualizadaEn: parteRow.actualizadaEn,
    })
  }

  const ahoraMs = Date.now()
  const umbralMs = UMBRAL_SIN_REPORTAR_HORAS * 60 * 60 * 1000

  const indicadores: IndicadoresMapa = {
    escuelas: partes.length,
    conServicioSuspendido: partes.filter((p) => p.servicio === 'suspendido').length,
    conServicioParcial: partes.filter((p) => p.servicio === 'parcial').length,
    evacuadas: partes.filter((p) => p.estadoEstablecimiento === 'evacuado').length,
    establecimientosParciales: partes.filter((p) => p.estadoEstablecimiento === 'parcial').length,
    centrosDeEvacuados: partes.filter((p) => p.estadoEstablecimiento === 'centro_evacuados').length,
    sinReportar: partes.filter((p) => ahoraMs - new Date(p.actualizadaEn).getTime() > umbralMs).length,
    alumnosAlcanzados: partes.reduce((acc, p) => acc + p.alumnosAlcanzados, 0),
    seccionesAlcanzadas: partes.reduce((acc, p) => acc + p.seccionesAlcanzadas, 0),
  }

  return { partes, indicadores }
}

// Proyección del PADRÓN COMPLETO de escuelas para el mapa. A diferencia de
// listarPartesVigentes (que sólo conoce las escuelas con al menos una
// afectación vigente), esta parte de TODO ge_localizacion, autosembrado e
// independiente de si existe período/corte, para poder mostrar también las
// escuelas que no reportaron nada. Las escuelas sin coordenadas nunca se
// descartan en silencio: se separan en `sinUbicacion`.
export interface EscuelaMapa {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
  estado: 'afectada' | 'sin_afectacion_reportada'
  // Presente sólo si estado === 'afectada'; mismo shape que ParteMapa.
  parte?: ParteMapa
}

export interface EscuelasMapaResultado {
  escuelas: EscuelaMapa[]
  sinUbicacion: Array<{
    cueAnexo: string
    nombre: string
    departamento: string
    localidad: string
  }>
  totalPadron: number
}

interface EscuelaPadronRow {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
}

// Filtros de ESTABLECIMIENTO (territorio, cueAnexo, nivel) aplicados al
// padrón completo, contra ge.ge_localizacion. Territorio reusa el MISMO
// criterio SQL que filtrosParteSql (plegado explícito de acentos +
// normalizarNombreDepartamento, comparación contra departamento O
// localidad); cueAnexo y nivel se aplican igual que en cargarPartes, sólo
// que nivel se resuelve vía EXISTS contra las secciones del corte vigente.
async function cargarPadronEscuelas(
  client: EjecutorSql,
  filtros: FiltrosMapa,
  corteId: number | null,
): Promise<EscuelaPadronRow[]> {
  const clausulas: string[] = []
  const args: (string | number)[] = []

  if (activo(filtros.territorio)) {
    // Mismo plegado de acentos que filtrosParteSql: SQLite NOCASE sólo
    // resuelve ASCII, así que "Concepción" y "CONCEPCION" no colapsan solos.
    const acentos = [
      ['Á', 'A'], ['É', 'E'], ['Í', 'I'], ['Ó', 'O'], ['Ú', 'U'], ['Ü', 'U'], ['Ñ', 'N'],
      ['á', 'A'], ['é', 'E'], ['í', 'I'], ['ó', 'O'], ['ú', 'U'], ['ü', 'U'], ['ñ', 'N'],
    ]
    const departamentoNormalizado = acentos.reduce(
      (sql, [acento, base]) => `REPLACE(${sql}, '${acento}', '${base}')`,
      'UPPER(l.departamento)',
    )
    clausulas.push(`(${departamentoNormalizado} = ? OR l.localidad = ?)`)
    args.push(normalizarNombreDepartamento(filtros.territorio!), filtros.territorio!)
  }
  if (activo(filtros.cueAnexo)) {
    clausulas.push('l.cue_anexo = ?')
    args.push(filtros.cueAnexo!)
  }
  if (activo(filtros.nivel)) {
    // El nivel es un atributo de las secciones del corte vigente, no del
    // padrón: sin corte no hay contra qué resolverlo, así que el filtro no
    // matchea ninguna escuela.
    if (corteId === null) return []
    clausulas.push(
      `EXISTS (
        SELECT 1 FROM ge.ge_seccion s
        WHERE s.corte_id = ? AND s.cue_anexo = l.cue_anexo AND s.nivel = ?
      )`,
    )
    args.push(corteId, filtros.nivel!)
  }

  const where = clausulas.length > 0 ? `WHERE ${clausulas.join('\n  AND ')}` : ''
  const res = await client.execute({
    sql: `SELECT l.cue_anexo, l.cui, l.nombre, l.departamento, l.localidad, l.lat, l.lon
          FROM ge.ge_localizacion l
          ${where}`,
    args,
  })

  return res.rows.map((r) => ({
    cueAnexo: stringValor(r.cue_anexo),
    nombre: stringValor(r.nombre),
    departamento: stringValor(r.departamento),
    localidad: stringValor(r.localidad),
    lat: coordenada(r.lat),
    lon: coordenada(r.lon),
  }))
}

export async function listarEscuelasMapa(
  filtros: FiltrosMapa = {},
): Promise<EscuelasMapaResultado> {
  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)

  // El padrón NO depende de período/corte: la consulta base va sin esos
  // filtros. El nivel sí depende del corte vigente (vive en ge_seccion), así
  // que sólo se pide el corte cuando el filtro lo necesita.
  const corte = activo(filtros.nivel) ? await getCorteVigente(client) : null
  const padron = await cargarPadronEscuelas(client, filtros, corte?.id ?? null)

  // listarPartesVigentes ya resuelve período/corte, vigencia, dedupe y TODOS
  // los filtros de afectación (motivo/severidad/categoría/servicio); se usa
  // su salida como mapa por CUE para no duplicar esa lógica. Si no hay
  // período/corte vigente devuelve [], y entonces TODO el padrón queda
  // 'sin_afectacion_reportada' (nunca lista vacía por falta de corte).
  const { partes } = await listarPartesVigentes(filtros)
  const partePorCue = new Map(partes.map((parte) => [parte.cueAnexo, parte]))

  const escuelas: EscuelaMapa[] = []
  const sinUbicacion: EscuelasMapaResultado['sinUbicacion'] = []

  for (const fila of padron) {
    if (fila.lat === null || fila.lon === null) {
      sinUbicacion.push({
        cueAnexo: fila.cueAnexo,
        nombre: fila.nombre,
        departamento: fila.departamento,
        localidad: fila.localidad,
      })
      continue
    }

    const parte = partePorCue.get(fila.cueAnexo)
    escuelas.push({
      cueAnexo: fila.cueAnexo,
      nombre: fila.nombre,
      departamento: fila.departamento,
      localidad: fila.localidad,
      lat: redondearCoordenada(fila.lat),
      lon: redondearCoordenada(fila.lon),
      estado: parte ? 'afectada' : 'sin_afectacion_reportada',
      ...(parte ? { parte } : {}),
    })
  }

  return { escuelas, sinUbicacion, totalPadron: escuelas.length + sinUbicacion.length }
}
