import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import { listarEscuelasMapaEnriquecidas } from '@/lib/infraestructura/parte-mapa'
import { GET as radarGET } from '@/app/api/infraestructura/radar/route'
import { GET } from './route'

const { ensureSeeded, verificarAccesoLectura } = vi.hoisted(() => ({
  ensureSeeded: vi.fn(),
  verificarAccesoLectura: vi.fn(),
}))

vi.mock('@/lib/db/seed', () => ({ ensureSeeded }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura }))
vi.mock('@/lib/infraestructura/parte-mapa', () => ({ listarEscuelasMapaEnriquecidas: vi.fn() }))
vi.mock('@/app/api/infraestructura/radar/route', () => ({ GET: vi.fn() }))

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function usuario(role: SessionUser['role'], nivelJurIds: number[] = []): SessionUser {
  return { id: 'u1', role, banned: false, nivelJurIds, accesoRecursos: 'todos', recursoIds: [], cueAnexo: null }
}

function escuela(overrides: Partial<EscuelaMapaEnriquecida> & Pick<EscuelaMapaEnriquecida, 'cueAnexo' | 'nombre'>): EscuelaMapaEnriquecida {
  return {
    departamento: 'ER',
    localidad: 'Paraná',
    lat: null,
    lon: null,
    niveles: ['PRIMARIA'],
    nivelJurisdiccionalId: 4,
    nivelJurisdiccionalNombre: 'Nivel Primario',
    alumnos: 100,
    gravedad: 0,
    categoriaPrincipal: null,
    clases: 'normal',
    apoyo: null,
    sinActualizar: false,
    ultimaNovedad: null,
    alumnosSinClases: 0,
    situacionesHistoricas: 0,
    solucionadasRecientes: 0,
    ...overrides,
  }
}

const ESCUELAS = [
  escuela({ cueAnexo: '1801605-04', nombre: 'Escuela Afectada', clases: 'sin', gravedad: 3, parte: {} as EscuelaMapaEnriquecida['parte'] }),
  escuela({ cueAnexo: '1801605-05', nombre: 'Escuela Normal' }),
  escuela({ cueAnexo: '1802001-01', nombre: 'Escuela Otro Depto', departamento: 'GUALEGUAYCHU', nivelJurisdiccionalId: 9, nivelJurisdiccionalNombre: 'Nivel Medio' }),
]

function padron(escuelas: EscuelaMapaEnriquecida[]) {
  return { escuelas, sinUbicacion: [], totalPadron: escuelas.length } as unknown as Awaited<
    ReturnType<typeof listarEscuelasMapaEnriquecidas>
  >
}

function req(qs = '') {
  return new Request(`http://localhost/api/infraestructura/exportar${qs}`)
}

async function filasDelLibro(res: Response): Promise<string[]> {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await res.arrayBuffer())
  const hoja = libro.worksheets[0]
  const nombres: string[] = []
  let enTabla = false
  hoja.eachRow((fila) => {
    if (fila.getCell(1).value === 'CUE anexo') {
      enTabla = true
      return
    }
    if (enTabla && fila.getCell(2).value) nombres.push(String(fila.getCell(2).value))
  })
  return nombres
}

describe('GET /api/infraestructura/exportar', () => {
  beforeEach(() => {
    ensureSeeded.mockReset().mockResolvedValue(undefined)
    verificarAccesoLectura.mockReset().mockResolvedValue({ ok: true, user: usuario('consulta') })
    vi.mocked(listarEscuelasMapaEnriquecidas).mockReset().mockResolvedValue(padron(ESCUELAS))
    vi.mocked(radarGET).mockReset()
  })

  it('responde 401 sin sesión y no consulta escuelas', async () => {
    verificarAccesoLectura.mockResolvedValue({ ok: false, status: 401 })
    const res = await GET(req('?tipo=afectadas'))
    expect(res.status).toBe(401)
    expect(listarEscuelasMapaEnriquecidas).not.toHaveBeenCalled()
  })

  it('responde 403 a un rol sin niveles jurisdiccionales asignados', async () => {
    verificarAccesoLectura.mockResolvedValue({ ok: true, user: usuario('director_nivel', []) })
    const res = await GET(req('?tipo=afectadas'))
    expect(res.status).toBe(403)
    expect(listarEscuelasMapaEnriquecidas).not.toHaveBeenCalled()
  })

  it('responde 400 con un tipo ausente o desconocido', async () => {
    expect((await GET(req())).status).toBe(400)
    expect((await GET(req('?tipo=bajo-lluvia'))).status).toBe(400)
    expect(listarEscuelasMapaEnriquecidas).not.toHaveBeenCalled()
  })

  it('pasa el alcance del rol al listado de escuelas', async () => {
    verificarAccesoLectura.mockResolvedValue({ ok: true, user: usuario('director_nivel', [4, 9]) })
    await GET(req('?tipo=con-clases'))
    expect(listarEscuelasMapaEnriquecidas).toHaveBeenCalledWith({ nivelesJurIds: [4, 9] })
  })

  it('devuelve xlsx con el nombre del catálogo y la fecha, sin filtros, con todas las escuelas del tipo', async () => {
    const res = await GET(req('?tipo=afectadas'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(XLSX)
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="escuelas-afectadas-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    )
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await filasDelLibro(res)).toEqual(['Escuela Afectada'])
  })

  it('aplica los filtros del mapa antes de armar las filas', async () => {
    const res = await GET(req('?tipo=con-clases&departamento=GUALEGUAYCHU'))
    expect(res.status).toBe(200)
    expect(await filasDelLibro(res)).toEqual(['Escuela Otro Depto'])
  })

  it('en-riesgo carga el radar del horizonte pedido y exporta sólo las escuelas que aparecen', async () => {
    vi.mocked(radarGET).mockResolvedValue(
      Response.json({
        puntos: [
          { cueAnexo: '1801605-05', horizonteHoras: 240, nivelRiesgo: 'alto', nivelAmenaza: 'alto', nivelVulnerabilidad: 'medio', confianza: null, nivelRiesgoAcceso: null, departamento: 'ER' },
        ],
      }),
    )
    const res = await GET(req('?tipo=en-riesgo&horizonte=240'))
    expect(res.status).toBe(200)
    const [radarRequest] = vi.mocked(radarGET).mock.calls[0]
    expect(new URL(radarRequest.url).searchParams.get('horizonte')).toBe('240')
    expect(await filasDelLibro(res)).toEqual(['Escuela Normal'])
  })

  it('en-riesgo responde 500 si el radar no se puede cargar', async () => {
    vi.mocked(radarGET).mockResolvedValue(Response.json({ error: 'x' }, { status: 500 }))
    const res = await GET(req('?tipo=en-riesgo'))
    expect(res.status).toBe(500)
  })
})
