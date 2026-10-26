import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { crearEjecutorSql, ensureGeSchema } from '../lib/infraestructura/ge-db'
import { getRawClient } from '../lib/db'
import {
  correrImport,
  crearDerivador,
  normalizarFilaHtml,
  parsearArgumentos,
  persistirLote,
  sanearError,
  TIPO_JOB_PADRON,
} from './import-padron.mjs'

const CUE = '1800001-00'
const FILAS = [
  ['11111111', 'PEREZ', 'ANA', 'Primario', '', '', '', CUE, '', '1', 'A', 'Mañana'],
  ['22222222', 'GOMEZ', 'LUIS', 'Primario', '', '', '', CUE, '', '1', 'A', 'Mañana'],
  ['11111111', 'PEREZ', 'ANA', 'Primario', '', '', '', CUE, '', '2', 'B', 'Tarde'],
  ['33333333', 'DIAZ', 'EVA', 'Primario', '', '', '', '9999999-00', '', '1', 'A', 'Mañana'],
]

function aceptadas(filas = FILAS) {
  return filas.map(normalizarFilaHtml).filter((f) => f.cueAnexo === CUE)
}

describe('parsearArgumentos', () => {
  it('distingue modos y valida --conservar', () => {
    expect(parsearArgumentos(['--ge', '--ciclo', '2026'])).toMatchObject({ modo: 'ge', ciclo: '2026', forzar: false })
    expect(parsearArgumentos(['--mantenimiento', '--dry-run', '--conservar', '3'])).toMatchObject({
      modo: 'mantenimiento',
      dryRun: true,
      conservar: 3,
    })
    expect(parsearArgumentos(['/tmp/padron.html', '--forzar'])).toMatchObject({ modo: 'html', rutaHtml: '/tmp/padron.html', forzar: true })
    expect(() => parsearArgumentos(['--ge', '--conservar', 'x'])).toThrow('--conservar')
    expect(() => parsearArgumentos([])).toThrow('Uso')
  })
})

describe('sanearError', () => {
  it('redacta URLs de conexión, contraseñas y números largos, y trunca', () => {
    const msg = sanearError(new Error('connect postgres://u:secreta@10.0.0.1:5432/db failed password=abc; dni 12345678'))
    expect(msg).not.toContain('secreta')
    expect(msg).not.toContain('abc')
    expect(msg).not.toContain('12345678')
    expect(sanearError('x'.repeat(2000))).toHaveLength(500)
  })
})

describe('crearDerivador', () => {
  it('devuelve sólo lo nuevo de cada lote y deduplica membresías', () => {
    const d = crearDerivador()
    const a = d.derivar(aceptadas().slice(0, 2))
    expect(a.seccionesNuevas.size).toBe(1)
    expect(a.personasNuevas.size).toBe(2)
    expect(a.membresias).toHaveLength(2)

    const b = d.derivar(aceptadas())
    expect(b.seccionesNuevas.size).toBe(1) // sólo 2B
    expect(b.personasNuevas.size).toBe(0)
    expect(b.membresias).toHaveLength(3) // las repetidas las absorbe ON CONFLICT
    expect(d.secciones).toBe(2)
    expect(d.personas).toBe(2)
  })

  it('no retiene documentos ni nombres en su estado', () => {
    const d = crearDerivador()
    d.derivar(aceptadas())
    expect(JSON.stringify([d.secciones, d.personas])).not.toContain('11111111')
  })
})

type Llamada = { fn: string; params: Record<string, unknown> }

function jobRunFalso(opciones: { adquirido?: boolean } = {}) {
  const llamadas: Llamada[] = []
  return {
    llamadas,
    jobRun: {
      async adquirirLease(params: Record<string, unknown>) {
        llamadas.push({ fn: 'adquirir', params })
        return opciones.adquirido === false
          ? { adquirido: false, motivo: 'ya_completado' }
          : { adquirido: true, jobRunId: 'job-1', leaseOwner: 'owner-1' }
      },
      async renovarLease(params: Record<string, unknown>) {
        llamadas.push({ fn: 'renovar', params })
        return true
      },
      async publicarResultado(params: Record<string, unknown>) {
        llamadas.push({ fn: 'publicar', params })
        return true
      },
    },
  }
}

describe('correrImport (PGlite, origen HTML)', () => {
  let dir: string
  let clavePrevia: string | undefined
  const client = () => crearEjecutorSql(getRawClient())

  function escribirHtml(filas: unknown[]) {
    const b64 = gzipSync(Buffer.from(JSON.stringify({ c: [], r: filas }))).toString('base64')
    const ruta = join(dir, `padron-${Math.random()}.html`)
    writeFileSync(ruta, `<script>const STUDENTS_GZ_B64="${b64}";</script>`)
    return ruta
  }

  function conexion() {
    const raw = getRawClient()
    return { client: crearEjecutorSql(raw), raw, cuesConocidos: new Set([CUE]) }
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'padron-job-'))
    clavePrevia = process.env.NOMINAL_ENCRYPTION_KEY
    process.env.NOMINAL_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
    if (clavePrevia === undefined) delete process.env.NOMINAL_ENCRYPTION_KEY
    else process.env.NOMINAL_ENCRYPTION_KEY = clavePrevia
  })

  beforeEach(async () => {
    const c = client()
    await ensureGeSchema(c)
    for (const t of ['ge_alumno_identidad', 'ge_alumno_seccion', 'ge_seccion', 'ge_localizacion', 'ge_corte']) {
      await c.execute(`DELETE FROM ge.${t}`)
    }
    await c.execute({
      sql: "INSERT INTO ge.ge_localizacion (cue_anexo, nombre, departamento, localidad) VALUES (?, 'E1', 'Capital', 'Capital')",
      args: [CUE],
    })
  })

  it('persistirLote es idempotente por corte (ON CONFLICT) y no duplica identidades', async () => {
    const c = conexion()
    const corte = await c.client.execute(
      "INSERT INTO ge.ge_corte (ciclo_lectivo, fetched_at, estado) VALUES (2026, '2026-10-24T00:00:00Z', 'importando') RETURNING id",
    )
    const corteId = Number(corte.rows[0].id)
    const primero = await persistirLote(c, corteId, crearDerivador(), aceptadas())
    const segundo = await persistirLote(c, corteId, crearDerivador(), aceptadas())
    expect(primero).toEqual({ secciones: 2, membresias: 3, identidadesNuevas: 2 })
    expect(segundo.identidadesNuevas).toBe(0)
    const n = await c.client.execute({ sql: 'SELECT COUNT(*) AS n FROM ge.ge_alumno_seccion WHERE corte_id = ?', args: [corteId] })
    expect(Number(n.rows[0].n)).toBe(3)
  })

  it('importa, activa, limpia huérfanos viejos, rota y publica completado con contadores', async () => {
    const c = client()
    // Huérfano de un import muerto hace días y dos históricos viejos.
    for (const [id, estado, fecha] of [
      [101, 'importando', '2026-09-17T01:20:56Z'],
      [102, 'historico', '2026-09-01T00:00:00Z'],
      [103, 'vigente', '2026-09-02T00:00:00Z'],
    ] as const) {
      await c.execute({
        sql: 'INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (?, 2026, ?, ?)',
        args: [id, fecha, estado],
      })
    }
    const f = jobRunFalso()
    const r = (await correrImport(
      { modo: 'html', rutaHtml: escribirHtml(FILAS), ciclo: '2026', forzar: false, conservar: 0 },
      conexion(),
      { jobRun: f.jobRun, ahora: new Date('2026-10-24T08:30:00Z'), version: 'test' },
    )) as { ejecutado: boolean; membresias: number; corteId: number }
    expect(r.ejecutado).toBe(true)
    expect(r.membresias).toBe(3)
    const estados = await c.execute('SELECT id, estado FROM ge.ge_corte ORDER BY id')
    // 101 (huérfano) y 102, 103 (históricos con N=0) borrados; sólo queda el nuevo.
    expect(estados.rows.map((x) => x.estado)).toEqual(['vigente'])
    expect(Number(estados.rows[0].id)).toBe(r.corteId)

    const adquirir = f.llamadas.find((l) => l.fn === 'adquirir')!
    expect(adquirir.params).toMatchObject({ tipo: TIPO_JOB_PADRON, claveIdempotente: '2026:2026-10-24' })
    const publicar = f.llamadas.find((l) => l.fn === 'publicar')!
    expect(publicar.params).toMatchObject({ estado: 'completado', jobRunId: 'job-1', leaseOwner: 'owner-1' })
    expect((publicar.params.contadores as Record<string, number>).cortesEliminados).toBe(3)
  })

  it('si falla después de crear el corte, lo borra y publica fallido saneado', async () => {
    const f = jobRunFalso()
    // Ninguna fila conciliable: el origen "no devolvió alumnos".
    const ruta = escribirHtml([FILAS[3]])
    await expect(
      correrImport({ modo: 'html', rutaHtml: ruta, ciclo: '2026', forzar: true }, conexion(), { jobRun: f.jobRun }),
    ).rejects.toThrow('no devolvió alumnos')
    const cortes = await client().execute('SELECT COUNT(*) AS n FROM ge.ge_corte')
    expect(Number(cortes.rows[0].n)).toBe(0)
    const publicar = f.llamadas.find((l) => l.fn === 'publicar')!
    expect(publicar.params.estado).toBe('fallido')
    expect(String(publicar.params.errorSaneado)).toContain('no devolvió alumnos')
  })

  it('no activa un corte nuevo mucho más chico que el vigente', async () => {
    const c = client()
    await c.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (50, 2026, '2026-10-01T00:00:00Z', 'vigente')",
    )
    await c.execute(
      "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (50, 1, '1800001-00', '1', 'A', 'PRIMARIA', 'MAÑANA')",
    )
    await c.execute('INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) SELECT 50, 1, g FROM generate_series(1, 100) g')
    const f = jobRunFalso()
    await expect(
      correrImport({ modo: 'html', rutaHtml: escribirHtml(FILAS), ciclo: '2026', forzar: true }, conexion(), { jobRun: f.jobRun }),
    ).rejects.toThrow('no se activa')
    const estados = await c.execute('SELECT id, estado FROM ge.ge_corte ORDER BY id')
    expect(estados.rows.map((x) => `${x.id}:${x.estado}`)).toEqual(['50:vigente'])
  })

  it('si no obtiene el lease no toca la base', async () => {
    const f = jobRunFalso({ adquirido: false })
    const r = await correrImport(
      { modo: 'html', rutaHtml: escribirHtml(FILAS), ciclo: '2026', forzar: false },
      conexion(),
      { jobRun: f.jobRun },
    )
    expect(r).toEqual({ ejecutado: false, motivo: 'ya_completado' })
    const cortes = await client().execute('SELECT COUNT(*) AS n FROM ge.ge_corte')
    expect(Number(cortes.rows[0].n)).toBe(0)
  })
})
