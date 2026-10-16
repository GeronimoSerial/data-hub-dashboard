import type { EjecutorSql } from './ge-db'

// Catálogo de niveles jurisdiccionales de GE y nivel asignado a cada CUE-anexo.
// Lo puebla scripts/import-padron.mjs desde public.secciones; acá solo se lee.

export interface NivelJurisdiccional {
  id: number
  nombre: string
}

export interface NivelJurisdiccionalDeCue extends NivelJurisdiccional {
  cicloLectivo: number
}

export async function listarNivelesJurisdiccionales(client: EjecutorSql): Promise<NivelJurisdiccional[]> {
  const res = await client.execute(
    'SELECT id, nombre FROM ge.ge_nivel_jurisdiccional ORDER BY id',
  )
  return res.rows.map((row) => ({ id: Number(row.id), nombre: String(row.nombre) }))
}

// Devuelve el nivel jurisdiccional que GE asigna al CUE en el último import, o
// null si el CUE no tiene nivel cargado (no está en el padrón importado).
export async function nivelJurisdiccionalDeCue(
  client: EjecutorSql,
  cue: string,
): Promise<NivelJurisdiccionalDeCue | null> {
  const res = await client.execute({
    sql: `SELECT n.id, n.nombre, e.ciclo_lectivo
          FROM ge.ge_escuela_nivel_jur e
          JOIN ge.ge_nivel_jurisdiccional n ON n.id = e.nivel_jurisdiccional_id
          WHERE e.cue_anexo = ?`,
    args: [cue],
  })
  const row = res.rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    nombre: String(row.nombre),
    cicloLectivo: Number(row.ciclo_lectivo),
  }
}
