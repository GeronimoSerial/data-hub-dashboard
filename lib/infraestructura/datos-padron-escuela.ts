// Datos agregados del padrón GE para la ficha de una escuela (F3.2/V4):
// nivel(es) educativo(s), matrícula total del corte vigente y cantidad de
// secciones/turnos. Es un agregado PURO por escuela: nunca expone identidad de
// alumno (ni ge_person_id, ni nombres), sólo conteos.
//
// El contrato del esquema `ge` está en GE_DDL (lib/infraestructura/ge-db.ts):
// - `ge_seccion` tiene cue_anexo, nivel y turno (una fila por sección).
// - `ge_alumno_seccion` es la membresía alumno-sección (matrícula).
//
// NO existe en el schema `ge` una columna de ámbito/sector (público/privado):
// por eso `DatosPadronEscuela` no la incluye. Si algún día aparece, se agrega
// acá y en el SELECT, sin inventarla antes de tiempo.
//
// Requiere que `client` ya tenga adjuntada la base `ge` (ver
// asegurarGeAdjuntada en impacto.ts); esta función no la adjunta por sí misma.
import type { EjecutorSql } from './ge-db'

export interface DatosPadronEscuela {
  niveles: string[]
  secciones: number
  matriculaTotal: number
  turnos: string[]
}

// Cuenta la matrícula TOTAL de una escuela sin repetir alumnos entre secciones
// (un alumno que cursa en dos secciones del mismo CUE cuenta una sola vez).
// El COUNT(DISTINCT) se agrega en SQL: nunca se traen los ge_person_id al
// proceso. `?? 0` cubre el caso de una escuela sin filas de matrícula: la
// escuela igual TIENE datos de padrón (sus secciones existen), así que la
// ficha muestra 0 alumnos, no "sin datos".
async function contarMatriculaTotal(
  client: EjecutorSql,
  corteId: number,
  cueAnexo: string,
): Promise<number> {
  const res = await client.execute({
    sql: `SELECT COUNT(DISTINCT a.ge_person_id) AS total
          FROM ge.ge_alumno_seccion a
          JOIN ge.ge_seccion s
            ON s.corte_id = a.corte_id AND s.ge_section_id = a.ge_section_id
          WHERE a.corte_id = ? AND s.cue_anexo = ?`,
    args: [corteId, cueAnexo],
  })
  return Number(res.rows[0]?.total ?? 0)
}

// Una sola consulta agregada (GROUP BY nivel, turno) para secciones, niveles y
// turnos; una segunda para la matrícula total. Nunca una consulta por sección.
//
// Devuelve `null` cuando la escuela no tiene NINGUNA sección en el corte
// vigente: es el llamador quien decide mostrar "Sin datos del padrón para esta
// escuela" en vez de inventar ceros. Una escuela CON secciones pero sin
// alumnos devuelve `{ niveles, secciones, matriculaTotal: 0, turnos }` — eso sí
// es un cero real del padrón, no ausencia de datos.
export async function obtenerDatosPadronEscuela(
  client: EjecutorSql,
  corteId: number,
  cueAnexo: string,
): Promise<DatosPadronEscuela | null> {
  const seccionesRes = await client.execute({
    sql: `SELECT nivel, turno, COUNT(*) AS cantidad
          FROM ge.ge_seccion
          WHERE corte_id = ? AND cue_anexo = ?
          GROUP BY nivel, turno`,
    args: [corteId, cueAnexo],
  })

  if (seccionesRes.rows.length === 0) return null

  let secciones = 0
  const niveles = new Set<string>()
  const turnos = new Set<string>()
  for (const fila of seccionesRes.rows) {
    secciones += Number(fila.cantidad ?? 0)
    niveles.add(String(fila.nivel))
    turnos.add(String(fila.turno))
  }

  const matriculaTotal = await contarMatriculaTotal(client, corteId, cueAnexo)

  return {
    niveles: [...niveles].sort(),
    secciones,
    matriculaTotal,
    turnos: [...turnos].sort(),
  }
}
