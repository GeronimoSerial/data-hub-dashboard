// Search over the vigente matrícula cut for the institute (higher education)
// parte flow. Reads only; the response never carries a DNI or its hash.
import type { EjecutorSql } from '@/lib/infraestructura/ge-db'
import { hashDni } from './dni'
import { normalizeSearchName } from './filas'

export const LIMITE_POR_DEFECTO = 50
export const LIMITE_MAXIMO = 100

const LARGO_DNI_MINIMO = 6
const LARGO_DNI_MAXIMO = 9
const LARGO_TEXTO_MINIMO = 2
const MAX_ENTERO_PG = 2_147_483_647
const MAX_CARRERAS = 50

export type FiltroBusqueda =
  | { tipo: 'ninguno' }
  | { tipo: 'dni'; dni: string }
  | { tipo: 'texto'; tokens: string[] }

export type ParametrosBusqueda = {
  cueAnexo: string
  carreras: number[]
  limite: number
  filtro: FiltroBusqueda
}

export type EntradaBusqueda = {
  cueAnexo: string
  carreras: string | null
  q: string | null
  limite: string | null
}

export type ResultadoParseo =
  | { ok: true; parametros: ParametrosBusqueda }
  | { ok: false; error: string }

export type AlumnoBusqueda = {
  id: number
  apellido: string
  nombre: string
  carreraId: number
}

export type ResultadoBusqueda =
  | { sinCorte: true }
  | { sinCorte: false; alumnos: AlumnoBusqueda[]; truncado: boolean }

// Valida la entrada HTTP sin tocar la base. Carreras ajenas al CUE no se
// rechazan acá: la consulta las descarta junto con las que no existen.
export function parsearBusqueda(entrada: EntradaBusqueda): ResultadoParseo {
  const carreras = parsearCarreras(entrada.carreras)
  if (!carreras.ok) return { ok: false, error: carreras.error }

  const limite = parsearLimite(entrada.limite)
  if (limite === null) return { ok: false, error: 'Límite inválido' }

  const filtro = parsearFiltro(entrada.q ?? '')
  if (!filtro.ok) return { ok: false, error: filtro.error }

  return {
    ok: true,
    parametros: {
      cueAnexo: entrada.cueAnexo,
      carreras: carreras.value,
      limite,
      filtro: filtro.value,
    },
  }
}

type ResultadoParcial<T> = { ok: true; value: T } | { ok: false; error: string }

function parsearCarreras(texto: string | null): ResultadoParcial<number[]> {
  const partes = (texto ?? '').split(',').map((parte) => parte.trim()).filter((parte) => parte !== '')
  if (partes.length === 0) return { ok: false, error: 'Seleccione al menos una carrera' }
  if (partes.some((parte) => !/^\d+$/.test(parte))) return { ok: false, error: 'Carreras inválidas' }
  const ids = [...new Set(partes.map(Number))]
  if (ids.some((id) => id < 1 || id > MAX_ENTERO_PG)) return { ok: false, error: 'Carreras inválidas' }
  if (ids.length > MAX_CARRERAS) return { ok: false, error: 'Demasiadas carreras seleccionadas' }
  return { ok: true, value: ids }
}

function parsearLimite(texto: string | null): number | null {
  const limpio = (texto ?? '').trim()
  if (limpio === '') return LIMITE_POR_DEFECTO
  if (!/^\d+$/.test(limpio)) return null
  const valor = Number(limpio)
  if (valor < 1) return null
  return Math.min(valor, LIMITE_MAXIMO)
}

function parsearFiltro(qCrudo: string): ResultadoParcial<FiltroBusqueda> {
  const sinSeparadores = qCrudo.trim().replace(/[.\s]/g, '')
  if (/^\d+$/.test(sinSeparadores)) {
    if (sinSeparadores.length < LARGO_DNI_MINIMO) return { ok: false, error: 'Ingrese el DNI completo' }
    if (sinSeparadores.length > LARGO_DNI_MAXIMO) {
      return { ok: false, error: 'Ingrese un DNI válido de 6 a 9 dígitos' }
    }
    return { ok: true, value: { tipo: 'dni', dni: sinSeparadores } }
  }

  const normalizado = normalizeSearchName(qCrudo)
  if (normalizado === '') return { ok: true, value: { tipo: 'ninguno' } }
  if (normalizado.length < LARGO_TEXTO_MINIMO) return { ok: false, error: 'Ingrese al menos 2 letras' }
  return { ok: true, value: { tipo: 'texto', tokens: normalizado.split(' ') } }
}

// LIKE wildcards in user input are escaped with '!' (ESCAPE clause below).
export function escaparLike(texto: string): string {
  return texto.replace(/[!%_]/g, (caracter) => `!${caracter}`)
}

// Every token must match the start of the full name or the start of a later
// word, so "perez ana" and "ana perez" both find "PEREZ ANA MARIA".
export async function buscarAlumnos(
  ejecutor: EjecutorSql,
  parametros: ParametrosBusqueda,
): Promise<ResultadoBusqueda> {
  const vigente = await ejecutor.execute("SELECT id FROM matricula_corte WHERE estado = 'vigente'")
  const corteRow = vigente.rows[0]
  if (!corteRow) return { sinCorte: true }
  const corteId = Number(corteRow.id)

  const condiciones = [
    'a.corte_id = ?',
    'c.corte_id = ?',
    'c.cue_anexo = ?',
    `c.id IN (${parametros.carreras.map(() => '?').join(', ')})`,
  ]
  const args: unknown[] = [corteId, corteId, parametros.cueAnexo, ...parametros.carreras]

  const { filtro } = parametros
  if (filtro.tipo === 'dni') {
    condiciones.push('a.dni_hash = ?')
    args.push(hashDni(filtro.dni))
  } else if (filtro.tipo === 'texto') {
    for (const token of filtro.tokens) {
      const escapado = escaparLike(token)
      condiciones.push("(a.nombre_busqueda LIKE ? ESCAPE '!' OR a.nombre_busqueda LIKE ? ESCAPE '!')")
      args.push(`${escapado}%`, `% ${escapado}%`)
    }
  }
  args.push(parametros.limite + 1)

  const sql = [
    'SELECT a.id, a.apellidos, a.nombres, a.carrera_id',
    'FROM matricula_alumno a',
    'JOIN matricula_carrera c ON c.id = a.carrera_id',
    `WHERE ${condiciones.join(' AND ')}`,
    'ORDER BY a.apellidos, a.nombres, a.id',
    'LIMIT ?',
  ].join(' ')

  const { rows } = await ejecutor.execute({ sql, args })
  const alumnos = rows.slice(0, parametros.limite).map((fila) => ({
    id: Number(fila.id),
    apellido: String(fila.apellidos),
    nombre: String(fila.nombres),
    carreraId: Number(fila.carrera_id),
  }))
  return { sinCorte: false, alumnos, truncado: rows.length > parametros.limite }
}
