import type { Client } from '@libsql/client'
import { normalizeCue } from './cue'
import { getCorteVigente } from './ge-db'

export interface SeccionContexto {
  // Clave estable de la sección (= establecimientoCursoDivisionId de GE). NO es dato
  // personal: es el identificador institucional con el que el formulario informa qué
  // secciones selecciona, y el que POST /api/problematicas valida contra ge_seccion.
  // Lo prohibido en este payload es ge_person_id y cualquier identidad de alumno.
  geSectionId: number
  curso: string
  division: string
  nivel: string
  turno: string
  matricula: number
}

export interface NivelContexto {
  nivel: string
  secciones: SeccionContexto[]
}

export interface TurnoContexto {
  turno: string
  niveles: NivelContexto[]
}

export interface EscuelaContexto {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
}

export interface ContextoCue {
  escuela: EscuelaContexto
  turnos: TurnoContexto[]
}

export type ContextoErrorKind =
  | 'cue_ausente'
  | 'cue_invalido'
  | 'sin_corte_vigente'
  | 'cue_inexistente'
  | 'sin_secciones'

export interface ContextoError {
  kind: ContextoErrorKind
}

export type ContextoResultado = { ok: true; contexto: ContextoCue } | { ok: false; error: ContextoError }

interface SeccionRow {
  curso: string
  division: string
  nivel: string
  turno: string
  geSectionId: number
  matricula: number
}

function agruparPorTurnoYNivel(secciones: SeccionContexto[]): TurnoContexto[] {
  const turnos: TurnoContexto[] = []
  for (const seccion of secciones) {
    let turno = turnos.find((t) => t.turno === seccion.turno)
    if (!turno) {
      turno = { turno: seccion.turno, niveles: [] }
      turnos.push(turno)
    }
    let nivel = turno.niveles.find((n) => n.nivel === seccion.nivel)
    if (!nivel) {
      nivel = { nivel: seccion.nivel, secciones: [] }
      turno.niveles.push(nivel)
    }
    nivel.secciones.push(seccion)
  }
  return turnos
}

// Resuelve el contexto público de un CUE: localización y secciones con matrícula agregada.
// Nunca incluye ge_person_id ni ningún otro dato de identidad de alumnos.
export async function resolverContextoPorCue(
  client: Client,
  rawCue: string | null | undefined,
): Promise<ContextoResultado> {
  if (rawCue == null || rawCue.trim() === '') {
    return { ok: false, error: { kind: 'cue_ausente' } }
  }

  const identifier = normalizeCue(rawCue)
  if (!identifier) {
    return { ok: false, error: { kind: 'cue_invalido' } }
  }

  // La identidad de la escuela sale de ge_localizacion, que se siembra desde el
  // JSON versionado y no depende del padrón. Se resuelve ANTES que el corte: el
  // formulario público sólo necesita nombre y CUE para abrirse, y no tiene por
  // qué caerse entero porque el padrón nominal todavía no se importó. El corte
  // hace falta únicamente para ofrecer las secciones.
  const locRes = await client.execute({
    sql: 'SELECT cue_anexo as cueAnexo, nombre, departamento, localidad FROM ge_localizacion WHERE cue_anexo = ?',
    args: [identifier.value],
  })
  if (locRes.rows.length === 0) {
    return { ok: false, error: { kind: 'cue_inexistente' } }
  }
  const localizacion = locRes.rows[0]

  const corte = await getCorteVigente(client)

  // Una sola consulta con la matrícula ya agregada. Antes se hacía un COUNT por
  // sección: una escuela con cien secciones disparaba cien consultas.
  const seccionesRows = corte
    ? ((
        await client.execute({
          sql: `SELECT s.ge_section_id as geSectionId, s.curso, s.division, s.nivel, s.turno,
                       COUNT(DISTINCT a.ge_person_id) as matricula
                FROM ge_seccion s
                LEFT JOIN ge_alumno_seccion a
                  ON a.corte_id = s.corte_id AND a.ge_section_id = s.ge_section_id
                WHERE s.corte_id = ? AND s.cue_anexo = ?
                GROUP BY s.ge_section_id, s.curso, s.division, s.nivel, s.turno
                ORDER BY s.turno, s.nivel, s.curso, s.division`,
          args: [corte.id, identifier.value],
        })
      ).rows as unknown as SeccionRow[])
    : []

  const secciones: SeccionContexto[] = seccionesRows.map((row) => ({
    geSectionId: Number(row.geSectionId),
    curso: String(row.curso),
    division: String(row.division),
    nivel: String(row.nivel),
    turno: String(row.turno),
    matricula: Number(row.matricula ?? 0),
  }))

  return {
    ok: true,
    contexto: {
      escuela: {
        cueAnexo: String(localizacion.cueAnexo),
        nombre: String(localizacion.nombre),
        departamento: String(localizacion.departamento),
        localidad: String(localizacion.localidad),
      },
      turnos: agruparPorTurnoYNivel(secciones),
    },
  }
}
