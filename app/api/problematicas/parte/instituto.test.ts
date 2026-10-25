import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, getRawClient, migrarDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { infraAfectacion, infraMovimiento, infraParte } from '@/lib/db/schema'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { crearAlcanceMatricula } from '@/lib/infraestructura/alcance/matricula'
import { efectivosPorAfectacion, leerScopeInstituto } from '@/lib/infraestructura/parte/instituto-alcance'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { GET, POST } from './route'

// Institutos superiores (matrícula): alcance por carrera y alumno, servicio por
// carrera y equivalencia de afectaciones. Los CUE de instituto se detectan por
// su nivel jurisdiccional "Superior" en GE.

vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))

const CLAVE = claveDePrueba()

usarDbTemporal('parte-instituto-', {
  seed: false,
  env: {
    PROBLEMATICAS_ACCESO_PASSWORD: CLAVE,
    ADMIN_EMAIL: undefined,
    ADMIN_PASSWORD: undefined,
    NOMINAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  },
})

const CUE_SUP = '1801700-41'
const CUE_SUP_PARCIAL = '1801700-42'
const CUE_OTRO_INSTITUTO = '1801700-44'
const CUE_GE = '1801700-45'
const CUE_SIN_CARRERAS = '1801700-46'
const CUE_CORTE = '1801700-47'

const id: Record<string, number> = {}
const alumno: Record<string, number> = {}

beforeAll(async () => {
  await migrarDb()
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(`INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES
    (4, 'Dirección de Nivel Superior'), (1, 'Dirección de Nivel Secundario')`)
  await client.execute(`INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES
    ('${CUE_SUP}', 4, 2026), ('${CUE_SUP_PARCIAL}', 4, 2026),
    ('${CUE_OTRO_INSTITUTO}', 4, 2026), ('${CUE_GE}', 1, 2026),
    ('${CUE_SIN_CARRERAS}', 4, 2026), ('${CUE_CORTE}', 4, 2026)`)
  for (const cue of [CUE_GE]) {
    await client.execute(
      `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${cue}', NULL, 'Escuela', 'ER', 'Parana')`,
    )
    await client.execute(
      `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 4510, '${cue}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
  }

  const [corte] = (await client.execute(`INSERT INTO matricula_corte (fuente, ciclo_lectivo, estado, creado_en)
    VALUES ('test-instituto', 2026, 'vigente', '2026-10-01') RETURNING id`)).rows
  id.corte = Number(corte!.id)

  // Dos carreras del CUE principal, una del CUE de otro instituto (carrera ajena).
  const carreras = await client.execute({
    sql: `INSERT INTO matricula_carrera (corte_id, cue_anexo, instituto, nombre, rm, tipo, estado, sector) VALUES
      (?, ?, 'Instituto Test', 'Tecnicatura en Sistemas', 'RM-1', 'Tecnicatura', 'ABIERTA', 'estatal'),
      (?, ?, 'Instituto Test', 'Profesorado de Historia', 'RM-2', 'Profesorado', 'ABIERTA', 'estatal'),
      (?, ?, 'Otro Instituto', 'Otra Carrera', 'RM-3', 'Profesorado', 'ABIERTA', 'estatal'),
      (?, ?, 'Instituto Test', 'Tecnicatura Parcial', 'RM-4', 'Tecnicatura', 'ABIERTA', 'estatal')
      RETURNING id`,
    args: [
      id.corte, CUE_SUP, id.corte, CUE_SUP, id.corte, CUE_OTRO_INSTITUTO, id.corte, CUE_SUP_PARCIAL,
    ],
  })
  id.tecnicatura = Number(carreras.rows[0]!.id)
  id.profesorado = Number(carreras.rows[1]!.id)
  id.otraCarrera = Number(carreras.rows[2]!.id)
  id.tecnicaturaParcial = Number(carreras.rows[3]!.id)
  // CUE_CORTE: su carrera y su alumno viven en el corte inicial (reemplazado más abajo).
  const corteCarrera = await client.execute({
    sql: `INSERT INTO matricula_carrera (corte_id, cue_anexo, instituto, nombre, rm, tipo, estado, sector)
          VALUES (?, ?, 'Instituto Corte', 'Carrera Corte A', 'RM-5', 'Tecnicatura', 'ABIERTA', 'estatal') RETURNING id`,
    args: [id.corte, CUE_CORTE],
  })
  id.carreraCorteA = Number(corteCarrera.rows[0]!.id)
  const alumnoCorte = await client.execute({
    sql: `INSERT INTO matricula_alumno (corte_id, carrera_id, apellidos, nombres, nombre_busqueda, dni_hash)
          VALUES (?, ?, 'Güemes', 'Martín', 'güemes martín', 'h-martin') RETURNING id`,
    args: [id.corte, id.carreraCorteA],
  })
  alumno.martin = Number(alumnoCorte.rows[0]!.id)

  const alumnos: Array<[string, number, string, string]> = [
    ['juana', id.tecnicatura, 'Azurduy', 'Juana'],
    ['manuel', id.tecnicatura, 'Belgrano', 'Manuel'],
    ['mariano', id.profesorado, 'Moreno', 'Mariano'],
    ['domingo', id.otraCarrera, 'Sarmiento', 'Domingo'],
    ['ana', id.tecnicaturaParcial, 'Alberdi', 'Ana'],
  ]
  for (const [clave, carreraId, apellidos, nombres] of alumnos) {
    const res = await client.execute({
      sql: `INSERT INTO matricula_alumno (corte_id, carrera_id, apellidos, nombres, nombre_busqueda, dni_hash)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [id.corte, carreraId, apellidos, nombres, `${apellidos} ${nombres}`.toLowerCase(), `h-${clave}`],
    })
    alumno[clave] = Number(res.rows[0]!.id)
  }

  await ensureSeeded()
})

beforeEach(() => {
  _resetLimitesParaTests()
})

function cookieHeader(): string {
  const { token } = crearTokenSesion()
  return `${NOMBRE_COOKIE}=${token}`
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/problematicas/parte', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader() },
    body: JSON.stringify(body),
  })
}

function getReq(cue: string): Request {
  return new Request(`http://localhost/api/problematicas/parte?cue=${encodeURIComponent(cue)}`, {
    headers: { cookie: cookieHeader() },
  })
}

function cuerpo(cue: string, extra: Record<string, unknown>) {
  return { cue, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString(), ...extra }
}

async function corteDeFilas(afectacionId: string): Promise<number[]> {
  const res = await crearEjecutorSql(getRawClient()).execute({
    sql: `SELECT DISTINCT matricula_corte_id FROM infra_afectacion_carrera WHERE afectacion_id = ?
          UNION SELECT DISTINCT matricula_corte_id FROM infra_afectacion_matricula_alumno WHERE afectacion_id = ?`,
    args: [afectacionId, afectacionId],
  })
  return res.rows.map((r) => Number(r.matricula_corte_id)).sort((a, b) => a - b)
}

async function filasCarreras(afectacionId: string): Promise<number[]> {
  const res = await crearEjecutorSql(getRawClient()).execute({
    sql: 'SELECT carrera_id FROM infra_afectacion_carrera WHERE afectacion_id = ? ORDER BY carrera_id',
    args: [afectacionId],
  })
  return res.rows.map((r) => Number(r.carrera_id))
}

async function filasAlumnos(afectacionId: string): Promise<number[]> {
  const res = await crearEjecutorSql(getRawClient()).execute({
    sql: 'SELECT alumno_id FROM infra_afectacion_matricula_alumno WHERE afectacion_id = ? ORDER BY alumno_id',
    args: [afectacionId],
  })
  return res.rows.map((r) => Number(r.alumno_id))
}

async function afectacionVigenteDe(cue: string, motivo = 'Inundación'): Promise<string> {
  const [parte] = await getDb()
    .select()
    .from(infraParte)
    .where(eq(infraParte.cueAnexo, cue))
    .limit(1)
  const [afectacion] = await getDb()
    .select()
    .from(infraAfectacion)
    .where(and(eq(infraAfectacion.parteId, parte!.id), eq(infraAfectacion.motivo, motivo)))
    .limit(1)
  return afectacion!.id
}

describe('instituto superior: alta por carreras', () => {
  it('crea una afectación con una carrera completa y la persiste en las tablas de matrícula', async () => {
    const res = await POST(
      postReq(cuerpo(CUE_SUP, {
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', carreras: [id.tecnicatura] }],
      })),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('x-request-id')).toBeTruthy()
    const afectacionId = await afectacionVigenteDe(CUE_SUP)
    expect(await filasCarreras(afectacionId)).toEqual([id.tecnicatura])
    expect(await filasAlumnos(afectacionId)).toEqual([])
    expect(await corteDeFilas(afectacionId)).toEqual([id.corte])
  })

  it('guarda sólo los alumnos elegidos dentro de la carrera', async () => {
    const res = await POST(
      postReq(cuerpo(CUE_SUP_PARCIAL, {
        afectacionesNuevas: [{
          motivo: 'Acceso interrumpido',
          severidad: 'Baja',
          carreras: [id.tecnicaturaParcial],
          alumnos: [alumno.ana],
        }],
      })),
    )
    expect(res.status).toBe(201)
    const afectacionId = await afectacionVigenteDe(CUE_SUP_PARCIAL, 'Acceso interrumpido')
    expect(await filasCarreras(afectacionId)).toEqual([id.tecnicaturaParcial])
    expect(await filasAlumnos(afectacionId)).toEqual([alumno.ana])
  })

  it('responde 400 si un instituto envía secciones', async () => {
    const res = await POST(
      postReq(cuerpo(CUE_SUP, {
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', secciones: [4510] }],
      })),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Este establecimiento informa por carreras, no por secciones')
  })

  it('responde 400 si una escuela GE envía carreras', async () => {
    const res = await POST(
      postReq(cuerpo(CUE_GE, {
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', carreras: [id.tecnicatura] }],
      })),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Este establecimiento informa por secciones')
  })

  it('GE sin secciones responde el mismo error que antes del cambio', async () => {
    const res = await POST(
      postReq(cuerpo(CUE_GE, {
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja' }],
      })),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid input: expected array, received undefined')
  })

  it('responde 400 si el instituto no tiene carreras cargadas', async () => {
    const res = await POST(
      postReq(cuerpo(CUE_SIN_CARRERAS, {
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', carreras: [id.tecnicatura] }],
      })),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No hay carreras cargadas para este establecimiento')
  })

  it('responde 400 con una carrera que no pertenece al CUE', async () => {
    const res = await POST(
      postReq(cuerpo(CUE_SUP, {
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', carreras: [id.otraCarrera] }],
      })),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Alguna de las carreras no pertenece al establecimiento indicado')
  })

  it('responde 400 con un alumno que no está en las carreras elegidas', async () => {
    const res = await POST(
      postReq(cuerpo(CUE_SUP, {
        afectacionesNuevas: [{
          motivo: 'Acceso interrumpido',
          severidad: 'Baja',
          carreras: [id.tecnicatura],
          alumnos: [alumno.mariano],
        }],
      })),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Alguno de los alumnos seleccionados no pertenece a las carreras indicadas')
  })

  it('detecta una afectación equivalente (misma carrera y alumnos) y no la duplica', async () => {
    const primera = await POST(
      postReq(cuerpo(CUE_SUP, {
        afectacionesNuevas: [{ motivo: 'Acceso interrumpido', severidad: 'Baja', carreras: [id.profesorado], alumnos: [alumno.mariano] }],
      })),
    )
    expect(primera.status).toBe(201)
    // Mismo evento con otra clave de idempotencia: el diff queda vacío y no se escribe nada.
    const repetida = await POST(
      postReq(cuerpo(CUE_SUP, {
        afectacionesNuevas: [{ motivo: 'Acceso interrumpido', severidad: 'Baja', carreras: [id.profesorado], alumnos: [alumno.mariano] }],
      })),
    )
    expect(repetida.status).toBe(409)
    const filas = await getDb().select().from(infraAfectacion).innerJoin(infraParte, eq(infraParte.id, infraAfectacion.parteId))
      .where(and(eq(infraParte.cueAnexo, CUE_SUP), eq(infraAfectacion.motivo, 'Acceso interrumpido')))
    expect(filas.length).toBe(1)
  })

  it('reintentar con la misma idempotencyKey responde 200 con el mismo movimiento', async () => {
    const body = cuerpo(CUE_SUP, {
      afectacionesNuevas: [{ motivo: 'Tormenta severa', severidad: 'Baja', carreras: [id.tecnicatura] }],
    })
    const primera = await POST(postReq(body))
    expect(primera.status).toBe(201)
    const movimientoId = (await primera.json()).movimientoId
    const reintento = await POST(postReq(body))
    expect(reintento.status).toBe(200)
    expect((await reintento.json()).movimientoId).toBe(movimientoId)
    const movimientos = await getDb().select().from(infraMovimiento).where(eq(infraMovimiento.idempotencyKey, body.idempotencyKey))
    expect(movimientos.length).toBe(1)
  })
})

describe('instituto superior: modificar y retirar', () => {
  it('modifica la severidad y retira la afectación de carrera', async () => {
    const creada = await POST(
      postReq(cuerpo(CUE_SUP, {
        afectacionesNuevas: [{ motivo: 'Sin energía o agua', severidad: 'Baja', carreras: [id.profesorado] }],
      })),
    )
    expect(creada.status).toBe(201)
    const [parte] = await getDb().select().from(infraParte).where(eq(infraParte.cueAnexo, CUE_SUP)).limit(1)
    const [afectacion] = await getDb().select().from(infraAfectacion)
      .where(and(eq(infraAfectacion.parteId, parte!.id), eq(infraAfectacion.motivo, 'Sin energía o agua'))).limit(1)

    const modificada = await POST(
      postReq(cuerpo(CUE_SUP, {
        afectacionesModificadas: [{ id: afectacion!.id, severidad: 'Media' }],
      })),
    )
    expect(modificada.status).toBe(201)
    const [tras] = await getDb().select().from(infraAfectacion).where(eq(infraAfectacion.id, afectacion!.id))
    expect(tras!.severidad).toBe('Media')

    const retirada = await POST(
      postReq(cuerpo(CUE_SUP, { afectacionesRetiradas: [afectacion!.id] })),
    )
    expect(retirada.status).toBe(201)
    const [retiradaFila] = await getDb().select().from(infraAfectacion).where(eq(infraAfectacion.id, afectacion!.id))
    expect(retiradaFila!.retiradaEn).not.toBeNull()
  })

  it('cambia las carreras de una afectación vigente', async () => {
    const creada = await POST(
      postReq(cuerpo(CUE_SUP, {
        afectacionesNuevas: [{ motivo: 'Inaccesibilidad de docentes', severidad: 'Baja', carreras: [id.tecnicatura] }],
      })),
    )
    expect(creada.status).toBe(201)
    const [parte] = await getDb().select().from(infraParte).where(eq(infraParte.cueAnexo, CUE_SUP)).limit(1)
    const [afectacion] = await getDb().select().from(infraAfectacion)
      .where(and(eq(infraAfectacion.parteId, parte!.id), eq(infraAfectacion.motivo, 'Inaccesibilidad de docentes'))).limit(1)

    const cambio = await POST(
      postReq(cuerpo(CUE_SUP, {
        afectacionesModificadas: [{ id: afectacion!.id, carreras: [id.tecnicatura, id.profesorado] }],
      })),
    )
    expect(cambio.status).toBe(201)
    expect(await filasCarreras(afectacion!.id)).toEqual([id.tecnicatura, id.profesorado].sort((a, b) => a - b))
  })
})

describe('instituto superior: interrupción por carrera', () => {
  it('una carrera suspendida deja el estado general en parcial', async () => {
    const res = await POST(
      postReq(cuerpo(CUE_SUP, {
        servicioEducativo: { estado: 'suspendido', alcance: { tipo: 'carrera', carreras: [id.tecnicatura] } },
      })),
    )
    expect(res.status).toBe(201)
    expect((await res.json()).servicio.estadoGeneral).toBe('parcial')
  })

  it('todas las carreras suspendidas dejan el estado general en suspendido', async () => {
    const res = await POST(
      postReq(cuerpo(CUE_SUP, {
        servicioEducativo: { estado: 'suspendido', alcance: { tipo: 'carrera', carreras: [id.profesorado] } },
      })),
    )
    expect(res.status).toBe(201)
    expect((await res.json()).servicio.estadoGeneral).toBe('suspendido')
  })

  it('la ficha GET responde para un instituto con interrupciones por carrera', async () => {
    const res = await GET(getReq(CUE_SUP))
    expect(res.status).toBe(200)
  })
})

describe('instituto superior: interrupción total con afectación por carreras', () => {
  it('pide confirmar la interrupción total si hay afectaciones por carreras', async () => {
    const res = await POST(postReq(cuerpo(CUE_SUP, { estadoEstablecimiento: { estado: 'evacuado' } })))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Confirme que se interrumpe todo el establecimiento')
  })
})

describe('instituto superior: cortes reemplazados', () => {
  it('no mezcla cortes: lee con el corte guardado y rechaza alumnos sin carreras sobre un corte viejo', async () => {
    const client = crearEjecutorSql(getRawClient())
    const creada = await POST(
      postReq(cuerpo(CUE_CORTE, {
        afectacionesNuevas: [{
          motivo: 'Acceso interrumpido',
          severidad: 'Baja',
          carreras: [id.carreraCorteA],
          alumnos: [alumno.martin],
        }],
      })),
    )
    expect(creada.status).toBe(201)
    const [parte] = await getDb().select().from(infraParte).where(eq(infraParte.cueAnexo, CUE_CORTE)).limit(1)
    const [afectacion] = await getDb().select().from(infraAfectacion)
      .where(and(eq(infraAfectacion.parteId, parte!.id), eq(infraAfectacion.motivo, 'Acceso interrumpido'))).limit(1)
    expect(await corteDeFilas(afectacion!.id)).toEqual([id.corte])

    // El corte inicial queda reemplazado por uno nuevo, con otra carrera y otro alumno.
    await client.execute(`UPDATE matricula_corte SET estado = 'reemplazado' WHERE id = ${id.corte}`)
    const nuevo = await client.execute(`INSERT INTO matricula_corte (fuente, ciclo_lectivo, estado, creado_en)
      VALUES ('test-reemplazo', 2026, 'vigente', '2026-11-01') RETURNING id`)
    id.corteNuevo = Number(nuevo.rows[0]!.id)
    const carreraNueva = await client.execute({
      sql: `INSERT INTO matricula_carrera (corte_id, cue_anexo, instituto, nombre, rm, tipo, estado, sector)
            VALUES (?, ?, 'Instituto Corte', 'Carrera Corte B', 'RM-6', 'Profesorado', 'ABIERTA', 'estatal') RETURNING id`,
      args: [id.corteNuevo, CUE_CORTE],
    })
    id.carreraCorteB = Number(carreraNueva.rows[0]!.id)
    const alumnoNuevo = await client.execute({
      sql: `INSERT INTO matricula_alumno (corte_id, carrera_id, apellidos, nombres, nombre_busqueda, dni_hash)
            VALUES (?, ?, 'Rivadavia', 'Bernardino', 'rivadavia bernardino', 'h-bernardino') RETURNING id`,
      args: [id.corteNuevo, id.carreraCorteB],
    })
    alumno.bernardino = Number(alumnoNuevo.rows[0]!.id)

    // Lectura con el corte guardado: miembros, nombres y totales del corte viejo.
    const scopes = await leerScopeInstituto(getDb(), [afectacion!.id])
    expect(scopes.get(afectacion!.id)?.corteId).toBe(id.corte)
    const efectivos = await efectivosPorAfectacion(client, CUE_CORTE, scopes, id.corteNuevo)
    expect([...efectivos.get(afectacion!.id)!.get(id.carreraCorteA)!]).toEqual([alumno.martin])
    const viejo = crearAlcanceMatricula(client, id.corte, CUE_CORTE)
    const identidades = await viejo.resolveIdentities([alumno.martin])
    expect(identidades).toEqual([{ miembroId: alumno.martin, nombre: 'Martín', apellido: 'Güemes' }])
    const totales = await viejo.listarCarreras()
    expect(totales.find((c) => c.id === id.carreraCorteA)?.totalAlumnos).toBe(1)

    // Cambiar alumnos sin elegir carreras sobre un corte viejo: rechazado.
    const mezcla = await POST(
      postReq(cuerpo(CUE_CORTE, {
        afectacionesModificadas: [{ id: afectacion!.id, alumnos: [alumno.martin] }],
      })),
    )
    expect(mezcla.status).toBe(400)
    expect((await mezcla.json()).error).toBe('La matrícula se actualizó: vuelva a elegir las carreras')

    // Elegir carreras de nuevo reescribe todo con el corte vigente.
    const reelegida = await POST(
      postReq(cuerpo(CUE_CORTE, {
        afectacionesModificadas: [{ id: afectacion!.id, carreras: [id.carreraCorteB], alumnos: [alumno.bernardino] }],
      })),
    )
    expect(reelegida.status).toBe(201)
    expect(await corteDeFilas(afectacion!.id)).toEqual([id.corteNuevo])
    expect(await filasCarreras(afectacion!.id)).toEqual([id.carreraCorteB])
    expect(await filasAlumnos(afectacion!.id)).toEqual([alumno.bernardino])
  })
})

// Diferencial de regresión GE: cada cuerpo inválido de un CUE que no es instituto
// responde el primer error del esquema GE original (HEAD de
// lib/infraestructura/validacion-trayectoria.ts). Los mensajes se tomaron
// ejecutando ese esquema, no de la memoria. Los dos casos con `carreras` son el
// rechazo previo al parseo en GE, a propósito.
const MENSAJE_GE_NO_CARRERAS = 'Este establecimiento informa por secciones'
const CUERPOS_GE_INVALIDOS: Array<[string, Record<string, unknown>, string]> = [
  ['falta secciones', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja' }] }, 'Invalid input: expected array, received undefined'],
  ['falta secciones con alumnos string', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', alumnos: ['x'] }] }, 'Invalid input: expected array, received undefined'],
  ['severidad invalida sin secciones', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'zzz' }] }, 'Invalid option: expected one of "Baja"|"Media"|"Alta"|"Crítica"'],
  ['secciones string', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', secciones: 'abc' }] }, 'Invalid input: expected array, received string'],
  ['secciones null', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', secciones: null }] }, 'Invalid input: expected array, received null'],
  ['secciones vacias', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', secciones: [] }] }, 'Debe incluir al menos una sección'],
  ['secciones con texto', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', secciones: [1, 'x'] }] }, 'Invalid input: expected number, received string'],
  ['clave extra y severidad invalida', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'zzz', secciones: [4510], foo: 'bar' }] }, 'Invalid option: expected one of "Baja"|"Media"|"Alta"|"Crítica"'],
  ['dos afectaciones invalidas', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja' }, { motivo: 'Inundación', severidad: 'zzz', secciones: [1] }] }, 'Invalid input: expected array, received undefined'],
  ['descripcion HTML sin secciones', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', descripcion: '<b>x</b>' }] }, 'La descripción no puede contener HTML'],
  ['motivo vacio con secciones', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: '', severidad: 'Baja', secciones: [4510] }] }, 'Motivo requerido'],
  ['falta motivo sin secciones', { ...cuerpoBaseGe(), afectacionesNuevas: [{ severidad: 'Baja' }] }, 'Invalid input: expected string, received undefined'],
  ['afectacion modificada con severidad invalida', { ...cuerpoBaseGe(), afectacionesModificadas: [{ id: 'x', severidad: 'zzz' }] }, 'Invalid option: expected one of "Baja"|"Media"|"Alta"|"Crítica"'],
  ['servicio turno sin turnos', { ...cuerpoBaseGe(), servicioEducativo: { estado: 'suspendido', alcance: { tipo: 'turno', turnos: [] } } }, 'Debe incluir al menos un turno'],
  ['cue invalido', { ...cuerpoBaseGe(), cue: 'abc', afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', secciones: [4510] }] }, 'CUE inválido'],
  ['idempotencyKey ausente', { cue: '1801700-45', rigeDesde: '2026-10-25T10:00:00.000Z', afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', secciones: [4510] }] }, 'Invalid input: expected string, received undefined'],
  ['solo carreras (GE, rechazo previo al parseo)', { ...cuerpoBaseGe(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Baja', carreras: [1] }] }, MENSAJE_GE_NO_CARRERAS],
  ['servicio carrera (GE, rechazo previo al parseo)', { ...cuerpoBaseGe(), servicioEducativo: { estado: 'suspendido', alcance: { tipo: 'carrera', carreras: [1] } } }, MENSAJE_GE_NO_CARRERAS],
]

function cuerpoBaseGe() {
  return { cue: '1801700-45', idempotencyKey: 'diferencial-1', rigeDesde: '2026-10-25T10:00:00.000Z' }
}

describe('regresión GE: primer error igual al esquema original', () => {
  it.each(CUERPOS_GE_INVALIDOS)('%s', async (_nombre, cuerpo, esperado) => {
    const res = await POST(postReq(cuerpo))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(esperado)
  })
})

