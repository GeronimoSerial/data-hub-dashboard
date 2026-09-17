import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolverContextoPorCue } from './contexto'
import { ensureGeSchema, openGeDb } from './ge-db'
import { importarIdentidad } from './identidad'

let dir: string
let prevDataDir: string | undefined
let prevKey: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'contexto-'))
  prevDataDir = process.env.DATA_DIR
  prevKey = process.env.NOMINAL_ENCRYPTION_KEY
  process.env.DATA_DIR = dir
  process.env.NOMINAL_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevKey === undefined) delete process.env.NOMINAL_ENCRYPTION_KEY
  else process.env.NOMINAL_ENCRYPTION_KEY = prevKey
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
                { nivel: 'Inicial', secciones: [{ geSectionId: 10, curso: 'Sala 5', division: 'A', nivel: 'Inicial', turno: 'Mañana', matricula: 2, alumnos: [] }] },
                { nivel: 'Primario', secciones: [{ geSectionId: 11, curso: '1', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 1, alumnos: [] }] },
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
          { turno: 'Mañana', niveles: [{ nivel: 'Primario', secciones: [{ geSectionId: 20, curso: '1', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 0, alumnos: [] }] }] },
        ])
      }

      expect(anexo.ok).toBe(true)
      if (anexo.ok) {
        expect(anexo.contexto.escuela.nombre).toBe('Escuela Anexo 01')
        expect(anexo.contexto.turnos).toEqual([
          { turno: 'Tarde', niveles: [{ nivel: 'Primario', secciones: [{ geSectionId: 21, curso: '2', division: 'B', nivel: 'Primario', turno: 'Tarde', matricula: 0, alumnos: [] }] }] },
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

  // Invariante anterior (documentado acá hasta este cambio): el payload nunca
  // llevaba ge_person_id ni identidad de alumnos. El titular del dato pidió
  // habilitar la selección de alumnos individuales en el formulario público,
  // amparado en la contraseña temporal de acceso (ver acceso-publico.ts): a
  // partir de acá SÍ viaja identidad de alumnos, ya descifrada, por sección.
  it('incluye por sección los alumnos con nombre y apellido descifrados', async () => {
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
      await importarIdentidad(client, 555444, 'Ana', 'Pérez')

      const resultado = await resolverContextoPorCue(client, '1801605-04')

      expect(resultado.ok).toBe(true)
      if (!resultado.ok) return
      expect(resultado.contexto.turnos[0].niveles[0].secciones[0].alumnos).toEqual([
        { gePersonId: 555444, nombre: 'Ana', apellido: 'Pérez' },
      ])
    } finally {
      client.close()
    }
  })

  it('no incluye alumnos sin identidad importada, aunque estén matriculados', async () => {
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

      expect(resultado.ok).toBe(true)
      if (!resultado.ok) return
      expect(resultado.contexto.turnos[0].niveles[0].secciones[0].matricula).toBe(1)
      expect(resultado.contexto.turnos[0].niveles[0].secciones[0].alumnos).toEqual([])
    } finally {
      client.close()
    }
  })
})
