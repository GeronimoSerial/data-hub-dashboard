import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { cerrarEpisodio, crearEpisodio, listarEpisodios, obtenerEpisodio } from './episodios'

let dir: string
let prevDataDir: string | undefined

// Una sola base para todo el archivo: getDb() memoiza la conexión a nivel de
// módulo, así que crear un directorio nuevo por test dejaría al segundo test
// escribiendo contra un archivo que el primero ya borró (mismo patrón que
// evolucion.test.ts / ge-db.test.ts).
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'episodios-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('crearEpisodio', () => {
  it('inserta con estado abierto y los timestamps coinciden con ahora', async () => {
    const ahora = new Date('2026-03-15T12:30:00.000Z')
    const creado = await crearEpisodio(
      { periodoId: PERIODO_ENOS_2026_2027_ID, nombre: 'Episodio creado' },
      ahora,
    )

    expect(creado.estado).toBe('abierto')
    expect(creado.periodoId).toBe(PERIODO_ENOS_2026_2027_ID)
    expect(creado.nombre).toBe('Episodio creado')
    expect(creado.descripcion).toBeNull()
    expect(creado.abiertoEn).toBe(ahora.toISOString())
    expect(creado.creadaEn).toBe(ahora.toISOString())
    expect(creado.actualizadaEn).toBe(ahora.toISOString())
    expect(creado.cerradoEn).toBeNull()

    const persistido = await obtenerEpisodio(creado.id)
    expect(persistido).not.toBeNull()
    expect(persistido?.estado).toBe('abierto')
    expect(persistido?.abiertoEn).toBe(ahora.toISOString())
    expect(persistido?.cerradoEn).toBeNull()
  })
})

describe('cerrarEpisodio', () => {
  it('cierra un episodio abierto y setea cerradoEn', async () => {
    const creado = await crearEpisodio({
      periodoId: PERIODO_ENOS_2026_2027_ID,
      nombre: 'Episodio a cerrar',
    })
    const cierre = new Date('2026-04-01T09:00:00.000Z')

    const resultado = await cerrarEpisodio({ episodioId: creado.id }, cierre)
    expect(resultado).toEqual({ ok: true })

    const persistido = await obtenerEpisodio(creado.id)
    expect(persistido?.estado).toBe('cerrado')
    expect(persistido?.cerradoEn).toBe(cierre.toISOString())
    expect(persistido?.actualizadaEn).toBe(cierre.toISOString())
  })

  it('la segunda vez devuelve ya_cerrado y no pisa el cerradoEn original', async () => {
    const creado = await crearEpisodio({
      periodoId: PERIODO_ENOS_2026_2027_ID,
      nombre: 'Episodio doble cierre',
    })
    const primerCierre = new Date('2026-04-02T09:00:00.000Z')
    await cerrarEpisodio({ episodioId: creado.id }, primerCierre)

    const resultado = await cerrarEpisodio(
      { episodioId: creado.id },
      new Date('2026-04-03T10:00:00.000Z'),
    )
    expect(resultado).toEqual({ ok: false, motivo: 'ya_cerrado' })

    const persistido = await obtenerEpisodio(creado.id)
    expect(persistido?.cerradoEn).toBe(primerCierre.toISOString())
  })

  it('con un id inexistente devuelve no_existe', async () => {
    const resultado = await cerrarEpisodio({ episodioId: crypto.randomUUID() })
    expect(resultado).toEqual({ ok: false, motivo: 'no_existe' })
  })
})

describe('obtenerEpisodio', () => {
  it('devuelve null para un id inexistente', async () => {
    expect(await obtenerEpisodio(crypto.randomUUID())).toBeNull()
  })
})

describe('listarEpisodios', () => {
  it('filtra por estado correctamente', async () => {
    const abierto = await crearEpisodio({
      periodoId: PERIODO_ENOS_2026_2027_ID,
      nombre: 'Episodio abierto de listado',
    })
    const paraCerrar = await crearEpisodio({
      periodoId: PERIODO_ENOS_2026_2027_ID,
      nombre: 'Episodio cerrado de listado',
    })
    await cerrarEpisodio({ episodioId: paraCerrar.id })

    const abiertos = await listarEpisodios({ estado: 'abierto' })
    const cerrados = await listarEpisodios({ estado: 'cerrado' })

    expect(abiertos.every((e) => e.estado === 'abierto')).toBe(true)
    expect(cerrados.every((e) => e.estado === 'cerrado')).toBe(true)
    expect(abiertos.map((e) => e.id)).toContain(abierto.id)
    expect(cerrados.map((e) => e.id)).toContain(paraCerrar.id)
    expect(abiertos.map((e) => e.id)).not.toContain(paraCerrar.id)
    expect(cerrados.map((e) => e.id)).not.toContain(abierto.id)
  })

  it('ordena por abiertoEn descendente', async () => {
    const viejo = await crearEpisodio(
      { periodoId: PERIODO_ENOS_2026_2027_ID, nombre: 'Episodio viejo' },
      new Date('2026-01-01T00:00:00.000Z'),
    )
    const nuevo = await crearEpisodio(
      { periodoId: PERIODO_ENOS_2026_2027_ID, nombre: 'Episodio nuevo' },
      new Date('2026-06-01T00:00:00.000Z'),
    )

    const todos = await listarEpisodios()
    const ids = todos.map((e) => e.id)
    expect(ids.indexOf(nuevo.id)).toBeLessThan(ids.indexOf(viejo.id))

    const abiertos = await listarEpisodios({ estado: 'abierto' })
    expect(abiertos.map((e) => e.id)).toContain(viejo.id)
    expect(abiertos.map((e) => e.id)).toContain(nuevo.id)
  })
})
