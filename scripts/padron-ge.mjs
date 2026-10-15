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
  ORDER BY a.id
  LIMIT $2 OFFSET $3
`

// Se pagina a propósito. El padrón son ~272.000 filas: traerlas todas de una y
// quedarse además con los arrays intermedios llevaba el proceso a ~1 GB de RSS y
// lo mataba dentro del contenedor de producción, donde la RAM se comparte con
// el resto de las apps. Por lote el pico queda en decenas de MB.
export const TAMANO_PAGINA = 25000

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
 *
 * @param {Record<string, string | undefined>} [env]
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
 * @typedef {object} OpcionesConsultaPadronGe
 * @property {*} [conexion] - Config de conexión de `pg.Client`. Sin tipar a
 *   propósito: los tests inyectan clases y objetos falsos que no son un
 *   `pg.Client` real (ver `Client` más abajo).
 * @property {string} [cicloLectivo]
 * @property {new (...args: any[]) => any} [Client] - Constructor inyectable;
 *   por defecto `pg.Client`, pero los tests pasan clases falsas.
 * @property {number} [tamanoPagina]
 */

/**
 * Recorre el padrón del ciclo por lotes y entrega cada uno a `onLote`. Nunca
 * mantiene más de una página en memoria: el llamador acumula lo que necesita y
 * el lote se descarta.
 *
 * Devuelve los totales, no las filas, justamente para que no haya forma de
 * retener el padrón entero sin querer.
 *
 * @param {OpcionesConsultaPadronGe & { onLote: (lote: ReturnType<typeof normalizarFilaGe>[]) => unknown }} opciones
 */
export async function recorrerPadronDesdeGe({
  conexion,
  cicloLectivo = CICLO_LECTIVO_POR_DEFECTO,
  Client = pg.Client,
  tamanoPagina = TAMANO_PAGINA,
  onLote,
} = {}) {
  if (typeof onLote !== 'function') throw new Error('recorrerPadronDesdeGe necesita onLote')

  const client = new Client(conexion ?? conexionDesdeEntorno())
  await client.connect()
  try {
    let offset = 0
    let leidas = 0
    let sinDocumento = 0

    for (;;) {
      const res = await client.query(SQL_PADRON, [String(cicloLectivo), tamanoPagina, offset])
      if (res.rows.length === 0) break

      const filas = []
      for (const row of res.rows) {
        leidas++
        const fila = normalizarFilaGe(row)
        if (fila.dni === '') {
          sinDocumento++
          continue
        }
        filas.push(fila)
      }

      await onLote(filas)

      if (res.rows.length < tamanoPagina) break
      offset += tamanoPagina
    }

    return { leidas, sinDocumento, cicloLectivo: String(cicloLectivo) }
  } finally {
    await client.end()
  }
}

/**
 * Trae el padrón completo en memoria. Sirve para pruebas y para volúmenes
 * chicos; el importador usa recorrerPadronDesdeGe.
 *
 * @param {OpcionesConsultaPadronGe} [opciones]
 */
export async function leerPadronDesdeGe(opciones = {}) {
  const filas = []
  const { leidas, sinDocumento, cicloLectivo } = await recorrerPadronDesdeGe({
    ...opciones,
    onLote: (lote) => {
      for (const f of lote) filas.push(f)
    },
  })
  return { filas, leidas, sinDocumento, cicloLectivo }
}

// Niveles jurisdiccionales por CUE-anexo del ciclo. `secciones` trae el nivel
// que GE asigna a cada sección; el DISTINCT colapsa las secciones de un mismo CUE.
const SQL_NIVELES_JURISDICCIONALES = `
  SELECT DISTINCT s.cue_anexo              AS cue_anexo,
                  s.nivel_jurisdiccional_id AS nivel_jurisdiccional_id,
                  s.nivel_jurisdiccional    AS nivel_jurisdiccional
  FROM secciones s
  WHERE s.ciclo_lectivo = $1
    AND s.nivel_jurisdiccional_id IS NOT NULL
`

/**
 * Agrupa las filas de SQL_NIVELES_JURISDICCIONALES en catálogo (id → nombre) y
 * asignación (CUE → id). Falla si un CUE aparece con dos niveles o si un id
 * aparece con dos nombres: en ese caso no hay una verdad única que importar.
 *
 * @param {{ cue_anexo: unknown, nivel_jurisdiccional_id: unknown, nivel_jurisdiccional: unknown }[]} filas
 */
export function agruparNivelesJurisdiccionales(filas) {
  const niveles = new Map()
  const cues = new Map()

  for (const row of filas) {
    const id = Number(row.nivel_jurisdiccional_id)
    const nombre = String(row.nivel_jurisdiccional ?? '').trim()
    const cue = String(row.cue_anexo ?? '').trim()
    if (cue === '') continue

    const nombreExistente = niveles.get(id)
    if (nombreExistente !== undefined && nombreExistente !== nombre) {
      throw new Error(`Nivel jurisdiccional ${id} con nombres distintos: "${nombreExistente}" y "${nombre}"`)
    }
    niveles.set(id, nombre)

    const idExistente = cues.get(cue)
    if (idExistente !== undefined && idExistente !== id) {
      throw new Error(`CUE ${cue} con más de un nivel jurisdiccional en el ciclo: ${idExistente} y ${id}`)
    }
    cues.set(cue, id)
  }

  return {
    niveles: [...niveles.entries()].map(([id, nombre]) => ({ id, nombre })),
    cues: [...cues.entries()].map(([cueAnexo, nivelJurisdiccionalId]) => ({ cueAnexo, nivelJurisdiccionalId })),
  }
}

/**
 * Lee el catálogo de niveles jurisdiccionales y la asignación CUE → nivel del
 * ciclo. Usa la misma conexión que recorrerPadronDesdeGe.
 *
 * @param {OpcionesConsultaPadronGe} [opciones]
 */
export async function leerNivelesJurisdiccionalesDesdeGe({
  conexion,
  cicloLectivo = CICLO_LECTIVO_POR_DEFECTO,
  Client = pg.Client,
} = {}) {
  const client = new Client(conexion ?? conexionDesdeEntorno())
  await client.connect()
  try {
    const res = await client.query(SQL_NIVELES_JURISDICCIONALES, [String(cicloLectivo)])
    return { ...agruparNivelesJurisdiccionales(res.rows), cicloLectivo: String(cicloLectivo) }
  } finally {
    await client.end()
  }
}
