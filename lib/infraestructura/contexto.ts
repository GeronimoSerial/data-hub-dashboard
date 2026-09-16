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

  const corte = await getCorteVigente(client)
  if (!corte) {
    return { ok: false, error: { kind: 'sin_corte_vigente' } }
  }

  const locRes = await client.execute({
    sql: 'SELECT cue_anexo as cueAnexo, nombre, departamento, localidad FROM ge_localizacion WHERE cue_anexo = ?',
    args: [identifier.value],
  })
  if (locRes.rows.length === 0) {
    return { ok: false, error: { kind: 'cue_inexistente' } }
  }
  const localizacion = locRes.rows[0]

  const seccionesRes = await client.execute({
    sql: `SELECT ge_section_id as geSectionId, curso, division, nivel, turno
          FROM ge_seccion
          WHERE corte_id = ? AND cue_anexo = ?
          ORDER BY turno, nivel, curso, division`,
    args: [corte.id, identifier.value],
  })
  if (seccionesRes.rows.length === 0) {
    return { ok: false, error: { kind: 'sin_secciones' } }
  }
  const seccionesRows = seccionesRes.rows as unknown as SeccionRow[]

  const secciones: SeccionContexto[] = []
  for (const row of seccionesRows) {
    const matriculaRes = await client.execute({
      sql: 'SELECT COUNT(DISTINCT ge_person_id) as n FROM ge_alumno_seccion WHERE corte_id = ? AND ge_section_id = ?',
      args: [corte.id, row.geSectionId],
    })
    secciones.push({
      geSectionId: Number(row.geSectionId),
      curso: String(row.curso),
      division: String(row.division),
      nivel: String(row.nivel),
      turno: String(row.turno),
      matricula: Number(matriculaRes.rows[0].n),
    })
  }

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
