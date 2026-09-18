import type { Client } from '@libsql/client'
import { asegurarGeAdjuntada } from './impacto'
import { getCorteVigente } from './ge-db'
import { esCategoria, type CategoriaProblematica } from './categorias'

export interface FiltrosAlertas {
  territorio?: string
  nivel?: string
  cueAnexo?: string
  motivo?: string
  severidad?: string
}

export interface AlertaActiva {
  id: string
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
  motivo: string
  categoria: CategoriaProblematica
  severidad: string
  creadaEn: string
}

export interface IndicadoresConsolidados {
  escuelas: number
  localizaciones: number
  inmuebles: number | null
  inmueblesDisponible: boolean
  alumnos: number
  universoEducativo: number
}

export interface ConsultaAlertasResultado {
  alertas: AlertaActiva[]
  indicadores: IndicadoresConsolidados
}

const resultadoVacio: ConsultaAlertasResultado = {
  alertas: [],
  indicadores: {
    escuelas: 0,
    localizaciones: 0,
    inmuebles: null,
    inmueblesDisponible: false,
    alumnos: 0,
    universoEducativo: 0,
  },
}

function activo(valor: string | undefined): boolean {
  return valor !== undefined && valor !== ''
}

function coordenada(original: unknown): number | null {
  return original === null || original === undefined ? null : Number(original)
}

function stringValor(original: unknown): string {
  return original === null || original === undefined ? '' : String(original)
}

// Filtros de alerta comunes a la consulta principal y a la de alumnos. Viven
// sobre los aliases p (infra_problematica) y l (ge.ge_localizacion). Devuelve
// las cláusulas WHERE y los args correspondientes en orden de aparición.
function filtrosAlertasSql(filtros: FiltrosAlertas): { clausulas: string[]; args: (string)[] } {
  const clausulas: string[] = []
  const args: string[] = []

  if (activo(filtros.territorio)) {
    clausulas.push('(l.departamento = ? OR l.localidad = ?)')
    args.push(filtros.territorio!, filtros.territorio!)
  }
  if (activo(filtros.cueAnexo)) {
    clausulas.push('p.cue_anexo = ?')
    args.push(filtros.cueAnexo!)
  }
  if (activo(filtros.motivo)) {
    clausulas.push('p.motivo = ?')
    args.push(filtros.motivo!)
  }
  if (activo(filtros.severidad)) {
    clausulas.push('p.severidad = ?')
    args.push(filtros.severidad!)
  }
  return { clausulas, args }
}

function filtrosNivelSql(filtros: FiltrosAlertas): { clausulas: string[]; args: (string)[] } {
  const clausulas: string[] = []
  const args: string[] = []

  if (activo(filtros.nivel)) {
    clausulas.push('s.nivel = ?')
    args.push(filtros.nivel!)
  }
  return { clausulas, args }
}

function filtrosPoblacionSql(filtros: FiltrosAlertas): { clausulas: string[]; args: (string)[] } {
  const clausulas: string[] = []
  const args: string[] = []

  if (activo(filtros.territorio)) {
    clausulas.push('(l.departamento = ? OR l.localidad = ?)')
    args.push(filtros.territorio!, filtros.territorio!)
  }
  if (activo(filtros.cueAnexo)) {
    clausulas.push('sec.cue_anexo = ?')
    args.push(filtros.cueAnexo!)
  }
  if (activo(filtros.nivel)) {
    clausulas.push('sec.nivel = ?')
    args.push(filtros.nivel!)
  }
  return { clausulas, args }
}

// Filtros de alerta para la consulta de alumnos: iguales a los del listado
// pero sobre el alias sec (ge.ge_seccion) para el nivel.
function filtrosAlumnosNivelSql(filtros: FiltrosAlertas): { clausulas: string[]; args: (string)[] } {
  const clausulas: string[] = []
  const args: string[] = []

  if (activo(filtros.nivel)) {
    clausulas.push('sec.nivel = ?')
    args.push(filtros.nivel!)
  }
  return { clausulas, args }
}

export async function listarAlertasActivas(
  client: Client,
  filtros: FiltrosAlertas,
): Promise<ConsultaAlertasResultado> {
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) return { ...resultadoVacio }

  const alertasSql = filtrosAlertasSql(filtros)
  const nivelSql = filtrosNivelSql(filtros)

  const clausulasAlertas = [...alertasSql.clausulas]
  const argsAlertas = [...alertasSql.args]

  if (nivelSql.clausulas.length > 0) {
    clausulasAlertas.push(
      `EXISTS (
        SELECT 1
        FROM infra_problematica_seccion ps
        JOIN ge.ge_seccion s ON s.ge_section_id = ps.ge_section_id AND s.corte_id = p.corte_id
        WHERE ps.problematica_id = p.id AND ${nivelSql.clausulas[0]}
      )`,
    )
    argsAlertas.push(...nivelSql.args)
  }

  const whereAlertas = clausulasAlertas.length > 0 ? `WHERE ${clausulasAlertas.join('\n  AND ')}` : ''

  const res = await client.execute({
    sql: `SELECT p.id, p.cue_anexo, l.nombre, l.departamento, l.localidad, l.lat, l.lon, l.cui, p.motivo, p.categoria, p.severidad, p.creada_en
          FROM infra_problematica p
          JOIN ge.ge_localizacion l ON l.cue_anexo = p.cue_anexo
          ${whereAlertas}
          ORDER BY p.creada_en DESC`,
    args: argsAlertas,
  })

  const alertas: AlertaActiva[] = []
  const cues = new Set<string>()
  const cuesConCoordenadas = new Set<string>()
  const cuis = new Set<unknown>()

  for (const r of res.rows) {
    const cueAnexo = stringValor(r.cue_anexo)
    const categoriaValor = stringValor(r.categoria)
    alertas.push({
      id: stringValor(r.id),
      cueAnexo,
      nombre: stringValor(r.nombre),
      departamento: stringValor(r.departamento),
      localidad: stringValor(r.localidad),
      lat: coordenada(r.lat),
      lon: coordenada(r.lon),
      motivo: stringValor(r.motivo),
      // Conservador: una fila con categoria inesperada (no debería ocurrir,
      // ver backfill en seed.ts) nunca se trata como 'alumnos'.
      categoria: esCategoria(categoriaValor) ? categoriaValor : 'establecimiento',
      severidad: stringValor(r.severidad),
      creadaEn: stringValor(r.creada_en),
    })

    cues.add(cueAnexo)
    if (r.lat !== null && r.lat !== undefined && r.lon !== null && r.lon !== undefined) {
      cuesConCoordenadas.add(cueAnexo)
    }
    if (r.cui !== null && r.cui !== undefined) {
      cuis.add(r.cui)
    }
  }

  const escuelas = cues.size
  const localizaciones = cuesConCoordenadas.size

  const inmueblesDisponible = cuis.size > 0
  const inmuebles = inmueblesDisponible ? cuis.size : null

  const alumnosSql = filtrosAlertasSql(filtros)
  const alumnosNivelSql = filtrosAlumnosNivelSql(filtros)

  const clausulasAlumnos = [...alumnosSql.clausulas]
  const argsAlumnos = [...alumnosSql.args]

  if (alumnosNivelSql.clausulas.length > 0) {
    clausulasAlumnos.push(alumnosNivelSql.clausulas[0])
    argsAlumnos.push(...alumnosNivelSql.args)
  }

  const whereAlumnos = clausulasAlumnos.length > 0 ? `WHERE ${clausulasAlumnos.join('\n  AND ')}` : ''

  const alumnosRes = await client.execute({
    sql: `SELECT COUNT(DISTINCT al.ge_person_id) AS n
          FROM infra_problematica p
          JOIN infra_problematica_seccion ps ON ps.problematica_id = p.id
          JOIN ge.ge_seccion sec ON sec.ge_section_id = ps.ge_section_id AND sec.corte_id = p.corte_id
          JOIN ge.ge_alumno_seccion al ON al.ge_section_id = ps.ge_section_id AND al.corte_id = p.corte_id
          JOIN ge.ge_localizacion l ON l.cue_anexo = p.cue_anexo
          ${whereAlumnos}`,
    args: argsAlumnos,
  })

  const poblacionSql = filtrosPoblacionSql(filtros)
  const wherePoblacion = poblacionSql.clausulas.length > 0
    ? `WHERE sec.corte_id = ? AND ${poblacionSql.clausulas.join('\n  AND ')}`
    : 'WHERE sec.corte_id = ?'

  const universoRes = await client.execute({
    sql: `SELECT COUNT(DISTINCT al.ge_person_id) AS n
          FROM ge.ge_seccion sec
          JOIN ge.ge_alumno_seccion al ON al.ge_section_id = sec.ge_section_id AND al.corte_id = sec.corte_id
          JOIN ge.ge_localizacion l ON l.cue_anexo = sec.cue_anexo
          ${wherePoblacion}`,
    args: [corte.id, ...poblacionSql.args],
  })

  return {
    alertas,
    indicadores: {
      escuelas,
      localizaciones,
      inmuebles,
      inmueblesDisponible,
      alumnos: Number(alumnosRes.rows[0]?.n ?? 0),
      universoEducativo: Number(universoRes.rows[0]?.n ?? 0),
    },
  }
}