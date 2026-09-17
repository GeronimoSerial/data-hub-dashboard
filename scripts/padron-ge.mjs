/**
 * Lector del padrón nominal desde la base Postgres de Gestión Educativa
 * (`asistencias`). Es la fuente de verdad del padrón; ge.sqlite es solo una
 * proyección local materializada como corte.
 *
 * Devuelve filas con la misma forma que produce el lector de HTML, de modo que
 * el resto del pipeline (reconciliación, derivación de ids, cifrado, carga del
 * corte) no distingue el origen.
 *
 * El DNI viaja en memoria únicamente para derivar gePersonId: nunca se
 * persiste, no se loguea y no se cifra.
 */
import pg from 'pg'

// El ciclo lectivo se guarda como texto en `alumnos` y `secciones`.
export const CICLO_LECTIVO_POR_DEFECTO = String(new Date().getFullYear())

// Solo alumnos activos del ciclo pedido. `status` es un enum de Postgres, de
// ahí el cast a texto. El JOIN con `secciones` trae la ubicación curricular
// completa; `personas` trae la identidad que después se cifra.
const SQL_PADRON = `
  SELECT p.nro_documento AS dni,
         p.apellido      AS apellido,
         p.nombre        AS nombre,
         s.nivel_ensenanza AS nivel,
         s.cue_anexo     AS cue_anexo,
         s.curso         AS curso,
         s.division      AS division,
         s.turno         AS turno
  FROM alumnos a
  JOIN personas p  ON p.persona_id = a.persona_id
  JOIN secciones s ON s.id = a.seccion_id
  WHERE a.ciclo_lectivo = $1
    AND a.status::text = 'activo'
`

/**
 * Acepta tanto una URL `postgres://...` como el formato de par clave/valor que
 * usa .NET (`Server=...;Port=...;Database=...;User Id=...;Password=...;`), que
 * es el que viene en la variable `ConnectionStrings`.
 */
export function parsearConexion(raw) {
  const texto = String(raw ?? '').trim()
  if (texto === '') throw new Error('La cadena de conexión está vacía')

  if (/^postgres(ql)?:\/\//i.test(texto)) return { connectionString: texto }

  const pares = new Map()
  for (const segmento of texto.split(';')) {
    const corte = segmento.indexOf('=')
    if (corte === -1) continue
    const clave = segmento.slice(0, corte).trim().toLowerCase()
    if (clave === '') continue
    pares.set(clave, segmento.slice(corte + 1).trim())
  }

  const host = pares.get('server') ?? pares.get('host')
  const database = pares.get('database')
  const user = pares.get('user id') ?? pares.get('username') ?? pares.get('uid')
  const password = pares.get('password') ?? pares.get('pwd')
  const puerto = pares.get('port')

  const faltantes = []
  if (!host) faltantes.push('Server')
  if (!database) faltantes.push('Database')
  if (!user) faltantes.push('User Id')
  if (faltantes.length > 0) {
    throw new Error(`La cadena de conexión no tiene ${faltantes.join(', ')}`)
  }

  return {
    host,
    port: puerto ? Number(puerto) : 5432,
    database,
    user,
    password,
  }
}

/**
 * Resuelve la conexión desde el entorno. `PADRON_PG_URL` es la variable de
 * producción; `ConnectionStrings` existe para no duplicar el .env de desarrollo.
 */
export function conexionDesdeEntorno(env = process.env) {
  const raw = env.PADRON_PG_URL ?? env.ConnectionStrings
  if (!raw) {
    throw new Error(
      'Falta PADRON_PG_URL (o ConnectionStrings) con la conexión a la base de Gestión Educativa',
    )
  }
  return parsearConexion(raw)
}

// Normaliza una fila de Postgres a la forma común del pipeline. Los NULL de
// texto pasan a cadena vacía porque las columnas de ge_seccion son NOT NULL
// (hay ~20k secciones sin turno cargado).
export function normalizarFilaGe(row) {
  const texto = (valor) => (valor === null || valor === undefined ? '' : String(valor).trim())
  return {
    dni: texto(row.dni),
    apellido: texto(row.apellido),
    nombre: texto(row.nombre),
    nivel: texto(row.nivel),
    cueAnexo: texto(row.cue_anexo),
    curso: texto(row.curso),
    division: texto(row.division),
    turno: texto(row.turno),
  }
}

/**
 * Trae el padrón completo del ciclo. Descarta filas sin DNI porque sin él no se
 * puede derivar un gePersonId estable.
 */
export async function leerPadronDesdeGe({
  conexion,
  cicloLectivo = CICLO_LECTIVO_POR_DEFECTO,
  Client = pg.Client,
} = {}) {
  const client = new Client(conexion ?? conexionDesdeEntorno())
  await client.connect()
  try {
    const res = await client.query(SQL_PADRON, [String(cicloLectivo)])
    const filas = []
    let sinDocumento = 0
    for (const row of res.rows) {
      const fila = normalizarFilaGe(row)
      if (fila.dni === '') {
        sinDocumento++
        continue
      }
      filas.push(fila)
    }
    return { filas, sinDocumento, cicloLectivo: String(cicloLectivo) }
  } finally {
    await client.end()
  }
}
