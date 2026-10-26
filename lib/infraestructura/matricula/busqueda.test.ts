import { beforeAll, describe, expect, it } from 'vitest'
import { getDb, getRawClient } from '@/lib/db'
import { matriculaAlumno, matriculaCarrera, matriculaCorte } from '@/lib/db/schema'
import { crearEjecutorSql } from '@/lib/infraestructura/ge-db'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { hashDni } from './dni'
import { buscarAlumnos, escaparLike, parsearBusqueda, type ParametrosBusqueda } from './busqueda'

const SECRETO = 'secreto-busqueda-test'
usarDbTemporal('matricula-busqueda', { env: { MATRICULA_DNI_SECRET: SECRETO } })

const CUE_A = '1801605-51'
const CUE_B = '1801605-52'

const ids: { carreraX: number; carreraY: number; carreraZ: number; carreraReemplazada: number } = {
  carreraX: 0,
  carreraY: 0,
  carreraZ: 0,
  carreraReemplazada: 0,
}

const DNI_PEREZ_ANA = '30123456'

beforeAll(async () => {
  const db = getDb()
  const [reemplazado] = await db.insert(matriculaCorte).values({
    fuente: 'matricula-2025.xlsx', cicloLectivo: 2025, estado: 'reemplazado', creadoEn: '2025-03-01T00:00:00Z',
  }).returning({ id: matriculaCorte.id })
  const [vigente] = await db.insert(matriculaCorte).values({
    fuente: 'matricula-2026.xlsx', cicloLectivo: 2026, estado: 'vigente', creadoEn: '2026-03-01T00:00:00Z',
  }).returning({ id: matriculaCorte.id })

  const carrera = async (corteId: number, cue: string, nombre: string, rm: string) => {
    const [fila] = await db.insert(matriculaCarrera).values({
      corteId, cueAnexo: cue, instituto: 'Instituto Superior X', nombre, rm,
      tipo: 'Tecnicatura', estado: 'ABIERTA', sector: 'estatal',
    }).returning({ id: matriculaCarrera.id })
    return fila!.id
  }
  ids.carreraX = await carrera(vigente!.id, CUE_A, 'Tecnicatura en Sistemas', '1234/20')
  ids.carreraY = await carrera(vigente!.id, CUE_A, 'Profesorado en Historia', '5678/20')
  ids.carreraZ = await carrera(vigente!.id, CUE_B, 'Tecnicatura en Sistemas', '1234/20')
  ids.carreraReemplazada = await carrera(reemplazado!.id, CUE_A, 'Carrera vieja', '0001/10')

  const alumno = async (corteId: number, carreraId: number, apellidos: string, nombres: string, dni: string) => {
    const busqueda = `${apellidos} ${nombres}`
      .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
    await db.insert(matriculaAlumno).values({
      corteId, carreraId, apellidos, nombres, nombreBusqueda: busqueda, dniHash: hashDni(dni),
    })
  }
  await alumno(vigente!.id, ids.carreraX, 'PEREZ', 'ANA MARIA', DNI_PEREZ_ANA)
  await alumno(vigente!.id, ids.carreraX, 'GOMEZ', 'ANA LUCIA', '32000222')
  await alumno(vigente!.id, ids.carreraX, 'MÉNDEZ', 'JOSÉ', '35987654')
  await alumno(vigente!.id, ids.carreraX, 'DE_LA CRUZ', 'MARIA', '36111222')
  await alumno(vigente!.id, ids.carreraX, 'DEXLA', 'PEREZ', '36333444')
  await alumno(vigente!.id, ids.carreraX, '%TEST', 'ROBERTO', '36555666')
  await alumno(vigente!.id, ids.carreraY, 'PEREZ', 'JUAN', '31000111')
  await alumno(vigente!.id, ids.carreraZ, 'PEREZ', 'ANA MARIA', '40999888')
  await alumno(reemplazado!.id, ids.carreraReemplazada, 'REEMPLAZADO', 'VIEJO', '41000111')
})

const ejecutor = () => crearEjecutorSql(getRawClient())

// Parámetros de búsqueda en la carrera X (CUE A). `q` pasa por el mismo parseo que la API.
function pedido(q: string | null, extra: { limite?: number; carreras?: number[] } = {}): ParametrosBusqueda {
  const base = parsearBusqueda({
    cueAnexo: CUE_A,
    carreras: (extra.carreras ?? [ids.carreraX]).join(','),
    q,
    limite: extra.limite === undefined ? null : String(extra.limite),
  })
  if (!base.ok) throw new Error(base.error)
  return base.parametros
}

async function nombresDe(params: ParametrosBusqueda): Promise<string[]> {
  const resultado = await buscarAlumnos(ejecutor(), params)
  if (resultado.sinCorte) throw new Error('sin corte')
  return resultado.alumnos.map((alumno) => `${alumno.apellido} ${alumno.nombre}`)
}

describe('parsearBusqueda', () => {
  it('acepta hasta 50 carreras y rechaza 51', () => {
    const cincuenta = Array.from({ length: 50 }, (_, i) => String(i + 1)).join(',')
    const cincuentaUna = Array.from({ length: 51 }, (_, i) => String(i + 1)).join(',')
    expect(parsearBusqueda({ cueAnexo: CUE_A, carreras: cincuenta, q: null, limite: null }).ok).toBe(true)
    expect(parsearBusqueda({ cueAnexo: CUE_A, carreras: cincuentaUna, q: null, limite: null })).toEqual({
      ok: false,
      error: 'Demasiadas carreras seleccionadas',
    })
  })

  it('rechaza un DNI parcial con el mensaje para completarlo', () => {
    expect(parsearBusqueda({ cueAnexo: CUE_A, carreras: '1', q: '3012', limite: null })).toEqual({
      ok: false,
      error: 'Ingrese el DNI completo',
    })
  })

  it('acepta un DNI con puntos y lo normaliza', () => {
    const r = parsearBusqueda({ cueAnexo: CUE_A, carreras: '1', q: '30.123.456', limite: null })
    expect(r).toMatchObject({ ok: true, parametros: { filtro: { tipo: 'dni', dni: '30123456' } } })
  })

  it('rechaza más de 9 dígitos como DNI inválido', () => {
    expect(parsearBusqueda({ cueAnexo: CUE_A, carreras: '1', q: '1234567890', limite: null }).ok).toBe(false)
  })

  it('exige al menos 2 caracteres de texto', () => {
    expect(parsearBusqueda({ cueAnexo: CUE_A, carreras: '1', q: 'a', limite: null })).toEqual({
      ok: false,
      error: 'Ingrese al menos 2 letras',
    })
  })

  it('sin q produce listado; limite por defecto 50 y tope 100', () => {
    expect(parsearBusqueda({ cueAnexo: CUE_A, carreras: '1', q: '  ', limite: null })).toMatchObject({
      ok: true, parametros: { filtro: { tipo: 'ninguno' }, limite: 50 },
    })
    expect(parsearBusqueda({ cueAnexo: CUE_A, carreras: '1', q: null, limite: '500' })).toMatchObject({
      ok: true, parametros: { limite: 100 },
    })
  })

  it('rechaza límites no numéricos y carreras vacías o no numéricas', () => {
    expect(parsearBusqueda({ cueAnexo: CUE_A, carreras: '1', q: null, limite: 'abc' }).ok).toBe(false)
    expect(parsearBusqueda({ cueAnexo: CUE_A, carreras: null, q: null, limite: null }).ok).toBe(false)
    expect(parsearBusqueda({ cueAnexo: CUE_A, carreras: '1,x', q: null, limite: null }).ok).toBe(false)
  })
})

describe('escaparLike', () => {
  it('escapa los comodines de LIKE y el propio escape', () => {
    expect(escaparLike('a%b_c!d')).toBe('a!%b!_c!!d')
  })
})

describe('buscarAlumnos', () => {
  it('busca por DNI exacto, con o sin puntos', async () => {
    expect(await nombresDe(pedido('30.123.456'))).toEqual(['PEREZ ANA MARIA'])
  })

  it('no encuentra un DNI que pertenece a un corte reemplazado', async () => {
    const r = await buscarAlumnos(ejecutor(), pedido('41000111'))
    expect(r).toEqual({ sinCorte: false, alumnos: [], truncado: false })
  })

  it('encuentra por prefijo de apellido o de cualquier palabra', async () => {
    expect(await nombresDe(pedido('per'))).toEqual(['DEXLA PEREZ', 'PEREZ ANA MARIA'])
  })

  it('es independiente del orden de las palabras', async () => {
    const a = await nombresDe(pedido('perez ana'))
    const b = await nombresDe(pedido('ana perez'))
    expect(a).toEqual(['PEREZ ANA MARIA'])
    expect(b).toEqual(a)
  })

  it('es insensible a acentos', async () => {
    expect(await nombresDe(pedido('mendez jose'))).toEqual(['MÉNDEZ JOSÉ'])
    expect(await nombresDe(pedido('MÉNDEZ'))).toEqual(['MÉNDEZ JOSÉ'])
  })

  it('trata % y _ como texto literal', async () => {
    expect(await nombresDe(pedido('de_la'))).toEqual(['DE_LA CRUZ MARIA'])
    expect(await nombresDe(pedido('%t'))).toEqual(['%TEST ROBERTO'])
  })

  it('excluye carreras de otro CUE aunque se pidan por id', async () => {
    const r = await buscarAlumnos(ejecutor(), pedido('perez ana', { carreras: [ids.carreraZ] }))
    expect(r).toEqual({ sinCorte: false, alumnos: [], truncado: false })
  })

  it('no devuelve alumnos del corte reemplazado', async () => {
    expect(await nombresDe(pedido('reemplazado'))).toEqual([])
  })

  it('sin texto lista los alumnos de las carreras seleccionadas ordenados por apellido y nombre', async () => {
    const lista = await nombresDe(pedido(null, { carreras: [ids.carreraX, ids.carreraY] }))
    expect(lista).toHaveLength(7)
    expect(lista).not.toContain('REEMPLAZADO VIEJO')
    const posicion = (nombre: string) => lista.indexOf(nombre)
    expect(posicion('GOMEZ ANA LUCIA')).toBeLessThan(posicion('PEREZ ANA MARIA'))
    expect(posicion('PEREZ ANA MARIA')).toBeLessThan(posicion('PEREZ JUAN'))
  })

  it('marca truncado cuando hay más resultados que el límite', async () => {
    const dosPorPagina = await buscarAlumnos(ejecutor(), pedido(null, { limite: 2 }))
    expect(dosPorPagina).toMatchObject({ sinCorte: false, truncado: true })
    if (dosPorPagina.sinCorte) throw new Error('sin corte')
    expect(dosPorPagina.alumnos).toHaveLength(2)

    const todos = await buscarAlumnos(ejecutor(), pedido(null, { limite: 100 }))
    expect(todos).toMatchObject({ truncado: false })
  })

  it('la respuesta solo expone id, apellido, nombre y carreraId', async () => {
    const r = await buscarAlumnos(ejecutor(), pedido('perez ana'))
    if (r.sinCorte) throw new Error('sin corte')
    expect(r.alumnos).toHaveLength(1)
    for (const alumno of r.alumnos) {
      expect(Object.keys(alumno).sort()).toEqual(['apellido', 'carreraId', 'id', 'nombre'])
      expect(JSON.stringify(alumno)).not.toContain(DNI_PEREZ_ANA)
      expect(JSON.stringify(alumno)).not.toContain(hashDni(DNI_PEREZ_ANA))
    }
  })
})
