import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolverContextoPorCue } from './contexto'
import { ensureGeSchema, openGeDb } from './ge-db'

let dir: string
let prevDataDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'contexto-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

async function seedCorteVigente(client: Awaited<ReturnType<typeof openGeDb>>) {
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2026, '2026-03-01T00:00:00Z', 'vigente')",
  )
}

describe('resolverContextoPorCue', () => {
  it('agrupa secciones por turno y nivel, con matricula agregada, para un CUE con dos niveles', async () => {
    const client = openGeDb()
    try {
      await seedCorteVigente(client)
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', NULL, 'Escuela 4', 'Entre Rios', 'Parana')",
      )
      await client.execute(
        "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', 'Sala 5', 'A', 'Inicial', 'Mañana')",
      )
      await client.execute(
        "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 11, '1801605-04', '1', 'A', 'Primario', 'Mañana')",
      )
      // alumno 1002 esta en dos secciones (10 y 11): debe contarse una vez en cada una, nunca fusionarse.
      await client.execute('INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 1001)')
      await client.execute('INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 1002)')
      await client.execute('INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 11, 1002)')

      const resultado = await resolverContextoPorCue(client, '1801605-04')

      expect(resultado).toEqual({
        ok: true,
        contexto: {
          escuela: {
            cueAnexo: '1801605-04',
            nombre: 'Escuela 4',
            departamento: 'Entre Rios',
            localidad: 'Parana',
          },
          turnos: [
            {
              turno: 'Mañana',
              niveles: [
                { nivel: 'Inicial', secciones: [{ geSectionId: 10, curso: 'Sala 5', division: 'A', nivel: 'Inicial', turno: 'Mañana', matricula: 2 }] },
                { nivel: 'Primario', secciones: [{ geSectionId: 11, curso: '1', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 1 }] },
              ],
            },
          ],
        },
      })
    } finally {
      client.close()
    }
  })

  it('no confunde un CUE base con su anexo', async () => {
    const client = openGeDb()
    try {
      await seedCorteVigente(client)
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605', NULL, 'Escuela Base', 'Entre Rios', 'Parana')",
      )
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-01', NULL, 'Escuela Anexo 01', 'Entre Rios', 'Parana')",
      )
      await client.execute(
        "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 20, '1801605', '1', 'A', 'Primario', 'Mañana')",
      )
      await client.execute(
        "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 21, '1801605-01', '2', 'B', 'Primario', 'Tarde')",
      )

      const base = await resolverContextoPorCue(client, '1801605')
      const anexo = await resolverContextoPorCue(client, '1801605-01')

      expect(base.ok).toBe(true)
      if (base.ok) {
        expect(base.contexto.escuela.nombre).toBe('Escuela Base')
        expect(base.contexto.turnos).toEqual([
          { turno: 'Mañana', niveles: [{ nivel: 'Primario', secciones: [{ geSectionId: 20, curso: '1', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 0 }] }] },
        ])
      }

      expect(anexo.ok).toBe(true)
      if (anexo.ok) {
        expect(anexo.contexto.escuela.nombre).toBe('Escuela Anexo 01')
        expect(anexo.contexto.turnos).toEqual([
          { turno: 'Tarde', niveles: [{ nivel: 'Primario', secciones: [{ geSectionId: 21, curso: '2', division: 'B', nivel: 'Primario', turno: 'Tarde', matricula: 0 }] }] },
        ])
      }
    } finally {
      client.close()
    }
  })

  it('devuelve error cue_ausente cuando no se pasa CUE', async () => {
    const client = openGeDb()
    try {
      await seedCorteVigente(client)
      expect(await resolverContextoPorCue(client, null)).toEqual({ ok: false, error: { kind: 'cue_ausente' } })
      expect(await resolverContextoPorCue(client, '')).toEqual({ ok: false, error: { kind: 'cue_ausente' } })
      expect(await resolverContextoPorCue(client, '   ')).toEqual({ ok: false, error: { kind: 'cue_ausente' } })
    } finally {
      client.close()
    }
  })

  it('devuelve error cue_invalido para un formato que no matchea CUE', async () => {
    const client = openGeDb()
    try {
      await seedCorteVigente(client)
      expect(await resolverContextoPorCue(client, 'abc')).toEqual({ ok: false, error: { kind: 'cue_invalido' } })
    } finally {
      client.close()
    }
  })

  it('devuelve error cue_inexistente cuando el CUE no esta en ge_localizacion', async () => {
    const client = openGeDb()
    try {
      await seedCorteVigente(client)
      expect(await resolverContextoPorCue(client, '9999999')).toEqual({ ok: false, error: { kind: 'cue_inexistente' } })
    } finally {
      client.close()
    }
  })

  it('devuelve la escuela con turnos vacios cuando no tiene secciones en el corte vigente', async () => {
    const client = openGeDb()
    try {
      await seedCorteVigente(client)
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605', NULL, 'Escuela Sin Secciones', 'Entre Rios', 'Parana')",
      )
      const r = await resolverContextoPorCue(client, '1801605')
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.contexto.escuela.nombre).toBe('Escuela Sin Secciones')
      expect(r.contexto.turnos).toEqual([])
    } finally {
      client.close()
    }
  })

  // El formulario publico solo necesita nombre y CUE para abrirse. Que el padron
  // nominal todavia no este importado no puede dejar sin canal de reporte a las
  // 2005 escuelas, cuya identidad ya vive en ge_localizacion.
  it('resuelve la escuela aunque no haya ningun corte vigente', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801777', NULL, 'Escuela Sin Corte', 'Corrientes', 'Goya')",
      )
      const r = await resolverContextoPorCue(client, '1801777')
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.contexto.escuela).toEqual({
        cueAnexo: '1801777',
        nombre: 'Escuela Sin Corte',
        departamento: 'Corrientes',
        localidad: 'Goya',
      })
      expect(r.contexto.turnos).toEqual([])
    } finally {
      client.close()
    }
  })

  it('el resultado nunca contiene ge_person_id ni claves de identidad de alumnos', async () => {
    const client = openGeDb()
    try {
      await seedCorteVigente(client)
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', NULL, 'Escuela 4', 'Entre Rios', 'Parana')",
      )
      await client.execute(
        "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'Primario', 'Mañana')",
      )
      await client.execute('INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 555444)')

      const resultado = await resolverContextoPorCue(client, '1801605-04')
      const serializado = JSON.stringify(resultado)

      expect(serializado).not.toContain('gePersonId')
      expect(serializado).not.toContain('ge_person_id')
      expect(serializado).not.toContain('555444')
      // geSectionId SÍ viaja: es la clave institucional de la sección, no un dato personal.
      // El formulario la necesita para informar qué secciones selecciona y POST
      // /api/problematicas la valida contra ge_seccion. Lo prohibido es la identidad del alumno.
      expect(resultado).toMatchObject({ ok: true })
      expect(serializado).toContain('geSectionId')
    } finally {
      client.close()
    }
  })
})
