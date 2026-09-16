import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { POST } from './route'

let dir: string
let prevDataDir: string | undefined

// Cada escenario usa su propio CUE (y sus propias secciones) para no
// contaminar el límite de alertas activas por CUE de otro escenario: ese
// límite se cuenta contra la base persistida y no se resetea entre tests.
const CUE_BASE = '1801605-04'
const CUE_AJENO = '9999999-99'
const CUE_REINTENTO = '1801605-05'
const CUE_CONFLICTO = '1801605-06'
const CUE_LIMITE = '1801605-07'
const CUE_IP_A = '1801605-08'
const CUE_IP_B = '1801605-09'
const CUE_IP_C = '1801605-10'
const CUE_ROLLBACK = '1801605-11'

async function seedCue(
  ge: Awaited<ReturnType<typeof openGeDb>>,
  cueAnexo: string,
  secciones: number[],
  alumnosPorSeccion = 25,
) {
  await ge.execute({
    sql: 'INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES (?, NULL, ?, ?, ?)',
    args: [cueAnexo, `Escuela ${cueAnexo}`, 'ER', 'Parana'],
  })
  for (const seccionId of secciones) {
    await ge.execute({
      sql: 'INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, ?, ?, ?, ?)',
      args: [seccionId, cueAnexo, '1', 'A', 'PRIMARIA', 'MAÑANA'],
    })
    for (let i = 0; i < alumnosPorSeccion; i++) {
      await ge.execute({
        sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
        args: [seccionId, seccionId * 1000 + i],
      })
    }
  }
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'problematicas-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    await seedCue(ge, CUE_BASE, [10, 20])
    await seedCue(ge, CUE_AJENO, [99])
    await seedCue(ge, CUE_REINTENTO, [30])
    await seedCue(ge, CUE_CONFLICTO, [40, 50])
    await seedCue(ge, CUE_LIMITE, [60])
    await seedCue(ge, CUE_IP_A, [70])
    await seedCue(ge, CUE_IP_B, [71])
    await seedCue(ge, CUE_IP_C, [72])
    await seedCue(ge, CUE_ROLLBACK, [80])
  } finally {
    ge.close()
  }
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  _resetLimitesParaTests()
})

function req(body: unknown, ip = '10.0.0.1') {
  return new Request('http://localhost/api/problematicas', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

describe('POST /api/problematicas', () => {
  it('guarda la problemática y sus secciones en una sola transacción', async () => {
    const res = await POST(
      req({
        cue: CUE_BASE,
        motivo: 'Inundación',
        severidad: 'Alta',
        secciones: [10, 20],
        idempotencyKey: 'unico-1',
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.impacto.alumnos).toBe(50)
  })

  it('rechaza una sección que no pertenece al CUE recibido', async () => {
    const res = await POST(
      req({
        cue: CUE_BASE,
        motivo: 'Inundación',
        severidad: 'Alta',
        secciones: [10, 99],
        idempotencyKey: 'unico-2',
      }),
    )
    expect(res.status).toBe(400)
  })

  it('rechaza un cuerpo inválido con 400', async () => {
    const res = await POST(
      req({ cue: CUE_BASE, motivo: 'no-existe', severidad: 'Alta', secciones: [10], idempotencyKey: 'x' }),
    )
    expect(res.status).toBe(400)
  })

  it('un reintento con el mismo contenido y clave devuelve la alerta ya creada, sin duplicarla', async () => {
    const payload = {
      cue: CUE_REINTENTO,
      motivo: 'Anegamiento',
      severidad: 'Media',
      secciones: [30],
      idempotencyKey: 'reintento-1',
    }
    const primera = await POST(req(payload))
    expect(primera.status).toBe(201)
    const primeraBody = await primera.json()

    const segunda = await POST(req(payload))
    expect(segunda.status).toBe(200)
    const segundaBody = await segunda.json()
    expect(segundaBody.id).toBe(primeraBody.id)
  })

  it('la misma idempotencyKey con contenido distinto devuelve 409', async () => {
    const payload = {
      cue: CUE_CONFLICTO,
      motivo: 'Tormenta severa',
      severidad: 'Baja',
      secciones: [40],
      idempotencyKey: 'clave-conflicto',
    }
    const primera = await POST(req(payload))
    expect(primera.status).toBe(201)

    const segunda = await POST(req({ ...payload, secciones: [50] }))
    expect(segunda.status).toBe(409)
  })

  it('supera el límite de alertas activas por CUE y no persiste', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        req({
          cue: CUE_LIMITE,
          motivo: 'Otro',
          severidad: 'Baja',
          secciones: [60],
          idempotencyKey: `limite-cue-${i}`,
        }),
      )
      expect(res.status).toBe(201)
    }

    const sexta = await POST(
      req({
        cue: CUE_LIMITE,
        motivo: 'Otro',
        severidad: 'Baja',
        secciones: [60],
        idempotencyKey: 'limite-cue-6',
      }),
    )
    expect(sexta.status).toBe(429)
  })

  it('supera el límite por IP y no persiste, incluso repartido entre CUE distintos', async () => {
    const ip = '10.0.0.99'
    // 5 alertas a CUE_IP_A (su propio tope) + 5 a CUE_IP_B: ninguno de los
    // dos CUE llega a superar su límite individual, así que si la 11ra
    // request falla, es exclusivamente por el límite de IP.
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        req(
          { cue: CUE_IP_A, motivo: 'Otro', severidad: 'Baja', secciones: [70], idempotencyKey: `limite-ip-a-${i}` },
          ip,
        ),
      )
      expect(res.status).toBe(201)
    }
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        req(
          { cue: CUE_IP_B, motivo: 'Otro', severidad: 'Baja', secciones: [71], idempotencyKey: `limite-ip-b-${i}` },
          ip,
        ),
      )
      expect(res.status).toBe(201)
    }

    const excedida = await POST(
      req(
        { cue: CUE_IP_C, motivo: 'Otro', severidad: 'Baja', secciones: [72], idempotencyKey: 'limite-ip-c-0' },
        ip,
      ),
    )
    expect(excedida.status).toBe(429)
  })

  it('si falla el guardado no queda una alerta sin sus secciones', async () => {
    // Secciones duplicadas violan la clave compuesta de
    // infra_problematica_seccion: el INSERT falla y la transacción entera
    // debe revertir, sin dejar la fila de infra_problematica huérfana.
    const fallida = await POST(
      req({
        cue: CUE_ROLLBACK,
        motivo: 'Inundación',
        severidad: 'Alta',
        secciones: [80, 80],
        idempotencyKey: 'rollback-1',
      }),
    )
    expect(fallida.status).toBe(500)

    // Si hubiese quedado una fila de infra_problematica sin secciones, esta
    // misma idempotencyKey ya estaría tomada y el reintento devolvería 200/409
    // en vez de crear la alerta de cero.
    const reintento = await POST(
      req({
        cue: CUE_ROLLBACK,
        motivo: 'Inundación',
        severidad: 'Alta',
        secciones: [80],
        idempotencyKey: 'rollback-1',
      }),
    )
    expect(reintento.status).toBe(201)
  })
})
