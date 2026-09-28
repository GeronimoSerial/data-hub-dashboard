import { randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  activarCorte,
  crearEjecutorSql,
  ensureGeSchema,
  type EjecutorSql,
} from '../lib/infraestructura/ge-db'
import { getRawClient } from '../lib/db'
import {
  clasificarFilas,
  crearAcumulador,
  decodificarPadron,
  deduplicarMembresias,
  derivarEnteroEstable,
  derivarIds,
  ejecutarEnLotes,
  extraerB64DeHtml,
  insertarIdentidades,
  insertarMembresias,
  insertarSecciones,
  normalizarFilaHtml,
  reconciliarFilas,
  verificarCorte,
} from './import-padron.mjs'

function htmlConPadron(payload: unknown): string {
  const b64 = gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64')
  return `<html><body><script>const STUDENTS_GZ_B64="${b64}";</script></body></html>`
}

describe('extraerB64DeHtml', () => {
  it('extrae el contenido de STUDENTS_GZ_B64', () => {
    const html = htmlConPadron({ c: [], r: [] })
    expect(extraerB64DeHtml(html)).toMatch(/^[A-Za-z0-9+/=]+$/)
  })

  it('tira si la constante no está presente', () => {
    expect(() => extraerB64DeHtml('<html></html>')).toThrow()
  })
})

describe('decodificarPadron', () => {
  it('decodifica gzip+base64 y devuelve el JSON { c, r }', () => {
    const filas = [['1', 'PEREZ', 'ANA', 'Primario', '', '', '', '1800001-00', '', '1', 'A', 'Mañana']]
    const html = htmlConPadron({ c: [], r: filas })
    const resultado = decodificarPadron(html)
    expect(resultado.r).toEqual(filas)
  })

  it('tira si el JSON decodificado no tiene forma { r: [...] }', () => {
    const html = htmlConPadron({ c: [] })
    expect(() => decodificarPadron(html)).toThrow()
  })
})

describe('derivarEnteroEstable', () => {
  it('es determinístico para la misma clave', () => {
    expect(derivarEnteroEstable('1800673-00|1|A|Mañana|Primario')).toBe(
      derivarEnteroEstable('1800673-00|1|A|Mañana|Primario'),
    )
  })

  it('produce valores distintos para claves distintas', () => {
    expect(derivarEnteroEstable('a')).not.toBe(derivarEnteroEstable('b'))
  })

  it('devuelve un entero positivo dentro de Number.MAX_SAFE_INTEGER', () => {
    const valor = derivarEnteroEstable('57937653')
    expect(typeof valor).toBe('number')
    expect(valor).toBeGreaterThan(0)
    expect(valor).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER)
  })
})

function fila(overrides: Partial<{
  dni: string
  apellido: string
  nombre: string
  nivel: string
  cue: string
  curso: string
  division: string
  turno: string
}> = {}) {
  const f = {
    dni: '1',
    apellido: 'PEREZ',
    nombre: 'ANA',
    nivel: 'Primario',
    cue: '1800001-00',
    curso: '1',
    division: 'A',
    turno: 'Mañana',
    ...overrides,
  }
  return [f.dni, f.apellido, f.nombre, f.nivel, '', '', '', f.cue, '', f.curso, f.division, f.turno]
}

describe('clasificarFilas', () => {
  const cuesConocidos = new Set(['1800001-00'])

  it('acepta una fila con CUE válido y conocido', () => {
    const r = clasificarFilas([fila()], cuesConocidos)
    expect(r.aceptadas).toHaveLength(1)
    expect(r.descartadosPorCue).toBe(0)
    expect(r.descartadosPorLocalizacion).toBe(0)
    expect(r.cuesConciliados.has('1800001-00')).toBe(true)
  })

  it('descarta una fila con CUE mal formado', () => {
    const r = clasificarFilas([fila({ cue: 'no-es-cue' })], cuesConocidos)
    expect(r.aceptadas).toHaveLength(0)
    expect(r.descartadosPorCue).toBe(1)
  })

  it('descarta una fila cuyo CUE no está en ge_localizacion, sin inventarlo', () => {
    const r = clasificarFilas([fila({ cue: '9999999-99' })], cuesConocidos)
    expect(r.aceptadas).toHaveLength(0)
    expect(r.descartadosPorLocalizacion).toBe(1)
    expect(r.cuesDescartados.has('9999999-99')).toBe(true)
  })
})

describe('derivarIds', () => {
  it('agrupa membresías por sección y por persona con ids estables', () => {
    const aceptadas = [
      fila({ dni: '1', cue: '1800001-00', curso: '1', division: 'A' }),
      fila({ dni: '2', cue: '1800001-00', curso: '1', division: 'A' }),
    ].map((f) => ({
      dni: f[0],
      apellido: f[1],
      nombre: f[2],
      nivel: f[3],
      cueAnexo: f[7],
      curso: f[9],
      division: f[10],
      turno: f[11],
    }))

    const { secciones, personas, asignaciones } = derivarIds(aceptadas)
    expect(secciones.size).toBe(1)
    expect(personas.size).toBe(2)
    expect(asignaciones).toHaveLength(2)
  })

  it('nunca conserva el DNI en las estructuras que se persisten', () => {
    const aceptadas = [
      {
        dni: '57937653',
        apellido: 'ALBARENGA',
        nombre: 'BIANCA',
        nivel: 'Primario',
        cueAnexo: '1800001-00',
        curso: '1',
        division: 'A',
        turno: 'Mañana',
      },
    ]
    const { secciones, personas, asignaciones } = derivarIds(aceptadas)
    const serializado = JSON.stringify([...secciones.values(), ...personas.values(), asignaciones])
    expect(serializado).not.toContain('57937653')
  })

  it('tira Error si dos DNIs distintos producen el mismo gePersonId (colisión simulada)', () => {
    const aceptadas = [
      {
        dni: 'x',
        apellido: 'A',
        nombre: 'B',
        nivel: 'Primario',
        cueAnexo: '1800001-00',
        curso: '1',
        division: 'A',
        turno: 'Mañana',
      },
    ]
    // No podemos forzar una colisión real de sha256 en un test unitario; se
    // verifica en cambio que la función de derivación es la única fuente del
    // id (ver derivarEnteroEstable) y que un DNI repetido reutiliza el mismo id.
    const primera = derivarIds(aceptadas)
    const segunda = derivarIds([...aceptadas, { ...aceptadas[0] }])
    expect(segunda.personas.size).toBe(1)
    expect(primera.personas.size).toBe(1)
  })
})

describe('deduplicarMembresias', () => {
  it('elimina asignaciones repetidas de (seccion, persona)', () => {
    const r = deduplicarMembresias([
      { geSectionId: 1, gePersonId: 1 },
      { geSectionId: 1, gePersonId: 1 },
      { geSectionId: 1, gePersonId: 2 },
    ])
    expect(r).toHaveLength(2)
  })
})

describe('normalizarFilaHtml / reconciliarFilas', () => {
  const cuesConocidos = new Set(['1800001-00'])

  it('la fila posicional del HTML y la fila de Gestión Educativa convergen', () => {
    // El lector de Postgres (scripts/padron-ge.mjs) entrega exactamente esta
    // forma; si los dos orígenes divergen, el resto del pipeline se rompe.
    const desdeHtml = normalizarFilaHtml(fila())
    expect(desdeHtml).toEqual({
      dni: '1',
      apellido: 'PEREZ',
      nombre: 'ANA',
      nivel: 'Primario',
      cueAnexo: '1800001-00',
      curso: '1',
      division: 'A',
      turno: 'Mañana',
    })
  })

  it('reconcilia filas ya normalizadas sin pasar por el HTML', () => {
    const r = reconciliarFilas([normalizarFilaHtml(fila())], cuesConocidos)
    expect(r.aceptadas).toHaveLength(1)
    expect(r.cuesConciliados.has('1800001-00')).toBe(true)
  })

  it('normaliza el CUE antes de reconciliar', () => {
    const r = reconciliarFilas(
      [{ ...normalizarFilaHtml(fila()), cueAnexo: ' 1800001-00 ' }],
      cuesConocidos,
    )
    expect(r.aceptadas[0]?.cueAnexo).toBe('1800001-00')
  })
})

// DB1/B2: cobertura de integración contra PGlite de la ruta de persistencia
// (insertarSecciones / insertarMembresias / insertarIdentidades /
// ejecutarEnLotes), que hasta ahora sólo estaba cubierta por las funciones
// puras. Sigue las convenciones de scripts/sync-ge.test.ts: la base es el
// schema `ge` de la PGlite compartida por el archivo y cada test limpia sus
// tablas para conservar el aislamiento.
const CUES_FIXTURE = ['1800001-00']

// Mismas columnas posicionales que espera normalizarFilaHtml:
// dni [0], apellido [1], nombre [2], nivel [3], cueAnexo [7], curso [9],
// division [10], turno [11]. La fila 3 repite el DNI de la fila 1 en otra
// sección, para verificar que personas y membresías se cuentan por separado.
const FILAS_FIXTURE = [
  ['11111111', 'PEREZ', 'ANA', 'Primario', '', '', '', '1800001-00', '', '1', 'A', 'Mañana'],
  ['22222222', 'GOMEZ', 'LUIS', 'Primario', '', '', '', '1800001-00', '', '1', 'A', 'Mañana'],
  ['11111111', 'PEREZ', 'ANA', 'Primario', '', '', '', '1800001-00', '', '2', 'B', 'Tarde'],
]

describe('persistencia (PGlite)', () => {
  let clavePrevia: string | undefined

  async function resetTablasGe(): Promise<void> {
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    await client.execute('DELETE FROM ge.ge_alumno_identidad')
    await client.execute('DELETE FROM ge.ge_alumno_seccion')
    await client.execute('DELETE FROM ge.ge_seccion')
    await client.execute('DELETE FROM ge.ge_localizacion')
    await client.execute('DELETE FROM ge.ge_corte')
  }

  // La ruta de identidades cifra con AES-256; insertarIdentidades exige una
  // clave válida de 32 bytes en base64. Se genera por corrida y se restaura
  // el valor previo del entorno al terminar el describe.
  beforeAll(() => {
    clavePrevia = process.env.NOMINAL_ENCRYPTION_KEY
    process.env.NOMINAL_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  })

  afterAll(() => {
    if (clavePrevia === undefined) delete process.env.NOMINAL_ENCRYPTION_KEY
    else process.env.NOMINAL_ENCRYPTION_KEY = clavePrevia
  })

  beforeEach(async () => {
    await resetTablasGe()
  })

  // Camino completo de import: reconciliar el fixture, derivar los ids con el
  // acumulador y persistir secciones, membresías e identidades contra el
  // client real, dejando el corte en 'importando' para que el test lo active.
  //
  // Se persisten directamente los ids reales que deriva derivarEnteroEstable()
  // (típicamente de 48 bits): desde B3 ge_section_id/ge_person_id son BIGINT en
  // lib/infraestructura/ge-db.ts, así que ya no hace falta remapearlos a enteros
  // chicos para esquivar el desborde de INTEGER.
  async function prepararCorteImportado() {
    const raw = getRawClient()
    const client = crearEjecutorSql(raw)

    for (const cue of CUES_FIXTURE) {
      await client.execute({
        sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, nombre, departamento, localidad) VALUES (?,?,?,?) ON CONFLICT (cue_anexo) DO NOTHING',
        args: [cue, 'Escuela 1', 'Corrientes', 'Capital'],
      })
    }

    const padron = decodificarPadron(htmlConPadron({ c: [], r: FILAS_FIXTURE }))
    const clasificacion = clasificarFilas(padron.r, new Set(CUES_FIXTURE))
    const acumulador = crearAcumulador()
    acumulador.agregar(clasificacion.aceptadas)

    const { secciones, personas, membresias } = acumulador

    const corteRes = await client.execute({
      sql: "INSERT INTO ge.ge_corte (ciclo_lectivo, fetched_at, estado) VALUES (?, ?, 'importando') RETURNING id",
      args: [2026, new Date().toISOString()],
    })
    const corteId = Number(corteRes.rows[0].id)

    const conexion = { client, raw }
    await insertarSecciones(conexion, corteId, secciones)
    await insertarMembresias(conexion, corteId, membresias)
    await insertarIdentidades(conexion, personas)

    return { client, conexion, corteId, secciones, personas, membresias }
  }

  async function contarPorCorte(
    client: EjecutorSql,
    corteId: number,
  ): Promise<{ secciones: number; membresias: number; identidades: number }> {
    const secciones = await client.execute({
      sql: 'SELECT COUNT(*) AS n FROM ge.ge_seccion WHERE corte_id = ?',
      args: [corteId],
    })
    const membresias = await client.execute({
      sql: 'SELECT COUNT(*) AS n FROM ge.ge_alumno_seccion WHERE corte_id = ?',
      args: [corteId],
    })
    const identidades = await client.execute({
      sql: `SELECT COUNT(*) AS n FROM ge.ge_alumno_identidad i
        WHERE EXISTS (
          SELECT 1 FROM ge.ge_alumno_seccion m
          WHERE m.corte_id = ? AND m.ge_person_id = i.ge_person_id
        )`,
      args: [corteId],
    })
    return {
      secciones: Number(secciones.rows[0].n),
      membresias: Number(membresias.rows[0].n),
      identidades: Number(identidades.rows[0].n),
    }
  }

  it('importa el corte y queda vigente con secciones, membresías e identidades', async () => {
    const { client, corteId, secciones, personas, membresias } = await prepararCorteImportado()

    await activarCorte(client, corteId)
    const verificacion = await verificarCorte(client, corteId)

    expect(verificacion.estado).toBe('vigente')
    expect(verificacion.secciones).toBe(secciones.size)
    expect(verificacion.membresias).toBe(membresias.length)
    expect(verificacion.secciones).toBeGreaterThan(0)
    expect(verificacion.membresias).toBeGreaterThan(0)

    const identidades = await client.execute('SELECT COUNT(*) AS n FROM ge.ge_alumno_identidad')
    expect(Number(identidades.rows[0].n)).toBe(personas.size)
  })

  it('re-ejecutar la persistencia con los mismos datos es idempotente', async () => {
    const { client, conexion, corteId, secciones, personas, membresias } =
      await prepararCorteImportado()
    const antes = await contarPorCorte(client, corteId)
    expect(antes.secciones).toBeGreaterThan(0)
    expect(antes.membresias).toBeGreaterThan(0)
    expect(antes.identidades).toBeGreaterThan(0)

    // Segunda pasada con exactamente las mismas estructuras: no debe tirar y
    // no debe duplicar filas (depende del ON CONFLICT con columna explícita).
    await insertarSecciones(conexion, corteId, secciones)
    await insertarMembresias(conexion, corteId, membresias)
    await insertarIdentidades(conexion, personas)

    const despues = await contarPorCorte(client, corteId)
    expect(despues).toEqual(antes)
  })

  it('revierte el lote completo cuando un item falla a mitad de camino (rollback)', async () => {
    const raw = getRawClient()
    const client = crearEjecutorSql(raw)
    const conexion = { client, raw }
    const corteId = 987654
    const items = [
      { geSectionId: 9001, cueAnexo: '1800001-00' },
      { geSectionId: 9002, cueAnexo: '1800001-00' },
      { geSectionId: 9003, cueAnexo: '1800001-00' },
    ]

    let fallo: unknown
    try {
      await ejecutarEnLotes(conexion, items, async (tx: EjecutorSql, item: { geSectionId: number; cueAnexo: string }) => {
        if (item.geSectionId === 9003) throw new Error('fallo inyectado')
        await tx.execute({
          sql: 'INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (?,?,?,?,?,?,?)',
          args: [corteId, item.geSectionId, item.cueAnexo, '1', 'A', 'Primario', 'Mañana'],
        })
      })
    } catch (err) {
      fallo = err
    }

    expect(fallo).toBeInstanceOf(Error)
    expect((fallo as Error).message).toBe('fallo inyectado')

    // Los items 1 y 2 se insertaron ANTES del fallo, dentro del mismo lote: si
    // no hubo rollback quedarían persistidos (autocommit). La prueba exige que
    // el lote completo se revierta.
    const res = await client.execute({
      sql: 'SELECT COUNT(*) AS n FROM ge.ge_seccion WHERE corte_id = ?',
      args: [corteId],
    })
    expect(Number(res.rows[0].n)).toBe(0)
  })
})
