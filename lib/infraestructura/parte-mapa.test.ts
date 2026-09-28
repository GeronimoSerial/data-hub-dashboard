import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb, getRawClient } from '@/lib/db'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import {
  infraAfectacion,
  infraAfectacionAlumno,
  infraAfectacionSeccion,
  infraParte,
  infraServicioAlcance,
} from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import { obtenerPeriodoVigente } from './parte-consulta'
import type * as ParteConsultaModule from './parte-consulta'
import { listarEscuelasMapa, listarPartesVigentes, redondearCoordenada, type FiltrosMapa } from './parte-mapa'

// Se envuelve el obtenerPeriodoVigente real (no se reemplaza): el resto de los
// tests sigue leyendo el período sembrado, y los tests de listarEscuelasMapa
// pueden forzar "sin período vigente" con mockResolvedValueOnce(null) para
// verificar que el padrón no desaparece.
vi.mock('./parte-consulta', async (importOriginal) => {
  const actual = await importOriginal<typeof ParteConsultaModule>()
  return {
    ...actual,
    obtenerPeriodoVigente: vi.fn(actual.obtenerPeriodoVigente),
  }
})

let dir: string
let prevDataDir: string | undefined
let prevAdminEmail: string | undefined
let prevAdminPassword: string | undefined

// Corte "vigente" del fixture: 10 CUEs, cada uno con 2 secciones (mañana con
// 3 alumnos, tarde con 2 alumnos), suficiente para ejercitar servicio
// parcial (turno) y dedupe de alumnos entre afectaciones.
async function sembrarGe(): Promise<void> {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2026, '2026-01-01T00:00:00Z', 'vigente')",
  )
  // CUE-11 se reserva sin coordenadas (n === 11) para el test dedicado —
  // separado de CUE-1 para no chocar con la unicidad (cueAnexo, periodoId)
  // de infra_parte entre tests distintos.
  for (let n = 1; n <= 11; n++) {
    const cue = `CUE-${n}`
    await client.execute({
      sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES (?, NULL, ?, ?, ?, ?, ?)',
      args: [cue, `Escuela ${n}`, 'Paraná', 'Paraná', n === 11 ? null : -31.7, n === 11 ? null : -60.5],
    })
    const seccionManiana = n * 100 + 1
    const seccionTarde = n * 100 + 2
    await client.execute({
      sql: 'INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, ?, ?, ?, ?)',
      args: [seccionManiana, cue, '1', 'A', 'PRIMARIA', 'MAÑANA'],
    })
    await client.execute({
      sql: 'INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, ?, ?, ?, ?)',
      args: [seccionTarde, cue, '1', 'B', 'PRIMARIA', 'TARDE'],
    })
    for (let i = 0; i < 3; i++) {
      await client.execute({
        sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
        args: [seccionManiana, seccionManiana * 1000 + i],
      })
    }
    for (let i = 0; i < 2; i++) {
      await client.execute({
        sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
        args: [seccionTarde, seccionTarde * 1000 + i],
      })
    }
  }
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'parte-mapa-'))
  prevDataDir = process.env.DATA_DIR
  prevAdminEmail = process.env.ADMIN_EMAIL
  prevAdminPassword = process.env.ADMIN_PASSWORD
  process.env.DATA_DIR = dir
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD

  await sembrarGe()
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevAdminEmail === undefined) delete process.env.ADMIN_EMAIL
  else process.env.ADMIN_EMAIL = prevAdminEmail
  if (prevAdminPassword === undefined) delete process.env.ADMIN_PASSWORD
  else process.env.ADMIN_PASSWORD = prevAdminPassword
  rmSync(dir, { recursive: true, force: true })
})

// Crea un parte "vacío" (sin afectaciones ni servicio) para el CUE indicado
// y devuelve su id, para que cada test agregue encima sólo lo que necesita.
async function crearParte(cue: string, corteId = 1): Promise<string> {
  const db = getDb()
  const id = crypto.randomUUID()
  const ahora = new Date().toISOString()
  await db.insert(infraParte).values({
    id,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo: cue,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: ahora,
    corteId,
    creadaEn: ahora,
    actualizadaEn: ahora,
  })
  return id
}

async function crearAfectacion(params: {
  parteId: string
  motivo?: string
  categoria?: 'establecimiento' | 'alumnos'
  severidad?: 'Baja' | 'Media' | 'Alta' | 'Crítica'
  descripcion?: string | null
  rigeDesde?: string
  retiradaEn?: string | null
  secciones: number[]
  alumnos?: number[]
}): Promise<string> {
  const db = getDb()
  const id = crypto.randomUUID()
  const ahora = new Date().toISOString()
  await db.insert(infraAfectacion).values({
    id,
    parteId: params.parteId,
    motivo: params.motivo ?? 'Inundación',
    categoria: params.categoria ?? 'establecimiento',
    severidad: params.severidad ?? 'Alta',
    descripcion: params.descripcion ?? null,
    rigeDesde: params.rigeDesde ?? ahora,
    creadaEn: ahora,
    retiradaEn: params.retiradaEn ?? null,
  })
  if (params.secciones.length > 0) {
    await db
      .insert(infraAfectacionSeccion)
      .values(params.secciones.map((geSectionId) => ({ afectacionId: id, geSectionId })))
  }
  if (params.alumnos && params.alumnos.length > 0) {
    await db
      .insert(infraAfectacionAlumno)
      .values(params.alumnos.map((gePersonId) => ({ afectacionId: id, gePersonId })))
  }
  return id
}

async function crearServicioAlcance(params: {
  parteId: string
  tipo: 'establecimiento' | 'turno' | 'seccion'
  referenciaId?: string | null
  estado: 'normal' | 'suspendido'
  rigeDesde?: string
}): Promise<void> {
  const db = getDb()
  const ahora = new Date().toISOString()
  await db.insert(infraServicioAlcance).values({
    id: crypto.randomUUID(),
    parteId: params.parteId,
    tipo: params.tipo,
    referenciaId: params.referenciaId ?? null,
    estado: params.estado,
    rigeDesde: params.rigeDesde ?? ahora,
    creadaEn: ahora,
    retiradaEn: null,
  })
}

describe('listarPartesVigentes', () => {
  it('filtra un departamento del GeoJSON aunque GE use mayúsculas y tildes distintas', async () => {
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    for (const [cue, departamento] of [
      ['CUE-DEP-1', 'CONCEPCION'],
      ['CUE-DEP-2', 'CONCEPCIÓN'],
    ]) {
      await client.execute({
        sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES (?, NULL, ?, ?, ?, ?, ?)',
        args: [cue, `Escuela ${cue}`, departamento, 'Otro lugar', -28, -58],
      })
      const parteId = await crearParte(cue)
      await crearAfectacion({ parteId, secciones: [] })
    }

    const { partes, indicadores } = await listarPartesVigentes({ territorio: 'Concepción' })
    expect(partes.map((parte) => parte.cueAnexo).sort()).toEqual(['CUE-DEP-1', 'CUE-DEP-2'])
    expect(indicadores.escuelas).toBe(2)
  })

  it('no incluye un parte sin afectaciones vigentes', async () => {
    await crearParte('CUE-1')

    const { partes } = await listarPartesVigentes({ cueAnexo: 'CUE-1' })
    expect(partes).toEqual([])
  })

  it('no cuenta una afectación con retiradaEn seteado', async () => {
    const parteId = await crearParte('CUE-2')
    const pasado = new Date(Date.now() - 60_000).toISOString()
    await crearAfectacion({
      parteId,
      secciones: [201],
      rigeDesde: pasado,
      retiradaEn: pasado,
    })

    const { partes } = await listarPartesVigentes({ cueAnexo: 'CUE-2' })
    expect(partes).toEqual([])
  })

  it('reporta servicio parcial cuando se suspende sólo un turno', async () => {
    const parteId = await crearParte('CUE-3')
    await crearAfectacion({ parteId, secciones: [301] })
    await crearServicioAlcance({ parteId, tipo: 'turno', referenciaId: 'MAÑANA', estado: 'suspendido' })

    const { partes } = await listarPartesVigentes({ cueAnexo: 'CUE-3' })
    expect(partes).toHaveLength(1)
    expect(partes[0].servicio).toBe('parcial')
  })

  it('trae ambas categorías cuando la escuela tiene afectaciones de las dos', async () => {
    const parteId = await crearParte('CUE-4')
    await crearAfectacion({ parteId, categoria: 'establecimiento', secciones: [401] })
    await crearAfectacion({ parteId, categoria: 'alumnos', motivo: 'Corte de ruta', secciones: [402] })

    const { partes } = await listarPartesVigentes({ cueAnexo: 'CUE-4' })
    expect(partes).toHaveLength(1)
    expect(partes[0].categorias.sort()).toEqual(['alumnos', 'establecimiento'])
  })

  it('una escuela sin coordenadas aparece con lat/lon null, sin explotar', async () => {
    const parteId = await crearParte('CUE-11')
    await crearAfectacion({ parteId, secciones: [1101] })

    const { partes } = await listarPartesVigentes({ cueAnexo: 'CUE-11' })
    expect(partes).toHaveLength(1)
    expect(partes[0].lat).toBeNull()
    expect(partes[0].lon).toBeNull()
  })

  it('cuenta una vez a un alumno alcanzado por dos afectaciones del mismo parte', async () => {
    const parteId = await crearParte('CUE-5')
    // Sección 502 (turno tarde) tiene alumnos 502000 y 502001. Ambas
    // afectaciones seleccionan al mismo alumno 502000 puntualmente.
    await crearAfectacion({ parteId, motivo: 'Inundación', secciones: [502], alumnos: [502000] })
    await crearAfectacion({ parteId, motivo: 'Anegamiento', categoria: 'alumnos', secciones: [502], alumnos: [502000] })

    const { partes } = await listarPartesVigentes({ cueAnexo: 'CUE-5' })
    expect(partes).toHaveLength(1)
    expect(partes[0].alumnosAlcanzados).toBe(1)
  })

  it('excluye una escuela cuyas afectaciones vigentes no matchean el filtro de severidad', async () => {
    const parteId = await crearParte('CUE-6')
    await crearAfectacion({ parteId, severidad: 'Baja', secciones: [601] })

    const { partes } = await listarPartesVigentes({ cueAnexo: 'CUE-6', severidad: 'Alta' })
    expect(partes).toEqual([])
  })

  it('calcula peorSeveridad según el orden de SEVERIDADES', async () => {
    const parteId = await crearParte('CUE-7')
    await crearAfectacion({ parteId, severidad: 'Baja', secciones: [701] })
    await crearAfectacion({ parteId, motivo: 'Otro motivo', severidad: 'Crítica', secciones: [702] })

    const { partes } = await listarPartesVigentes({ cueAnexo: 'CUE-7' })
    expect(partes).toHaveLength(1)
    expect(partes[0].peorSeveridad).toBe('Crítica')
  })

  it('calcula indicadores consolidados sobre el conjunto filtrado', async () => {
    const parteId = await crearParte('CUE-8')
    await crearAfectacion({ parteId, secciones: [801] })
    await crearServicioAlcance({ parteId, tipo: 'establecimiento', referenciaId: null, estado: 'suspendido' })

    const { indicadores } = await listarPartesVigentes({ cueAnexo: 'CUE-8' })
    expect(indicadores.escuelas).toBe(1)
    expect(indicadores.conServicioSuspendido).toBe(1)
    expect(indicadores.alumnosAlcanzados).toBeGreaterThan(0)
  })

  describe('guard anti N+1', () => {
    it('ejecuta el mismo número de queries con 1 parte que con 10 partes', async () => {
      // Fixture separado (CUEs 9 y 10 quedan libres del resto de los tests
      // de este archivo) para que el conteo de queries no dependa del orden
      // de ejecución de los demás `it`.
      const parteUnicoId = await crearParte('CUE-9')
      await crearAfectacion({ parteId: parteUnicoId, secciones: [901] })

      // La producción crea su propio envoltorio con
      // crearEjecutorSql(getRawClient()) en cada llamada, así que el punto de
      // intercepción compartido es el cliente crudo: todo envoltorio delega en
      // raw.query(...).
      const raw = getRawClient() as unknown as {
        query: (...args: unknown[]) => Promise<{ rows: unknown[] }>
      }
      const original = raw.query.bind(raw)
      let contador = 0
      raw.query = async (...args: unknown[]) => {
        contador++
        return original(...args)
      }

      await listarPartesVigentes({ cueAnexo: 'CUE-9' })
      const queriesConUnParte = contador

      raw.query = original
      expect(queriesConUnParte).toBeGreaterThan(0)

      // Ahora 10 partes distintos (CUE-1..CUE-10, ya sembrados en el
      // fixture de ge.sqlite), cada uno con su propia afectación vigente.
      const parteIds: string[] = []
      for (let n = 1; n <= 10; n++) {
        const cue = `CUE-Z${n}`
        await sembrarGeParaCueExtra(cue, n)
        const parteId = await crearParte(cue)
        await crearAfectacion({ parteId, secciones: [5000 + n] })
        parteIds.push(parteId)
      }

      let contador2 = 0
      raw.query = async (...args: unknown[]) => {
        contador2++
        return original(...args)
      }

      await listarPartesVigentes({})
      raw.query = original

      expect(contador2).toBe(queriesConUnParte)
    })
  })
})

// Siembra en ge.sqlite lo mínimo para que un CUE nuevo tenga una sección con
// una afectación vigente: usado sólo por el guard anti N+1, que necesita
// escuelas adicionales sin tocar el fixture principal de sembrarGe().
async function sembrarGeParaCueExtra(cue: string, n: number): Promise<void> {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  const seccionId = 5000 + n
  await client.execute({
    sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES (?, NULL, ?, ?, ?, ?, ?)',
    args: [cue, `Escuela extra ${n}`, 'Paraná', 'Paraná', -31.7, -60.5],
  })
  await client.execute({
    sql: 'INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, ?, ?, ?, ?)',
    args: [seccionId, cue, '1', 'A', 'PRIMARIA', 'MAÑANA'],
  })
}

// Siembra una escuela suelta en ge.ge_localizacion con un departamento/
// localidad ÚNICO por test, para que los asserts sobre "todo el padrón" no
// dependan de las escuelas que otros tests de este archivo ya sembraron.
async function sembrarEscuelaPadron(params: {
  cue: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
}): Promise<void> {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute({
    sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES (?, NULL, ?, ?, ?, ?, ?)',
    args: [
      params.cue,
      `Escuela ${params.cue}`,
      params.departamento,
      params.localidad,
      params.lat,
      params.lon,
    ],
  })
}

describe('listarEscuelasMapa', () => {
  it('sin afectaciones vigentes devuelve todo el padrón como sin_afectacion_reportada', async () => {
    await sembrarEscuelaPadron({ cue: 'MAPA-A-1', departamento: 'MAPA-QUIMILI', localidad: 'MAPA-QUIMILI', lat: -27.1, lon: -58.1 })
    await sembrarEscuelaPadron({ cue: 'MAPA-A-2', departamento: 'MAPA-QUIMILI', localidad: 'MAPA-QUIMILI', lat: -27.2, lon: -58.2 })
    await sembrarEscuelaPadron({ cue: 'MAPA-A-3', departamento: 'MAPA-QUIMILI', localidad: 'MAPA-QUIMILI', lat: null, lon: null })

    const { escuelas, sinUbicacion, totalPadron } = await listarEscuelasMapa({ territorio: 'MAPA-QUIMILI' })

    expect(escuelas.map((e) => e.cueAnexo).sort()).toEqual(['MAPA-A-1', 'MAPA-A-2'])
    expect(escuelas.every((e) => e.estado === 'sin_afectacion_reportada')).toBe(true)
    expect(escuelas.every((e) => e.parte === undefined)).toBe(true)
    expect(sinUbicacion).toEqual([
      { cueAnexo: 'MAPA-A-3', nombre: 'Escuela MAPA-A-3', departamento: 'MAPA-QUIMILI', localidad: 'MAPA-QUIMILI' },
    ])
    expect(totalPadron).toBe(3)
  })

  it('una escuela con afectación vigente queda afectada y trae su ParteMapa', async () => {
    await sembrarEscuelaPadron({ cue: 'MAPA-B-1', departamento: 'MAPA-AFECT', localidad: 'MAPA-AFECT', lat: -27.5, lon: -58.5 })
    const parteId = await crearParte('MAPA-B-1')
    await crearAfectacion({ parteId, motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', secciones: [101] })

    const { escuelas, sinUbicacion, totalPadron } = await listarEscuelasMapa({ cueAnexo: 'MAPA-B-1' })

    expect(sinUbicacion).toEqual([])
    expect(totalPadron).toBe(1)
    expect(escuelas).toHaveLength(1)
    const escuela = escuelas[0]
    expect(escuela.estado).toBe('afectada')
    expect(escuela.parte?.parteId).toBe(parteId)
    expect(escuela.parte?.cueAnexo).toBe('MAPA-B-1')
    expect(escuela.parte?.peorSeveridad).toBe('Alta')
    expect(escuela.parte?.categorias).toEqual(['establecimiento'])
    expect(escuela.parte?.afectaciones[0]).toMatchObject({ motivo: 'Inundación', severidad: 'Alta' })
  })

  it('una escuela sin lat/lon va a sinUbicacion aunque tenga afectación vigente', async () => {
    await sembrarEscuelaPadron({ cue: 'MAPA-C-1', departamento: 'MAPA-SINCOORD', localidad: 'MAPA-SINCOORD', lat: null, lon: null })
    const parteId = await crearParte('MAPA-C-1')
    await crearAfectacion({ parteId, secciones: [] })

    const { escuelas, sinUbicacion, totalPadron } = await listarEscuelasMapa({ cueAnexo: 'MAPA-C-1' })

    expect(escuelas).toEqual([])
    expect(sinUbicacion).toEqual([
      { cueAnexo: 'MAPA-C-1', nombre: 'Escuela MAPA-C-1', departamento: 'MAPA-SINCOORD', localidad: 'MAPA-SINCOORD' },
    ])
    expect(totalPadron).toBe(1)
  })

  it('el filtro de territorio se aplica a todo el padrón, no sólo a las afectadas', async () => {
    await sembrarEscuelaPadron({ cue: 'MAPA-D-A1', departamento: 'MAPA-DEPTO-A', localidad: 'MAPA-DEPTO-A', lat: -28.1, lon: -58.1 })
    await sembrarEscuelaPadron({ cue: 'MAPA-D-A2', departamento: 'MAPA-DEPTO-A', localidad: 'MAPA-DEPTO-A', lat: -28.2, lon: -58.2 })
    await sembrarEscuelaPadron({ cue: 'MAPA-D-B1', departamento: 'MAPA-DEPTO-B', localidad: 'MAPA-DEPTO-B', lat: -29.1, lon: -59.1 })
    const parteId = await crearParte('MAPA-D-A1')
    await crearAfectacion({ parteId, secciones: [] })

    const { escuelas, totalPadron } = await listarEscuelasMapa({ territorio: 'MAPA-DEPTO-A' })

    expect(escuelas.map((e) => e.cueAnexo).sort()).toEqual(['MAPA-D-A1', 'MAPA-D-A2'])
    expect(escuelas.find((e) => e.cueAnexo === 'MAPA-D-A1')?.estado).toBe('afectada')
    expect(escuelas.find((e) => e.cueAnexo === 'MAPA-D-A2')?.estado).toBe('sin_afectacion_reportada')
    expect(totalPadron).toBe(2)
  })

  it('un filtro de afectación que no matchea no borra la escuela: cae a sin_afectacion_reportada', async () => {
    const casos: Array<{ cue: string; filtros: FiltrosMapa }> = [
      { cue: 'MAPA-F-SEV', filtros: { cueAnexo: 'MAPA-F-SEV', severidad: 'Alta' } },
      { cue: 'MAPA-F-MOT', filtros: { cueAnexo: 'MAPA-F-MOT', motivo: 'Nevada' } },
      { cue: 'MAPA-F-CAT', filtros: { cueAnexo: 'MAPA-F-CAT', categoria: 'alumnos' } },
      { cue: 'MAPA-F-SER', filtros: { cueAnexo: 'MAPA-F-SER', servicio: 'suspendido' } },
    ]

    for (const caso of casos) {
      await sembrarEscuelaPadron({
        cue: caso.cue,
        departamento: 'MAPA-FILTRO',
        localidad: 'MAPA-FILTRO',
        lat: -30.1,
        lon: -60.1,
      })
      const parteId = await crearParte(caso.cue)
      await crearAfectacion({
        parteId,
        motivo: 'Inundación',
        categoria: 'establecimiento',
        severidad: 'Baja',
        secciones: [],
      })

      const { escuelas, totalPadron } = await listarEscuelasMapa(caso.filtros)

      expect(escuelas).toHaveLength(1)
      expect(escuelas[0].cueAnexo).toBe(caso.cue)
      expect(escuelas[0].estado).toBe('sin_afectacion_reportada')
      expect(escuelas[0].parte).toBeUndefined()
      expect(totalPadron).toBe(1)
    }
  })

  it('sin período vigente igual devuelve todo el padrón, nunca vacío', async () => {
    await sembrarEscuelaPadron({ cue: 'MAPA-G-1', departamento: 'MAPA-SINPERIODO', localidad: 'MAPA-SINPERIODO', lat: -31.1, lon: -61.1 })
    const parteId = await crearParte('MAPA-G-1')
    await crearAfectacion({ parteId, secciones: [] })

    // El parte existe, pero sin período vigente no puede contar como
    // afectación: aun así la escuela NO desaparece del padrón.
    vi.mocked(obtenerPeriodoVigente).mockResolvedValueOnce(null)

    const { escuelas, totalPadron } = await listarEscuelasMapa({ territorio: 'MAPA-SINPERIODO' })

    expect(escuelas.map((e) => e.cueAnexo)).toEqual(['MAPA-G-1'])
    expect(escuelas[0].estado).toBe('sin_afectacion_reportada')
    expect(totalPadron).toBe(1)
  })

  it('redondea lat/lon del padrón a 5 decimales y conserva los sin ubicación', async () => {
    await sembrarEscuelaPadron({
      cue: 'MAPA-H-1',
      departamento: 'MAPA-REDONDEO',
      localidad: 'MAPA-REDONDEO',
      lat: 12.345678901234567,
      lon: -54.321987654321098,
    })

    const { escuelas, sinUbicacion } = await listarEscuelasMapa({ territorio: 'MAPA-REDONDEO' })

    expect(escuelas).toHaveLength(1)
    expect(escuelas[0].lat).toBe(12.34568)
    expect(escuelas[0].lon).toBe(-54.32199)
    expect(sinUbicacion).toEqual([])
  })
})

describe('redondearCoordenada', () => {
  it('fija el valor a 5 decimales', () => {
    expect(redondearCoordenada(12.345678901234567)).toBe(12.34568)
    expect(redondearCoordenada(-54.321987654321098)).toBe(-54.32199)
    expect(redondearCoordenada(0)).toBe(0)
  })

  it('conserva null', () => {
    expect(redondearCoordenada(null)).toBeNull()
  })
})
