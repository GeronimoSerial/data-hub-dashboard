import { expect, test } from '../contratos/base'
import { normalizar } from '../contratos/normalizar'
import { DEPARTAMENTOS_ESCUELAS, ESCUELAS, ESPERADOS, verificarCoherencia } from '../seed/esperados'

// Foundation of the API contract layer: the manifest is coherent, the harness reads the same
// roster the API returns, and the normalizer is deterministic and keeps real data.

type EscuelaRespuesta = {
  cueAnexo: string
  departamento: string
  nivelJurisdiccional?: { id: number } | null
}

function contarPor<T extends string | number>(valores: readonly T[]): Record<string, number> {
  const conteo: Record<string, number> = {}
  for (const valor of valores) conteo[String(valor)] = (conteo[String(valor)] ?? 0) + 1
  return conteo
}

test('el manifiesto de valores esperados es coherente con el roster del seed', () => {
  verificarCoherencia()
})

test('el roster que devuelve la API para admin coincide con el manifiesto: 30 con coordenadas y 2 sin', async ({ apiAdmin }) => {
  const respuesta = await apiAdmin.get('/api/mapas/infraestructura/escuelas')
  expect(respuesta.status()).toBe(200)
  const cuerpo = (await respuesta.json()) as {
    escuelas: EscuelaRespuesta[]
    sinUbicacion: Array<{ cueAnexo: string }>
    totalPadron: number
  }

  expect(cuerpo.escuelas).toHaveLength(ESPERADOS.escuelas.conCoordenadas)
  expect(cuerpo.sinUbicacion).toHaveLength(ESPERADOS.escuelas.sinCoordenadas)
  expect(cuerpo.totalPadron).toBe(ESPERADOS.escuelas.total)

  const cuesSinCoordenadas = ESCUELAS.filter((e) => e.lat === null || e.lon === null).map((e) => e.cueAnexo)
  expect(cuerpo.sinUbicacion.map((e) => e.cueAnexo).sort()).toEqual([...cuesSinCoordenadas].sort())

  const porDepartamento = Object.fromEntries(
    DEPARTAMENTOS_ESCUELAS.map((d) => [d, cuerpo.escuelas.filter((e) => e.departamento === d).length]),
  )
  expect(porDepartamento).toEqual(ESPERADOS.escuelas.porDepartamentoConCoordenadas)

  const porNivel = contarPor(cuerpo.escuelas.flatMap((e) => (e.nivelJurisdiccional ? [e.nivelJurisdiccional.id] : [])))
  expect(porNivel).toEqual(
    Object.fromEntries(Object.entries(ESPERADOS.escuelas.porNivelConCoordenadas).map(([nivel, n]) => [nivel, n])),
  )
})

test('normalizar reemplaza UUID por un ordinal estable en orden de aparición', () => {
  const a = '6f9619ff-8b86-4d11-b42d-00c04fc964ff'
  const b = '3d2b1c0e-9a7f-4e6d-8c5b-1a2b3c4d5e6f'

  expect(normalizar({ z: b, y: a, x: a, lista: [{ id: a }, { id: b }] })).toEqual({
    lista: [{ id: '<uuid:1>' }, { id: '<uuid:2>' }],
    x: '<uuid:1>',
    y: '<uuid:1>',
    z: '<uuid:2>',
  })
})

test('normalizar reemplaza fechas e instantes ISO y conserva nombres, números y booleanos', () => {
  const salida = normalizar({
    creadaEn: '2026-11-12T10:15:30.123Z',
    validoHasta: '2026-11-15T10:15:30+00:00',
    fecha: '2026-11-12',
    nombre: 'ESCUELA Nº 597 "DEOLINDA H. FERNANDEZ DE MASDEU"',
    cue: '1801018-00',
    cantidad: 12,
    lat: -29.1367,
    activa: true,
    nada: null,
  })

  expect(salida).toEqual({
    creadaEn: '<fecha>',
    validoHasta: '<fecha>',
    fecha: '<fecha>',
    nombre: 'ESCUELA Nº 597 "DEOLINDA H. FERNANDEZ DE MASDEU"',
    cue: '1801018-00',
    cantidad: 12,
    lat: -29.1367,
    activa: true,
    nada: null,
  })
})

test('normalizar es determinista: dos corridas con UUID distintos dan la misma salida', () => {
  const corrida = (uuid: string) => ({ parte: { id: uuid, actualizadaEn: '2026-11-12T08:00:00Z' }, otro: uuid })

  const primera = JSON.stringify(normalizar(corrida('11111111-1111-4111-8111-111111111111')))
  const segunda = JSON.stringify(normalizar(corrida('22222222-2222-4222-8222-222222222222')))
  expect(segunda).toBe(primera)
  expect(JSON.stringify(normalizar(corrida('11111111-1111-4111-8111-111111111111')))).toBe(primera)
})

test('normalizar ordena las claves, mantiene el orden de los arreglos y ordena solo con ordenarPor', () => {
  const entrada = { b: 1, a: [{ k: 'b' }, { k: 'a' }] }

  expect(JSON.stringify(normalizar(entrada))).toBe('{"a":[{"k":"b"},{"k":"a"}],"b":1}')
  expect(normalizar(entrada, { ordenarPor: 'k' })).toEqual({ a: [{ k: 'a' }, { k: 'b' }], b: 1 })
})

test('normalizar no modifica la entrada', () => {
  const entrada = { id: '6f9619ff-8b86-4d11-b42d-00c04fc964ff', creadaEn: '2026-11-12T10:15:30Z' }
  normalizar(entrada)
  expect(entrada).toEqual({ id: '6f9619ff-8b86-4d11-b42d-00c04fc964ff', creadaEn: '2026-11-12T10:15:30Z' })
})
