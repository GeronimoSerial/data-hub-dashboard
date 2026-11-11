import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getRawClient } from '../db'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import {
  eliminarCorte,
  listarCortes,
  mantenerCortes,
  planificarMantenimiento,
  politicaDesdeEntorno,
  type CorteResumen,
} from './ge-cortes'

const HORA = 3_600_000
const AHORA = new Date('2026-10-24T12:00:00Z')

function corte(id: number, estado: CorteResumen['estado'], horasAtras: number, partes = 0): CorteResumen {
  return {
    id,
    estado,
    fetchedAt: new Date(AHORA.getTime() - horasAtras * HORA).toISOString(),
    secciones: 10,
    membresias: 100,
    partes,
  }
}

const ids = (lista: CorteResumen[]) => lista.map((c) => c.id)

describe('politicaDesdeEntorno', () => {
  it('usa defaults (2 históricos, 6 h) y respeta valores válidos del entorno', () => {
    expect(politicaDesdeEntorno({})).toEqual({ historicosAConservar: 2, huerfanoTrasMs: 6 * HORA })
    expect(politicaDesdeEntorno({ PADRON_CORTES_HISTORICOS: '0', PADRON_HUERFANO_HORAS: '12' })).toEqual({
      historicosAConservar: 0,
      huerfanoTrasMs: 12 * HORA,
    })
  })

  it('ignora valores inválidos', () => {
    expect(politicaDesdeEntorno({ PADRON_CORTES_HISTORICOS: '-1', PADRON_HUERFANO_HORAS: 'x' })).toEqual({
      historicosAConservar: 2,
      huerfanoTrasMs: 6 * HORA,
    })
  })
})

describe('planificarMantenimiento', () => {
  const politica = { historicosAConservar: 2, huerfanoTrasMs: 6 * HORA, ahora: AHORA }

  it('reproduce el estado de prod: borra los 4 importando muertos y conserva el vigente', () => {
    const plan = planificarMantenimiento(
      [corte(1, 'importando', 900), corte(2, 'importando', 899), corte(3, 'importando', 890), corte(4, 'vigente', 889, 54), corte(5, 'importando', 200)],
      politica,
    )
    expect(ids(plan.huerfanos)).toEqual([1, 2, 3, 5])
    expect(plan.historicosARotar).toEqual([])
  })

  it('no toca importando recientes, el corte en curso ni nada si hay otro import vivo', () => {
    const cortes = [corte(7, 'importando', 1), corte(8, 'importando', 10), corte(9, 'importando', 10)]
    expect(ids(planificarMantenimiento(cortes, { ...politica, corteEnCursoId: 9 }).huerfanos)).toEqual([8])
    expect(planificarMantenimiento(cortes, { ...politica, hayOtroImportVivo: true }).huerfanos).toEqual([])
  })

  it('rota históricos conservando los N más nuevos y retiene los que tienen partes', () => {
    const plan = planificarMantenimiento(
      [corte(10, 'historico', 100, 3), corte(11, 'historico', 80), corte(12, 'historico', 60), corte(13, 'historico', 40), corte(14, 'historico', 20), corte(15, 'vigente', 1)],
      politica,
    )
    expect(ids(plan.conservados)).toEqual([14, 13])
    expect(ids(plan.historicosARotar)).toEqual([12, 11])
    expect(ids(plan.retenidosPorPartes)).toEqual([10])
  })

  it('con N=0 rota todos los históricos sin partes', () => {
    const plan = planificarMantenimiento([corte(1, 'historico', 5), corte(2, 'vigente', 1)], { ...politica, historicosAConservar: 0 })
    expect(ids(plan.historicosARotar)).toEqual([1])
  })
})

function cliente() {
  return crearEjecutorSql(getRawClient())
}

let creamosInfraParte = false

async function sembrarCorte(id: number, estado: string, fetchedAt: string, membresias: number) {
  const client = cliente()
  await client.execute({
    sql: 'INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (?, 2026, ?, ?)',
    args: [id, fetchedAt, estado],
  })
  await client.execute({
    sql: "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (?, 1, '1800001-00', '1', 'A', 'PRIMARIA', 'MAÑANA')",
    args: [id],
  })
  if (membresias > 0) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) SELECT ?, 1, g FROM generate_series(1, ?) AS g',
      args: [id, membresias],
    })
  }
}

describe('eliminarCorte / mantenerCortes (PGlite)', () => {
  beforeEach(async () => {
    const client = cliente()
    await ensureGeSchema(client)
    const existe = await client.execute("SELECT to_regclass('public.infra_parte') IS NOT NULL AS existe")
    if (!existe.rows[0]?.existe) {
      await client.execute('CREATE TABLE public.infra_parte (id text PRIMARY KEY, corte_id integer NOT NULL)')
      creamosInfraParte = true
    }
    await client.execute("DELETE FROM public.infra_parte WHERE id LIKE 'test-ge-cortes-%'")
    await client.execute('DELETE FROM ge.ge_alumno_seccion')
    await client.execute('DELETE FROM ge.ge_seccion')
    await client.execute('DELETE FROM ge.ge_corte')
  })

  afterAll(async () => {
    if (creamosInfraParte) await cliente().execute('DROP TABLE public.infra_parte')
  })

  it('borra membresías, secciones y la fila del corte en una transacción', async () => {
    await sembrarCorte(1, 'importando', '2026-09-17T01:20:56Z', 1200)
    expect(await eliminarCorte(cliente(), 1, ['importando'])).toBe(true)
    const res = await cliente().execute(
      'SELECT (SELECT COUNT(*) FROM ge.ge_corte) AS c, (SELECT COUNT(*) FROM ge.ge_seccion) AS s, (SELECT COUNT(*) FROM ge.ge_alumno_seccion) AS m',
    )
    expect(res.rows[0]).toMatchObject({ c: 0, s: 0, m: 0 })
  })

  it('nunca borra el vigente ni un estado no permitido, aunque se lo pidan', async () => {
    await sembrarCorte(4, 'vigente', '2026-09-17T13:01:34Z', 10)
    await sembrarCorte(6, 'historico', '2026-09-01T00:00:00Z', 10)
    expect(await eliminarCorte(cliente(), 4, ['vigente', 'importando', 'historico'])).toBe(false)
    expect(await eliminarCorte(cliente(), 6, ['importando'])).toBe(false)
    expect((await listarCortes(cliente())).map((c) => c.id)).toEqual([4, 6])
  })

  it('no borra un corte referenciado por infra_parte', async () => {
    await sembrarCorte(3, 'historico', '2026-09-01T00:00:00Z', 10)
    const client = cliente()
    if (creamosInfraParte) {
      await client.execute("INSERT INTO public.infra_parte (id, corte_id) VALUES ('test-ge-cortes-1', 3)")
    } else {
      await client.execute(
        "INSERT INTO public.infra_parte (id, periodo_id, cue_anexo, estado_establecimiento_rige_desde, corte_id, creada_en, actualizada_en) VALUES ('test-ge-cortes-1', 'p', '1800001-00', 'x', 3, 'x', 'x')",
      )
    }
    expect((await listarCortes(client))[0].partes).toBe(1)
    expect(await eliminarCorte(client, 3, ['historico'])).toBe(false)
    expect((await listarCortes(client)).map((c) => c.id)).toEqual([3])
  })

  it('mantenerCortes en dry-run sólo informa; sin dry-run limpia huérfanos y rota', async () => {
    await sembrarCorte(1, 'importando', '2026-09-17T01:20:56Z', 30)
    await sembrarCorte(2, 'historico', '2026-09-20T00:00:00Z', 5)
    await sembrarCorte(3, 'historico', '2026-09-21T00:00:00Z', 5)
    await sembrarCorte(4, 'vigente', '2026-09-22T00:00:00Z', 5)
    await sembrarCorte(5, 'importando', new Date(AHORA.getTime() - HORA).toISOString(), 5)
    const politica = { historicosAConservar: 1, huerfanoTrasMs: 6 * HORA, ahora: AHORA }

    const seco = await mantenerCortes(cliente(), { ...politica, dryRun: true })
    expect(seco.dryRun).toBe(true)
    expect(ids(seco.huerfanos)).toEqual([1])
    expect(ids(seco.historicosARotar)).toEqual([2])
    expect(seco.eliminados).toEqual([])
    expect((await listarCortes(cliente())).length).toBe(5)

    const soloHuerfanos = await mantenerCortes(cliente(), { ...politica, soloHuerfanos: true })
    expect(soloHuerfanos.eliminados).toEqual([1])

    const real = await mantenerCortes(cliente(), politica)
    expect(real.eliminados).toEqual([2])
    expect((await listarCortes(cliente())).map((c) => `${c.id}:${c.estado}`)).toEqual(['3:historico', '4:vigente', '5:importando'])
  })

  describe('borrado por tramos', () => {
    const FILAS = 50_001

    /** Ejecutor crudo que registra BEGIN/COMMIT/ROLLBACK y los DELETE, y puede fallar en el n-ésimo DELETE de membresías. */
    function rawEspiado(fallarEnDeleteMembresia?: number) {
      const real = getRawClient() as unknown as { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }
      const log: string[] = []
      let deletesMembresia = 0
      const raw = {
        query: async (text: string, params?: unknown[]) => {
          if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') log.push(text)
          if (text.startsWith('DELETE FROM ge.ge_alumno_seccion')) {
            deletesMembresia += 1
            if (deletesMembresia === fallarEnDeleteMembresia) throw new Error('fallo simulado')
          }
          if (text.startsWith('DELETE FROM')) log.push(text.split(' WHERE')[0])
          return real.query(text, params)
        },
      }
      return { raw, log }
    }

    async function contar() {
      const res = await cliente().execute(
        'SELECT (SELECT COUNT(*) FROM ge.ge_corte) AS c, (SELECT COUNT(*) FROM ge.ge_seccion) AS s, (SELECT COUNT(*) FROM ge.ge_alumno_seccion) AS m',
      )
      return { c: Number(res.rows[0].c), s: Number(res.rows[0].s), m: Number(res.rows[0].m) }
    }

    it('borra un histórico con más filas que un tramo por completo', async () => {
      await sembrarCorte(7, 'historico', '2026-09-01T00:00:00Z', FILAS)
      expect(await eliminarCorte(cliente(), 7, ['historico'])).toBe(true)
      expect(await contar()).toEqual({ c: 0, s: 0, m: 0 })
    })

    it('nunca borra el vigente aunque tenga más filas que un tramo', async () => {
      await sembrarCorte(8, 'vigente', '2026-09-17T13:01:34Z', FILAS)
      expect(await eliminarCorte(cliente(), 8, ['vigente', 'historico'])).toBe(false)
      expect(await contar()).toEqual({ c: 1, s: 1, m: FILAS })
    })

    it('un fallo tras el primer tramo deja el corte presente y una segunda llamada lo termina', async () => {
      await sembrarCorte(9, 'historico', '2026-09-01T00:00:00Z', FILAS)
      const { raw } = rawEspiado(2)
      await expect(eliminarCorte(crearEjecutorSql(raw), 9, ['historico'])).rejects.toThrow('fallo simulado')
      expect(await contar()).toEqual({ c: 1, s: 1, m: 1 })

      expect(await eliminarCorte(cliente(), 9, ['historico'])).toBe(true)
      expect(await contar()).toEqual({ c: 0, s: 0, m: 0 })
    })

    it('cada tramo corre en su propia transacción: el COMMIT libera el lock entre tramos', async () => {
      await sembrarCorte(10, 'historico', '2026-09-01T00:00:00Z', FILAS)
      const { raw, log } = rawEspiado()
      expect(await eliminarCorte(crearEjecutorSql(raw), 10, ['historico'])).toBe(true)
      expect(log).toEqual([
        'BEGIN',
        'DELETE FROM ge.ge_alumno_seccion',
        'COMMIT',
        'BEGIN',
        'DELETE FROM ge.ge_alumno_seccion',
        'COMMIT',
        'BEGIN',
        'DELETE FROM ge.ge_seccion',
        'DELETE FROM ge.ge_corte',
        'COMMIT',
      ])
    })
  })
})
