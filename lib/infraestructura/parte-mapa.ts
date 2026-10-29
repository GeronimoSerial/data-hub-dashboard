import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { proyectarImpactoAlumnos, prioridadEfectiva, type ImpactoAlumnos } from './prioridad-alumnos'
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
import { getDb, getRawClient } from '@/lib/db'
import { crearEjecutorSql, getCorteVigente, type EjecutorSql } from './ge-db'
import { asegurarGeAdjuntada, obtenerMembresiaSecciones } from './impacto'
import { obtenerPeriodoVigente } from './parte-consulta'
import { cargarMarcasMapa, marcasDeEscuela } from './evacuacion/marcas-mapa'
import { listarSeccionesDeCues } from './secciones-cue'
import { cuesDeInstitutoVigentes, totalesMatriculaInstitutos } from './alcance'
import { membresiaMatricula } from './alcance/matricula'
import {
  carrerasVigentesPorCue,
  efectivosPorAfectacion,
  leerScopeInstituto,
  type EfectivoInstituto,
} from './parte/instituto-alcance'
import { estadoGeneralDelCue } from './parte/instituto-estado'
import { claveServicioAlcance, resolverAlcanceVigente } from './vigencia-alcance'
import { esCategoria, type CategoriaAfectacion } from './categorias'
import { normalizarNombreDepartamento } from '@/lib/mapas/departamentos'
import { SEVERIDADES, type Severidad } from './validacion'
import type {
  Afectacion,
  AfectacionAlcanceSeccion,
  AsistenciaPedagogica,
  EstadoEstablecimiento,
  EstadoServicioGeneral,
  JustificacionCritica,
  ServicioAlcance,
} from './trayectoria-tipos'
import { esModalidadAsistenciaPedagogica } from './trayectoria-tipos'
import { enriquecerEscuela } from './mapa/enriquecer'
import type { EscuelaMapaEnriquecida } from './mapa/tipos'
import { VENTANA_CAUSA_DIAS } from './causa-afectacion'
import { normalizeCue } from './cue'
import { filtrosDeAlcance, type AlcanceMapa } from './alcance-mapa'

// Mismos filtros de establecimiento/afectación que FiltrosAlertas
// (consulta.ts), más los dos que agrega el modelo de parte: `categoria`
// (de la afectación) y `servicio` (el estado general calculado, nunca
// persistido — ver servicio-educativo.ts).
export interface FiltrosMapa {
  territorio?: string
  // Alcance por nivel jurisdiccional (rol director_nivel, ver alcance-mapa.ts).
  // undefined = sin restricción; [] = no matchea ninguna escuela.
  nivelesJurIds?: number[]
  nivel?: string
  cueAnexo?: string
  motivo?: string
  severidad?: string
  categoria?: CategoriaAfectacion
  servicio?: EstadoServicioGeneral
}

export interface AfectacionMapa {
  impactoAlumnos?: ImpactoAlumnos
  id: string
  motivo: string
  categoria: CategoriaAfectacion
  severidad: Severidad
  justificacionCritica?: JustificacionCritica
  justificacionCriticaDetalle?: string
  descripcion: string | null
  rigeDesde: string
  creadaEn: string
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
  // Sólo institutos superiores: carreras alcanzadas (matrícula, corte guardado).
  carrerasAlcanzadas?: number
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
  sinActualizar: number
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
import { UMBRAL_SIN_ACTUALIZAR_HORAS } from './umbrales'
import { ubicacionEnCorrientes } from './radar-meteo/departamentos'
export { UMBRAL_SIN_ACTUALIZAR_HORAS }

const resultadoVacio = { partes: [] as ParteMapa[], indicadores: indicadoresVacios() }

function indicadoresVacios(): IndicadoresMapa {
  return {
    escuelas: 0,
    conServicioSuspendido: 0,
    conServicioParcial: 0,
    evacuadas: 0,
    establecimientosParciales: 0,
    centrosDeEvacuados: 0,
    sinActualizar: 0,
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
// Alcance por nivel jurisdiccional: sólo escuelas cuyo nivel asignado (último
// import del padrón) está en la lista. Sin fila en ge_escuela_nivel_jur no
// matchea, así que una escuela sin nivel queda fuera del alcance.
function clausulaNivelesJur(cueColumna: string, ids: number[]): { sql: string; args: number[] } {
  if (ids.length === 0) return { sql: '1 = 0', args: [] }
  const marcas = ids.map(() => '?').join(', ')
  return {
    sql: `EXISTS (
        SELECT 1 FROM ge.ge_escuela_nivel_jur nje
        WHERE nje.cue_anexo = ${cueColumna} AND nje.nivel_jurisdiccional_id IN (${marcas})
      )`,
    args: ids,
  }
}

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
  if (filtros.nivelesJurIds) {
    const nivel = clausulaNivelesJur('p.cue_anexo', filtros.nivelesJurIds)
    clausulas.push(nivel.sql)
    args.push(...nivel.args)
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
  await cargarReferencias()
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
      if (interseccion.length > 0 || (fila.categoria === 'alumnos' && alumnosSeleccionados.size > 0)) {
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
  await cargarReferencias()
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
  if (activo(filtros.severidad) && prioridadEfectiva(afectacion) !== filtros.severidad) return false
  if (filtros.categoria !== undefined && afectacion.categoria !== filtros.categoria) return false
  return true
}

// Carreras y alumnos efectivos de afectaciones de institutos, cada una contra
// el corte con que se guardó. Dos consultas (alcance y membresía por corte),
// nunca una por afectación. Vacío sin corte de matrícula.
export async function efectivosDeAfectacionesInstituto(
  client: EjecutorSql,
  afectaciones: Afectacion[],
  corteMatricula: number | null,
): Promise<Map<string, EfectivoInstituto>> {
  if (corteMatricula === null || afectaciones.length === 0) return new Map()
  const scopes = await leerScopeInstituto(getDb(), afectaciones.map((a) => a.id))
  return efectivosPorAfectacion(client, scopes, corteMatricula)
}

export async function listarPartesVigentes(
  filtros: FiltrosMapa = {},
): Promise<{ partes: ParteMapa[]; indicadores: IndicadoresMapa }> {
  await cargarReferencias()
  const periodo = await obtenerPeriodoVigente()
  if (!periodo) return resultadoVacio

  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  // Con partes de demo creados sin padrón se conserva la vista del mapa: el
  // corte sintético sólo sirve para que las consultas nominales devuelvan
  // cero filas. Nunca se inventan secciones ni alumnos.
  const corteId = corte?.id ?? 0

  const parteRows = await cargarPartes(client, periodo.id, corteId, filtros)
  if (parteRows.length === 0) return resultadoVacio

  const parteIds = parteRows.map((p) => p.id)
  const cueAnexos = [...new Set(parteRows.map((p) => p.cueAnexo))]

  const [afectacionesRows, servicioRows, seccionesPorCue] = await Promise.all([
    cargarAfectacionesDeVariosPartes(client, corteId, parteIds),
    cargarServicioAlcanceDeVariosPartes(client, parteIds),
    listarSeccionesDeCues(client, corteId, cueAnexos),
  ])
  const todasLasSeccionesDelPadron = [...new Set([...seccionesPorCue.values()].flat().map((s) => s.geSectionId))]
  const padronCompleto = await obtenerMembresiaSecciones(client, { corteId, geSectionIds: todasLasSeccionesDelPadron })

  // Institutos superiores: un lote para todos los CUEs (nivel + corte de
  // matrícula, carreras vigentes, alcance por afectación con su corte guardado
  // y membresía por corte). Número constante de consultas, nunca por CUE.
  const { cues: cuesInstituto, corteId: corteMatricula } = await cuesDeInstitutoVigentes(client, cueAnexos)
  const cuePorParte = new Map(parteRows.map((p) => [p.id, p.cueAnexo]))
  const carrerasPorCue = cuesInstituto.size > 0
    ? await carrerasVigentesPorCue(client, [...cuesInstituto])
    : new Map<string, number[]>()
  const afectacionesInstituto = afectacionesRows.filter((a) => cuesInstituto.has(cuePorParte.get(a.parteId) ?? ''))
  const efectivosPorAfectacionInstituto = await efectivosDeAfectacionesInstituto(client, afectacionesInstituto, corteMatricula)
  const todasLasCarrerasInstituto = [...new Set([...carrerasPorCue.values()].flat())]
  const membresiaCarrerasInstituto = corteMatricula !== null && todasLasCarrerasInstituto.length > 0
    ? await membresiaMatricula(client, corteMatricula, todasLasCarrerasInstituto)
    : new Map<number, Set<number>>()

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

    const esInstituto = cuesInstituto.has(parteRow.cueAnexo)
    const secciones = seccionesPorCue.get(parteRow.cueAnexo) ?? []
    // Prioridad de alumnos (GE): matriculados de todo el CUE. Institutos: gravedad manual.
    const matriculadosGe = new Set(secciones.flatMap((s) => [...(padronCompleto.get(s.geSectionId) ?? [])]))
    const calculadas = esInstituto
      ? vigentes
      : vigentes.map((a) => proyectarImpactoAlumnos(a, matriculadosGe, corte?.id ?? null))
    const filtradas = calculadas.filter((a) => coincideFiltrosAfectacion(a, filtros))
    // Un parte cuyas afectaciones vigentes no matchean el filtro tampoco
    // aparece: el filtro no oculta afectaciones dentro de una escuela que sí
    // se muestra, oculta la escuela entera si no le queda ninguna.
    if (filtradas.length === 0) continue

    // Carreras vigentes del CUE (sólo existen en institutos; en GE queda []). Mismo criterio que evolucion.
    const carrerasDelCue = carrerasPorCue.get(parteRow.cueAnexo) ?? []
    // El estado del edificio puede quedar viejo al solucionar una situación de establecimiento: sólo se
    // proyecta si existe alguna abierta. El servicio se deriva igual que en la ficha (parte-consulta),
    // sin importar la categoría de las situaciones abiertas.
    const tieneSituacionDeEstablecimiento = vigentes.some((a) => a.categoria === 'establecimiento')
    const estadoEstablecimiento = tieneSituacionDeEstablecimiento
      ? parteRow.estadoEstablecimiento
      : 'habitual'
    const servicioVigente = resolverAlcanceVigente(servicioPorParte.get(parteRow.id) ?? [], {
      clave: claveServicioAlcance,
    })
    const servicioGeneral = estadoGeneralDelCue(servicioVigente, secciones, carrerasDelCue)
    if (filtros.servicio !== undefined && servicioGeneral !== filtros.servicio) continue

    const alumnosAlcanzados = new Set<string>()
    const seccionesAlcanzadas = new Set<number>()
    const carrerasAlcanzadas = new Set<number>()
    const categorias = new Set<CategoriaAfectacion>()
    let peorSeveridad: Severidad = prioridadEfectiva(filtradas[0]) ?? filtradas[0].severidad
    let peorIndice = SEVERIDADES.indexOf(peorSeveridad)
    let rigeDesdeMasAntiguo = filtradas[0].rigeDesde

    for (const afectacion of filtradas) {
      categorias.add(afectacion.categoria)

      const severidadAfectacion = prioridadEfectiva(afectacion) ?? afectacion.severidad
      const indice = SEVERIDADES.indexOf(severidadAfectacion)
      if (indice > peorIndice) {
        peorIndice = indice
        peorSeveridad = severidadAfectacion
      }

      if (new Date(afectacion.rigeDesde).getTime() < new Date(rigeDesdeMasAntiguo).getTime()) {
        rigeDesdeMasAntiguo = afectacion.rigeDesde
      }

      for (const seccion of afectacion.secciones) {
        seccionesAlcanzadas.add(seccion.geSectionId)
        // Dedupe a nivel PARTE, no a nivel afectación: un alumno alcanzado
        // por dos afectaciones distintas del mismo parte cuenta una vez.
        for (const alumnoId of seccion.alumnos) alumnosAlcanzados.add(`ge:${alumnoId}`)
      }
      // Institutos: carreras y alumnos efectivos de la afectación (corte guardado).
      // Prefijo de origen: ids de persona GE y de matrícula son espacios distintos.
      for (const [carreraId, alumnos] of efectivosPorAfectacionInstituto.get(afectacion.id) ?? []) {
        carrerasAlcanzadas.add(carreraId)
        for (const alumnoId of alumnos) alumnosAlcanzados.add(`mat:${alumnoId}`)
      }
    }

    const alumnosDelHecho = alumnosAlcanzados.size
    let alumnosDelEstablecimiento: number | null = null
    if (esInstituto && (estadoEstablecimiento === 'evacuado' || estadoEstablecimiento === 'centro_evacuados')) {
      // Mismo criterio que GE por turno: si hay carreras suspendidas, el padrón
      // interrumpido son sus alumnos; si no, toda la matrícula del CUE.
      const suspendidas = new Set(servicioVigente.filter((s) => s.estado === 'suspendido' && s.tipo === 'carrera').map((s) => Number(s.referenciaId)))
      const carrerasInterrumpidas = suspendidas.size > 0 ? carrerasDelCue.filter((id) => suspendidas.has(id)) : carrerasDelCue
      const roster = new Set<number>()
      for (const carreraId of carrerasInterrumpidas) {
        for (const alumno of membresiaCarrerasInstituto.get(carreraId) ?? []) roster.add(alumno)
      }
      if (carrerasInterrumpidas.length > 0) alumnosDelEstablecimiento = roster.size
    } else if (estadoEstablecimiento === 'evacuado' || estadoEstablecimiento === 'centro_evacuados') {
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
    const alumnosConsecuencia = calcularAlumnosAlcanzados({ alumnosDelHecho, estado: estadoEstablecimiento, alumnosDelEstablecimiento })

    partes.push({
      parteId: parteRow.id,
      cueAnexo: parteRow.cueAnexo,
      nombre: parteRow.nombre,
      departamento: parteRow.departamento,
      localidad: parteRow.localidad,
      lat: parteRow.lat,
      lon: parteRow.lon,
      servicio: servicioGeneral,
      estadoEstablecimiento,
      peorSeveridad,
      categorias: [...categorias],
      afectaciones: filtradas.map((a) => ({
        id: a.id,
        motivo: a.motivo,
        categoria: a.categoria,
        severidad: a.severidad,
        impactoAlumnos: a.impactoAlumnos,
        descripcion: a.descripcion,
        rigeDesde: a.rigeDesde,
        creadaEn: a.creadaEn,
      })),
      seccionesAlcanzadas: seccionesAlcanzadas.size,
      ...(esInstituto ? { carrerasAlcanzadas: carrerasAlcanzadas.size } : {}),
      alumnosDelHecho,
      alumnosAlcanzados: alumnosConsecuencia,
      rigeDesde: rigeDesdeMasAntiguo,
      actualizadaEn: parteRow.actualizadaEn,
    })
  }

  const ahoraMs = Date.now()
  const umbralMs = UMBRAL_SIN_ACTUALIZAR_HORAS * 60 * 60 * 1000

  const indicadores: IndicadoresMapa = {
    escuelas: partes.length,
    conServicioSuspendido: partes.filter((p) => p.servicio === 'suspendido').length,
    conServicioParcial: partes.filter((p) => p.servicio === 'parcial').length,
    evacuadas: partes.filter((p) => p.estadoEstablecimiento === 'evacuado').length,
    establecimientosParciales: partes.filter((p) => p.estadoEstablecimiento === 'parcial').length,
    centrosDeEvacuados: partes.filter((p) => p.estadoEstablecimiento === 'centro_evacuados').length,
    sinActualizar: partes.filter((p) => ahoraMs - new Date(p.actualizadaEn).getTime() > umbralMs).length,
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
  nivelJurisdiccional?: { id: number; nombre: string } | null
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

export type EscuelaMapaPadron = EscuelaMapa & EscuelaMapaEnriquecida
export type EscuelasMapaPadronResultado = {
  escuelas: EscuelaMapaPadron[]
  sinUbicacion: EscuelasMapaResultado['sinUbicacion']
  totalPadron: number
}

interface EscuelaPadronRow {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
  nivelJurisdiccional?: { id: number; nombre: string } | null
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
  if (filtros.nivelesJurIds) {
    const nivel = clausulaNivelesJur('l.cue_anexo', filtros.nivelesJurIds)
    clausulas.push(nivel.sql)
    args.push(...nivel.args)
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

  clausulas.push(`(NOT EXISTS (SELECT 1 FROM infra_dataset_publicacion WHERE dataset_id='localizaciones')
    OR EXISTS (SELECT 1 FROM infra_dataset_publicacion p JOIN infra_dataset_registro r ON r.version_id=p.version_id
      WHERE p.dataset_id='localizaciones' AND r.clave=l.cue_anexo))`)
  const where = clausulas.length > 0 ? `WHERE ${clausulas.join('\n  AND ')}` : ''
  const res = await client.execute({
    sql: `SELECT l.cue_anexo, l.cui, l.nombre, l.departamento, l.localidad, l.lat, l.lon,
            nj.id AS nivel_id, nj.nombre AS nivel_nombre
          FROM ge.ge_localizacion l
          LEFT JOIN ge.ge_escuela_nivel_jur ej ON ej.cue_anexo = l.cue_anexo
          LEFT JOIN ge.ge_nivel_jurisdiccional nj ON nj.id = ej.nivel_jurisdiccional_id
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
    nivelJurisdiccional:
      r.nivel_id === null || r.nivel_id === undefined
        ? null
        : { id: Number(r.nivel_id), nombre: stringValor(r.nivel_nombre) },
  }))
}

export async function listarEscuelasMapa(
  filtros: FiltrosMapa = {},
): Promise<EscuelasMapaResultado> {
  await cargarReferencias()
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
    // A coordinate outside the province is a padrón error: the school still
    // counts in its department totals, but is not drawn on the map.
    if (fila.lat === null || fila.lon === null || !ubicacionEnCorrientes(fila.lat, fila.lon)) {
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
      nivelJurisdiccional: fila.nivelJurisdiccional,
      estado: parte ? 'afectada' : 'sin_afectacion_reportada',
      ...(parte ? { parte } : {}),
    })
  }

  return { escuelas, sinUbicacion, totalPadron: escuelas.length + sinUbicacion.length }
}

/**
 * Returns the live affected-school IDs that would be drawn on the map without
 * loading and projecting the entire school register. Radar uses this set only
 * to avoid counting confirmed-affectation enrollment twice in its access KPI.
 */
export async function listarCuesAfectadosEnMapa(): Promise<string[]> {
  const { partes } = await listarPartesVigentes()
  const candidatos = [...new Set(partes
    .filter((parte) => parte.lat !== null && parte.lon !== null && ubicacionEnCorrientes(parte.lat, parte.lon))
    .map((parte) => parte.cueAnexo))]
  if (candidatos.length === 0) return []

  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)
  const placeholders = candidatos.map(() => '?').join(', ')
  const res = await client.execute({
    sql: `SELECT l.cue_anexo
          FROM ge.ge_localizacion l
          WHERE l.cue_anexo IN (${placeholders})
            AND (NOT EXISTS (SELECT 1 FROM infra_dataset_publicacion WHERE dataset_id='localizaciones')
              OR EXISTS (SELECT 1 FROM infra_dataset_publicacion p JOIN infra_dataset_registro r ON r.version_id=p.version_id
                WHERE p.dataset_id='localizaciones' AND r.clave=l.cue_anexo))`,
    args: candidatos,
  })
  const cuePorPadron = new Set(res.rows.map((row) => stringValor(row.cue_anexo)))
  return candidatos.filter((cue) => cuePorPadron.has(cue))
}

function esAsistenciaPedagogica(valor: unknown): valor is AsistenciaPedagogica {
  if (typeof valor !== 'object' || valor === null) return false
  const asistencia = valor as { brinda?: unknown; modalidades?: unknown }
  if (typeof asistencia.brinda !== 'boolean' || !Array.isArray(asistencia.modalidades)) return false
  return asistencia.modalidades.every(esModalidadAsistenciaPedagogica)
}

function parsearAsistenciaPedagogica(valor: unknown): AsistenciaPedagogica | null {
  if (typeof valor !== 'string' || valor === '') return null
  try {
    const parseado: unknown = JSON.parse(valor)
    return esAsistenciaPedagogica(parseado) ? parseado : null
  } catch {
    return null
  }
}

export async function listarEscuelasMapaEnriquecidas(
  filtros: FiltrosMapa = {},
): Promise<EscuelasMapaPadronResultado> {
  await cargarReferencias()
  const resultado = await listarEscuelasMapa(filtros)
  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)
  const corte = await getCorteVigente(client)
  const ahoraMs = Date.now()

  const situacionesPorCue = new Map<string, number>()
  const situacionesRes = await client.execute({
    sql: `SELECT p.cue_anexo, COUNT(a.id) AS situaciones
      FROM infra_afectacion a
      INNER JOIN infra_parte p ON p.id = a.parte_id
      WHERE a.cierre IS NULL OR a.cierre <> 'retirada'
      GROUP BY p.cue_anexo`,
    args: [],
  })
  for (const fila of situacionesRes.rows) {
    situacionesPorCue.set(stringValor(fila.cue_anexo), Number(fila.situaciones ?? 0))
  }

  const desde = new Date(ahoraMs - VENTANA_CAUSA_DIAS * 24 * 60 * 60 * 1000).toISOString()
  const solucionadasRes = await client.execute({
    sql: `SELECT p.cue_anexo, COUNT(a.id) AS situaciones
      FROM infra_afectacion a
      INNER JOIN infra_parte p ON p.id = a.parte_id
      WHERE a.cierre = 'solucionada' AND a.retirada_en >= ?
      GROUP BY p.cue_anexo`,
    args: [desde],
  })
  const solucionadasRecientesPorCue = new Map<string, number>()
  for (const fila of solucionadasRes.rows) {
    solucionadasRecientesPorCue.set(stringValor(fila.cue_anexo), Number(fila.situaciones ?? 0))
  }

  const datosPorCue = new Map<string, { niveles: Set<string>; alumnos: number }>()
  if (corte) {
    const res = await client.execute({
      sql: `SELECT s.cue_anexo, s.nivel, COUNT(DISTINCT a.ge_person_id) AS matricula
        FROM ge.ge_seccion s
        LEFT JOIN ge.ge_alumno_seccion a
          ON a.corte_id = s.corte_id AND a.ge_section_id = s.ge_section_id
        WHERE s.corte_id = ?
        GROUP BY s.cue_anexo, s.nivel, s.ge_section_id`,
      args: [corte.id],
    })
    for (const fila of res.rows) {
      const cue = stringValor(fila.cue_anexo)
      const dato = datosPorCue.get(cue) ?? { niveles: new Set<string>(), alumnos: 0 }
      dato.niveles.add(stringValor(fila.nivel))
      dato.alumnos += Number(fila.matricula ?? 0)
      datosPorCue.set(cue, dato)
    }
  }

  // Institutos superiores: niveles y matrícula salen de la matrícula vigente
  // (sus secciones GE no describen al instituto). GE queda como estaba.
  const totalesInstitutos = await totalesMatriculaInstitutos(client)

  const marcas = await cargarMarcasMapa()

  const partes = resultado.escuelas.flatMap((escuela) => escuela.parte ? [escuela.parte] : [])
  const asistenciaPorParte = new Map<string, AsistenciaPedagogica | null>()
  if (partes.length > 0) {
    const placeholders = partes.map(() => '?').join(', ')
    const asistenciaRes = await client.execute({
      sql: `SELECT id, asistencia_pedagogica FROM infra_parte WHERE id IN (${placeholders})`,
      args: partes.map((parte) => parte.parteId),
    })
    for (const fila of asistenciaRes.rows) {
      asistenciaPorParte.set(stringValor(fila.id), parsearAsistenciaPedagogica(fila.asistencia_pedagogica))
    }
  }

  return {
    ...resultado,
    escuelas: resultado.escuelas.map((escuela) => {
      const datos = datosPorCue.get(escuela.cueAnexo)
      const instituto = totalesInstitutos.get(escuela.cueAnexo)
      const asistencia = escuela.parte ? asistenciaPorParte.get(escuela.parte.parteId) ?? null : null
      return {
        ...escuela,
        ...enriquecerEscuela(escuela, {
          niveles: instituto ? [] : datos ? [...datos.niveles] : [],
          alumnos: instituto ? instituto.alumnos : datos?.alumnos ?? 0,
          carreras: instituto?.carreras,
          asistencia,
          situacionesHistoricas: situacionesPorCue.get(escuela.cueAnexo) ?? 0,
          solucionadasRecientes: solucionadasRecientesPorCue.get(escuela.cueAnexo) ?? 0,
        }, ahoraMs),
        ...(instituto ? { carreras: instituto.carreras } : {}),
        ...marcasDeEscuela(escuela.cueAnexo, marcas),
      }
    }),
  }
}

// Sólo institutos superiores: cantidad de carreras vigentes del CUE. Ausente en GE.
export interface DatosInstitutoMapa {
  carreras: number
}

export type EscuelaFichaEnriquecida = EscuelaMapaPadron & Partial<DatosInstitutoMapa> & {
  ubicacionDisponible: boolean
}

export type ResultadoEscuelaFicha =
  | { estado: 'ok'; escuela: EscuelaFichaEnriquecida }
  | { estado: 'no_encontrada' }
  | { estado: 'sin_alcance' }
  | { estado: 'cue_invalido' }

export async function verificarCueEnAlcance(
  client: EjecutorSql,
  cueAnexo: string,
  alcance: AlcanceMapa,
): Promise<'ok' | 'sin_alcance' | 'fuera_de_alcance'> {
  if (alcance.tipo === 'ninguno') return 'sin_alcance'
  if (alcance.tipo === 'todo') return 'ok'
  if (alcance.ids.length === 0) return 'sin_alcance'

  const marcas = alcance.ids.map(() => '?').join(', ')
  const res = await client.execute({
    sql: `SELECT 1 FROM ge.ge_escuela_nivel_jur WHERE cue_anexo = ? AND nivel_jurisdiccional_id IN (${marcas}) LIMIT 1`,
    args: [cueAnexo, ...alcance.ids],
  })
  return res.rows.length > 0 ? 'ok' : 'fuera_de_alcance'
}

export async function obtenerEscuelaFichaEnriquecida(
  cueRaw: string,
  alcance: AlcanceMapa,
  ahoraMs: number = Date.now(),
): Promise<ResultadoEscuelaFicha> {
  const parsed = normalizeCue(cueRaw)
  if (!parsed) return { estado: 'cue_invalido' }
  if (alcance.tipo === 'ninguno') return { estado: 'sin_alcance' }
  if (alcance.tipo === 'niveles' && alcance.ids.length === 0) {
    return { estado: 'sin_alcance' }
  }

  const cueAnexo = parsed.value
  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)

  const filtros: FiltrosMapa = {
    cueAnexo,
    ...filtrosDeAlcance(alcance),
  }

  const padron = await cargarPadronEscuelas(client, filtros, null)
  if (padron.length === 0) {
    return { estado: 'no_encontrada' }
  }

  const fila = padron[0]
  const ubicacionDisponible =
    fila.lat !== null &&
    fila.lon !== null &&
    ubicacionEnCorrientes(fila.lat, fila.lon)

  const [{ partes }, corte] = await Promise.all([
    listarPartesVigentes(filtros),
    getCorteVigente(client),
  ])

  const parte = partes[0]
  const escuelaBase: EscuelaMapa = {
    cueAnexo: fila.cueAnexo,
    nombre: fila.nombre,
    departamento: fila.departamento,
    localidad: fila.localidad,
    lat: ubicacionDisponible ? redondearCoordenada(fila.lat) : null,
    lon: ubicacionDisponible ? redondearCoordenada(fila.lon) : null,
    nivelJurisdiccional: fila.nivelJurisdiccional,
    estado: parte ? 'afectada' : 'sin_afectacion_reportada',
    ...(parte ? { parte } : {}),
  }

  const desde = new Date(ahoraMs - VENTANA_CAUSA_DIAS * 24 * 60 * 60 * 1000).toISOString()

  const instituto = (await totalesMatriculaInstitutos(client, cueAnexo)).get(cueAnexo)

  const [situacionesRes, solucionadasRes, datosRes, asistenciaRes] = await Promise.all([
    client.execute({
      sql: `SELECT COUNT(a.id) AS situaciones
        FROM infra_afectacion a
        INNER JOIN infra_parte p ON p.id = a.parte_id
        WHERE p.cue_anexo = ? AND (a.cierre IS NULL OR a.cierre <> 'retirada')`,
      args: [cueAnexo],
    }),
    client.execute({
      sql: `SELECT COUNT(a.id) AS situaciones
        FROM infra_afectacion a
        INNER JOIN infra_parte p ON p.id = a.parte_id
        WHERE p.cue_anexo = ? AND a.cierre = 'solucionada' AND a.retirada_en >= ?`,
      args: [cueAnexo, desde],
    }),
    corte
      ? client.execute({
          sql: `SELECT s.nivel, COUNT(DISTINCT a.ge_person_id) AS matricula
            FROM ge.ge_seccion s
            LEFT JOIN ge.ge_alumno_seccion a
              ON a.corte_id = s.corte_id AND a.ge_section_id = s.ge_section_id
            WHERE s.corte_id = ? AND s.cue_anexo = ?
            GROUP BY s.nivel, s.ge_section_id`,
          args: [corte.id, cueAnexo],
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    parte
      ? client.execute({
          sql: 'SELECT asistencia_pedagogica FROM infra_parte WHERE id = ?',
          args: [parte.parteId],
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
  ])

  const situacionesHistoricas = Number(situacionesRes.rows[0]?.situaciones ?? 0)
  const solucionadasRecientes = Number(solucionadasRes.rows[0]?.situaciones ?? 0)

  const nivelesSet = new Set<string>()
  let alumnos = 0
  for (const r of datosRes.rows) {
    nivelesSet.add(stringValor(r.nivel))
    alumnos += Number(r.matricula ?? 0)
  }

  const asistencia =
    asistenciaRes.rows.length > 0
      ? parsearAsistenciaPedagogica(asistenciaRes.rows[0].asistencia_pedagogica)
      : null

  const enriquecida = enriquecerEscuela(
    escuelaBase,
    {
      niveles: instituto ? [] : [...nivelesSet],
      alumnos: instituto ? instituto.alumnos : alumnos,
      asistencia,
      situacionesHistoricas,
      solucionadasRecientes,
    },
    ahoraMs,
  )

  return {
    estado: 'ok',
    escuela: {
      ...escuelaBase,
      ...enriquecida,
      ubicacionDisponible,
      ...(instituto ? { carreras: instituto.carreras } : {}),
      ...marcasDeEscuela(cueAnexo, await cargarMarcasMapa(cueAnexo)),
    },
  }
}
