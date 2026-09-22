import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import {
  infraAfectacion,
  infraAfectacionAlumno,
  infraAfectacionSeccion,
  infraParte,
  infraServicioAlcance,
} from '@/lib/db/schema'
import { ensureGeSchema, openGeDb } from './ge-db'
import { listarPartesVigentes } from './parte-mapa'

let dir: string
let prevDataDir: string | undefined
let prevAdminEmail: string | undefined
let prevAdminPassword: string | undefined

// Corte "vigente" del fixture: 10 CUEs, cada uno con 2 secciones (mañana con
// 3 alumnos, tarde con 2 alumnos), suficiente para ejercitar servicio
// parcial (turno) y dedupe de alumnos entre afectaciones.
async function sembrarGe(): Promise<void> {
  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2026, '2026-01-01T00:00:00Z', 'vigente')",
    )
    // CUE-11 se reserva sin coordenadas (n === 11) para el test dedicado —
    // separado de CUE-1 para no chocar con la unicidad (cueAnexo, periodoId)
    // de infra_parte entre tests distintos.
    for (let n = 1; n <= 11; n++) {
      const cue = `CUE-${n}`
      await ge.execute({
        sql: 'INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES (?, NULL, ?, ?, ?, ?, ?)',
        args: [cue, `Escuela ${n}`, 'Paraná', 'Paraná', n === 11 ? null : -31.7, n === 11 ? null : -60.5],
      })
      const seccionManiana = n * 100 + 1
      const seccionTarde = n * 100 + 2
      await ge.execute({
        sql: 'INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, ?, ?, ?, ?)',
        args: [seccionManiana, cue, '1', 'A', 'PRIMARIA', 'MAÑANA'],
      })
      await ge.execute({
        sql: 'INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, ?, ?, ?, ?)',
        args: [seccionTarde, cue, '1', 'B', 'PRIMARIA', 'TARDE'],
      })
      for (let i = 0; i < 3; i++) {
        await ge.execute({
          sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
          args: [seccionManiana, seccionManiana * 1000 + i],
        })
      }
      for (let i = 0; i < 2; i++) {
        await ge.execute({
          sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
          args: [seccionTarde, seccionTarde * 1000 + i],
        })
      }
    }
  } finally {
    ge.close()
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

      const client = getDb().$client
      const original = client.execute.bind(client)
      let contador = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.execute = (async (...args: any[]) => {
        contador++
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (original as any)(...args)
      }) as typeof client.execute

      await listarPartesVigentes({ cueAnexo: 'CUE-9' })
      const queriesConUnParte = contador

      client.execute = original
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.execute = (async (...args: any[]) => {
        contador2++
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (original as any)(...args)
      }) as typeof client.execute

      await listarPartesVigentes({})
      client.execute = original

      expect(contador2).toBe(queriesConUnParte)
    })
  })
})

// Siembra en ge.sqlite lo mínimo para que un CUE nuevo tenga una sección con
// una afectación vigente: usado sólo por el guard anti N+1, que necesita
// escuelas adicionales sin tocar el fixture principal de sembrarGe().
async function sembrarGeParaCueExtra(cue: string, n: number): Promise<void> {
  const ge = openGeDb()
  try {
    const seccionId = 5000 + n
    await ge.execute({
      sql: 'INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES (?, NULL, ?, ?, ?, ?, ?)',
      args: [cue, `Escuela extra ${n}`, 'Paraná', 'Paraná', -31.7, -60.5],
    })
    await ge.execute({
      sql: 'INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ?, ?, ?, ?, ?, ?)',
      args: [seccionId, cue, '1', 'A', 'PRIMARIA', 'MAÑANA'],
    })
  } finally {
    ge.close()
  }
}
