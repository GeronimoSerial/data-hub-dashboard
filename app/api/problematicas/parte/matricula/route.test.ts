import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db'
import { matriculaAlumno, matriculaCarrera, matriculaCorte } from '@/lib/db/schema'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { hashDni } from '@/lib/infraestructura/matricula/dni'
import { _reiniciarLimitadoresParaTests } from '@/lib/http/limitador'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type * as AccesoParte from '@/lib/infraestructura/acceso-parte'
import { GET } from './route'

// La guarda se prueba por contraseña: la sesión queda ausente para que
// 'sin cookie' sea 401 y no dependa del bypass de administrador.
vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))

// Alcance por CUE simulado: null usa la guarda real; una lista limita el acceso a esos CUE.
const acceso = vi.hoisted(() => ({ cuesAutorizados: null as string[] | null }))
vi.mock('@/lib/infraestructura/acceso-parte', async (importOriginal) => {
  const original = await importOriginal<typeof AccesoParte>()
  return {
    ...original,
    tieneAccesoAlParteParaCue: async (request: Request, cue: string) =>
      acceso.cuesAutorizados === null
        ? original.tieneAccesoAlParteParaCue(request, cue)
        : acceso.cuesAutorizados.includes(cue),
  }
})

const CUE_A = '1801605-51'
const DNI_PEREZ_ANA = '30123456'
const CUE_B = '1801605-52'

usarDbTemporal('matricula-route', {
  env: {
    PROBLEMATICAS_ACCESO_PASSWORD: claveDePrueba(),
    MATRICULA_DNI_SECRET: 'secreto-route-test',
  },
})

beforeAll(async () => {
  const db = getDb()
  const [vigente] = await db.insert(matriculaCorte).values({
    fuente: 'matricula-2026.xlsx', cicloLectivo: 2026, estado: 'vigente', creadoEn: '2026-03-01T00:00:00Z',
  }).returning({ id: matriculaCorte.id })
  const [carrera] = await db.insert(matriculaCarrera).values({
    corteId: vigente!.id, cueAnexo: CUE_A, instituto: 'Instituto Superior X', nombre: 'Tecnicatura en Sistemas',
    rm: '1234/20', tipo: 'Tecnicatura', estado: 'ABIERTA', sector: 'estatal',
  }).returning({ id: matriculaCarrera.id })
  await db.insert(matriculaAlumno).values({
    corteId: vigente!.id, carreraId: carrera!.id, apellidos: 'PEREZ', nombres: 'ANA MARIA',
    nombreBusqueda: 'perez ana maria', dniHash: hashDni(DNI_PEREZ_ANA),
  })
})

beforeEach(() => {
  _reiniciarLimitadoresParaTests()
  acceso.cuesAutorizados = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

function cookieHeader(): string {
  const { token } = crearTokenSesion()
  return `${NOMBRE_COOKIE}=${token}`
}

function getReq(params: Record<string, string>, conCookie = true, headers: Record<string, string> = {}): Request {
  const query = new URLSearchParams({ cue: CUE_A, ...params })
  return new Request(`http://localhost/api/problematicas/parte/matricula?${query}`, {
    headers: conCookie ? { cookie: cookieHeader(), ...headers } : headers,
  })
}

// Id de la carrera sembrada: la primera fila de matricula_carrera del corte vigente.
async function carreraSembrada(): Promise<number> {
  const { getRawClient } = await import('@/lib/db')
  const { crearEjecutorSql } = await import('@/lib/infraestructura/ge-db')
  const { rows } = await crearEjecutorSql(getRawClient()).execute('SELECT id FROM matricula_carrera LIMIT 1')
  return Number(rows[0]!.id)
}

describe('GET /api/problematicas/parte/matricula', () => {
  it('responde 401 sin cookie de acceso', async () => {
    const res = await GET(getReq({ carreras: '1' }, false))
    expect(res.status).toBe(401)
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('responde 400 con CUE inválido', async () => {
    const res = await GET(getReq({ cue: 'no-es-un-cue', carreras: '1' }))
    expect(res.status).toBe(400)
  })

  it('responde 400 con un DNI parcial', async () => {
    const carrera = await carreraSembrada()
    const res = await GET(getReq({ carreras: String(carrera), q: '3012' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Ingrese el DNI completo' })
  })

  it('busca por DNI completo y no expone DNI ni hash', async () => {
    const carrera = await carreraSembrada()
    const res = await GET(getReq({ carreras: String(carrera), q: '30.123.456' }))
    expect(res.status).toBe(200)
    const texto = await res.text()
    const cuerpo = JSON.parse(texto)
    expect(cuerpo.ok).toBe(true)
    expect(cuerpo.truncado).toBe(false)
    expect(cuerpo.alumnos).toEqual([
      { id: expect.any(Number), apellido: 'PEREZ', nombre: 'ANA MARIA', carreraId: carrera },
    ])
    expect(texto).not.toContain(DNI_PEREZ_ANA)
    expect(texto).not.toContain(hashDni(DNI_PEREZ_ANA))
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('busca por prefijo de nombre sin acentos', async () => {
    const carrera = await carreraSembrada()
    const res = await GET(getReq({ carreras: String(carrera), q: 'ana perez' }))
    const cuerpo = await res.json()
    expect(cuerpo.alumnos.map((alumno: { apellido: string }) => alumno.apellido)).toEqual(['PEREZ'])
  })

  it('lista alumnos sin q y devuelve truncado con limite', async () => {
    const carrera = await carreraSembrada()
    const res = await GET(getReq({ carreras: String(carrera), limite: '1' }))
    const cuerpo = await res.json()
    expect(cuerpo.alumnos).toHaveLength(1)
    expect(cuerpo.truncado).toBe(false)
  })

  it('ignora carreras de otro CUE y responde lista vacía', async () => {
    const res = await GET(getReq({ carreras: '999999', q: 'perez' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, alumnos: [], truncado: false })
  })

  it('responde 429 después de 300 pedidos por IP en el minuto', async () => {
    const carrera = await carreraSembrada()
    let ultimo: Response | null = null
    for (let i = 0; i < 301; i++) {
      ultimo = await GET(getReq({ carreras: String(carrera), q: 'perez' }))
    }
    expect(ultimo!.status).toBe(429)
    expect(ultimo!.headers.get('retry-after')).not.toBeNull()
  })

  it('incluye x-request-id en la respuesta y reutiliza el entrante válido', async () => {
    const carrera = await carreraSembrada()
    const generado = await GET(getReq({ carreras: String(carrera) }))
    expect(generado.headers.get('x-request-id')).toBeTruthy()

    const propio = await GET(getReq({ carreras: String(carrera) }, true, { 'x-request-id': 'req-matricula-1' }))
    expect(propio.headers.get('x-request-id')).toBe('req-matricula-1')
  })

  it('rechaza un CUE fuera del alcance de la sesión aunque la búsqueda sea válida', async () => {
    acceso.cuesAutorizados = [CUE_A]
    const carrera = await carreraSembrada()
    const rechazado = await GET(getReq({ cue: CUE_B, carreras: String(carrera), q: 'perez' }))
    expect(rechazado.status).toBe(401)
    expect(await rechazado.json()).toEqual({ error: 'No autorizado' })

    const permitido = await GET(getReq({ cue: CUE_A, carreras: String(carrera), q: 'perez' }))
    expect(permitido.status).toBe(200)
  })

  it('no escribe el DNI ni su hash en ninguna línea de log durante una búsqueda por DNI', async () => {
    const lineas: string[] = []
    for (const metodo of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
        lineas.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
      })
    }
    const carrera = await carreraSembrada()
    const res = await GET(getReq({ carreras: String(carrera), q: '30.123.456' }))
    expect(res.status).toBe(200)
    const emitido = lineas.join('\n')
    expect(emitido).not.toContain(DNI_PEREZ_ANA)
    expect(emitido).not.toContain('30.123.456')
    expect(emitido).not.toContain(hashDni(DNI_PEREZ_ANA))
  })

  it('responde 429 con Retry-After tras 30 búsquedas por DNI del mismo CUE', async () => {
    const carrera = await carreraSembrada()
    const advertencias: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      advertencias.push(args.map(String).join(' '))
    })
    const respuestas: Response[] = []
    for (let i = 0; i < 31; i++) {
      respuestas.push(await GET(getReq({ carreras: String(carrera), q: DNI_PEREZ_ANA })))
    }
    expect(respuestas.slice(0, 30).every((res) => res.status === 200)).toBe(true)
    const bloqueado = respuestas[30]!
    expect(bloqueado.status).toBe(429)
    expect(bloqueado.headers.get('retry-after')).not.toBeNull()
    expect(bloqueado.headers.get('cache-control')).toContain('no-store')
    expect(advertencias.some((linea) => linea.includes('rate_limited') && linea.includes(CUE_A))).toBe(true)
  })

  it('rechaza más de 50 carreras seleccionadas', async () => {
    const muchas = Array.from({ length: 51 }, (_, i) => String(i + 1)).join(',')
    const res = await GET(getReq({ carreras: muchas, q: 'perez' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Demasiadas carreras seleccionadas' })
  })
})
