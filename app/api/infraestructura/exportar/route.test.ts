import ExcelJS from 'exceljs'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import { listarEscuelasMapaEnriquecidas } from '@/lib/infraestructura/parte-mapa'
import { GET as radarGET } from '@/app/api/infraestructura/radar/route'
import { GET } from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { invalidarCacheExportaciones } from '@/lib/exportaciones/consulta'
import * as exportacionesEscuelas from '@/lib/exportaciones/escuelas'

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

// Radar que marca en riesgo a la escuela normal (ER) y a la de GUALEGUAYCHU.
const PUNTOS_RADAR = [
  { cueAnexo: '1801605-05', horizonteHoras: 240, nivelRiesgo: 'alto', nivelAmenaza: 'alto', nivelVulnerabilidad: 'medio', confianza: null, nivelRiesgoAcceso: null, departamento: 'ER' },
  { cueAnexo: '1802001-01', horizonteHoras: 240, nivelRiesgo: 'alto', nivelAmenaza: 'alto', nivelVulnerabilidad: 'medio', confianza: null, nivelRiesgoAcceso: null, departamento: 'GUALEGUAYCHU' },
]

function padron(escuelas: EscuelaMapaEnriquecida[]) {
  return { escuelas, sinUbicacion: [], totalPadron: escuelas.length } as unknown as Awaited<
    ReturnType<typeof listarEscuelasMapaEnriquecidas>
  >
}

function req(qs = '') {
  return new Request(`http://localhost/api/infraestructura/exportar${qs}`)
}

async function hojaDeTabla(res: Response) {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await res.arrayBuffer())
  const hoja = libro.worksheets[0]
  const encabezados: string[] = []
  const nombres: string[] = []
  let enTabla = false
  hoja.eachRow((fila) => {
    if (fila.getCell(1).value === 'CUE anexo') {
      enTabla = true
      fila.eachCell((celda) => encabezados.push(String(celda.value)))
      return
    }
    if (enTabla && fila.getCell(2).value) nombres.push(String(fila.getCell(2).value))
  })
  return { encabezados, nombres }
}

async function filasDelLibro(res: Response): Promise<string[]> {
  return (await hojaDeTabla(res)).nombres
}

usarDbTemporal('exportar-route-', { seed: false })
beforeAll(async () => {
  const { migrarDb } = await import('@/lib/db')
  await migrarDb()
})

describe('GET /api/infraestructura/exportar', () => {
  beforeEach(() => {
    invalidarCacheExportaciones()
    ensureSeeded.mockReset().mockResolvedValue(undefined)
    verificarAccesoLectura.mockReset().mockResolvedValue({ ok: true, user: usuario('consulta') })
    vi.mocked(listarEscuelasMapaEnriquecidas).mockReset().mockResolvedValue(padron(ESCUELAS))
    vi.mocked(radarGET).mockReset().mockImplementation(async () => Response.json({ puntos: PUNTOS_RADAR }))
  })

  it('responde 401 sin sesión y no consulta escuelas', async () => {
    verificarAccesoLectura.mockResolvedValue({ ok: false, status: 401 })
    const res = await GET(req('?estado=afectadas'))
    expect(res.status).toBe(401)
    expect(listarEscuelasMapaEnriquecidas).not.toHaveBeenCalled()
    expect(ensureSeeded).not.toHaveBeenCalled()
  })

  it('responde 403 a un rol sin niveles jurisdiccionales asignados', async () => {
    verificarAccesoLectura.mockResolvedValue({ ok: true, user: usuario('director_nivel', []) })
    const res = await GET(req('?estado=afectadas'))
    expect(res.status).toBe(403)
    expect(listarEscuelasMapaEnriquecidas).not.toHaveBeenCalled()
  })

  it('responde 400 con un estado desconocido', async () => {
    expect((await GET(req('?estado=bajo-lluvia'))).status).toBe(400)
    expect(listarEscuelasMapaEnriquecidas).not.toHaveBeenCalled()
  })

  it('pasa el alcance del rol al listado de escuelas', async () => {
    verificarAccesoLectura.mockResolvedValue({ ok: true, user: usuario('director_nivel', [4, 9]) })
    await GET(req('?estado=con-clases'))
    expect(listarEscuelasMapaEnriquecidas).toHaveBeenCalledWith({ nivelesJurIds: [4, 9] })
  })

  it('devuelve xlsx con el nombre del estado y la fecha', async () => {
    const res = await GET(req('?estado=afectadas'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(XLSX)
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="escuelas-afectadas-\d{4}-\d{2}-\d{2}\.xlsx"; filename\*=UTF-8''escuelas-afectadas-\d{4}-\d{2}-\d{2}\.xlsx$/,
    )
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await filasDelLibro(res)).toEqual(['Escuela Afectada'])
  })

  it('sin estado exporta todas las escuelas con columnas base, gravedad, clases y asistencia, sin radar', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toMatch(/filename="escuelas-\d{4}-\d{2}-\d{2}\.xlsx"/)
    const { encabezados, nombres } = await hojaDeTabla(res)
    expect(nombres).toEqual(['Escuela Afectada', 'Escuela Normal', 'Escuela Otro Depto'])
    expect(encabezados).toEqual([
      'CUE anexo', 'Escuela', 'Departamento', 'Localidad', 'Dirección', 'Niveles', 'Matrícula',
      'Gravedad', 'Estado de clases', 'Asistencia pedagógica',
    ])
    expect(radarGET).not.toHaveBeenCalled()
  })

  it('combina estados en unión y los filtros del mapa en intersección', async () => {
    const res = await GET(req('?estado=afectadas&estado=en-riesgo&horizonte=240'))
    expect(await filasDelLibro(res)).toEqual(['Escuela Afectada', 'Escuela Normal', 'Escuela Otro Depto'])

    const conDepto = await GET(req('?estado=afectadas&estado=en-riesgo&horizonte=240&departamento=GUALEGUAYCHU'))
    expect(await filasDelLibro(conDepto)).toEqual(['Escuela Otro Depto'])
  })

  it('une las columnas extra de los estados seleccionados sin duplicados', async () => {
    const res = await GET(req('?estado=afectadas,en-riesgo&estado=con-clases'))
    const { encabezados } = await hojaDeTabla(res)
    expect(encabezados).toEqual([
      'CUE anexo', 'Escuela', 'Departamento', 'Localidad', 'Dirección', 'Niveles', 'Matrícula',
      'Gravedad', 'Categoría principal', 'Última novedad', 'Nivel de riesgo',
    ])
  })

  it('en-riesgo carga el radar del horizonte pedido y exporta sólo las escuelas que aparecen', async () => {
    vi.mocked(radarGET).mockResolvedValue(Response.json({ puntos: [PUNTOS_RADAR[0]] }))
    const res = await GET(req('?estado=en-riesgo&horizonte=240'))
    expect(res.status).toBe(200)
    const [radarRequest] = vi.mocked(radarGET).mock.calls[0]
    expect(new URL(radarRequest.url).searchParams.get('horizonte')).toBe('240')
    expect(await filasDelLibro(res)).toEqual(['Escuela Normal'])
  })

  it('carga el radar con horizonte 72 cuando en-riesgo se pide sin horizonte', async () => {
    await GET(req('?estado=en-riesgo'))
    const [radarRequest] = vi.mocked(radarGET).mock.calls[0]
    expect(new URL(radarRequest.url).searchParams.get('horizonte')).toBe('72')
  })

  it('en-riesgo responde 500 si el radar no se puede cargar', async () => {
    vi.mocked(radarGET).mockResolvedValue(Response.json({ error: 'x' }, { status: 500 }))
    const res = await GET(req('?estado=en-riesgo'))
    expect(res.status).toBe(500)
  })

  it('con sólo horizonte carga el radar y agrega la columna de nivel de riesgo', async () => {
    const res = await GET(req('?estado=sin-clases&horizonte=240'))
    expect(radarGET).toHaveBeenCalled()
    const { encabezados } = await hojaDeTabla(res)
    expect(encabezados).toContain('Nivel de riesgo')
  })

  it('formato=json devuelve total, columnas y filas con los mismos filtros', async () => {
    const res = await GET(req('?formato=json&estado=afectadas&estado=en-riesgo&horizonte=240&departamento=GUALEGUAYCHU'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/)
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
    const cuerpo = await res.json()
    expect(cuerpo.total).toBe(1)
    expect(cuerpo.columnas.map((c: { clave: string }) => c.clave)).toEqual([
      'cue', 'escuela', 'departamento', 'localidad', 'direccion', 'niveles', 'matricula',
      'gravedad', 'categoria', 'ultimaNovedad', 'nivelRiesgo',
    ])
    expect(cuerpo.filas).toHaveLength(1)
    expect(cuerpo.filas[0]).toMatchObject({ cue: '1802001-01', escuela: 'Escuela Otro Depto', nivelRiesgo: 'Alto' })
  })

  it('formato=json pagina de a 25 y permite llegar a las últimas filas', async () => {
    const muchas = Array.from({ length: 205 }, (_, i) =>
      escuela({ cueAnexo: `X-${i}`, nombre: `Escuela ${String(i).padStart(3, '0')}`, clases: 'sin' }),
    )
    vi.mocked(listarEscuelasMapaEnriquecidas).mockResolvedValue(padron(muchas))
    const cuerpo = await (await GET(req('?formato=json&estado=sin-clases'))).json()
    expect(cuerpo.total).toBe(205)
    expect(cuerpo).toMatchObject({ pagina: 1, tamanoPagina: 25, totalPaginas: 9 })
    expect(cuerpo.filas).toHaveLength(25)
    const ultima = await (await GET(req('?formato=json&estado=sin-clases&pagina=9'))).json()
    expect(ultima.filas).toHaveLength(5)
    expect(ultima.filas[0].cue).toBe('X-200')
    expect(listarEscuelasMapaEnriquecidas).toHaveBeenCalledTimes(1)
  })

  it('ordena todo el resultado antes de paginar y conserva el orden al descargar', async () => {
    vi.mocked(listarEscuelasMapaEnriquecidas).mockResolvedValue(padron([
      escuela({ cueAnexo: 'a', nombre: 'A', alumnos: 1 }),
      escuela({ cueAnexo: 'b', nombre: 'B', alumnos: 20 }),
      escuela({ cueAnexo: 'c', nombre: 'C', alumnos: 3 }),
    ]))
    const orden = 'ordenarPor=matricula&sentido=desc'
    const cuerpo = await (await GET(req(`?formato=json&pagina=2&tamanoPagina=1&${orden}`))).json()
    expect(cuerpo.filas.map((f: { escuela: string }) => f.escuela)).toEqual(['C'])
    expect(await filasDelLibro(await GET(req(`?${orden}`)))).toEqual(['B', 'C', 'A'])
    expect(listarEscuelasMapaEnriquecidas).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['', 300],
    ['&pagina=2&tamanoPagina=1&ordenarPor=escuela&sentido=desc', 300],
    ['&depto=ER', 200],
    ['&estado=sin-clases', 100],
    ['&depto=inexistente', 0],
  ])('suma la matrícula de todo el resultado filtrado (%s)', async (filtros, esperado) => {
    const cuerpo = await (await GET(req(`?formato=json${filtros}`))).json()
    expect(cuerpo.totalAlumnos).toBe(esperado)
    const libro = new ExcelJS.Workbook()
    await libro.xlsx.load(await (await GET(req(`?formato=xlsx${filtros}`))).arrayBuffer())
    expect(libro.worksheets[0].getSheetValues().flat()).toContain(`Total alumnos: ${esperado}`)
  })

  it('suma solamente la matrícula del alcance autorizado', async () => {
    expect((await (await GET(req('?formato=json'))).json()).totalAlumnos).toBe(300)
    verificarAccesoLectura.mockResolvedValue({ ok: true, user: usuario('director_nivel', [9]) })
    vi.mocked(listarEscuelasMapaEnriquecidas).mockResolvedValue(padron([ESCUELAS[2]]))
    const cuerpo = await (await GET(req('?formato=json'))).json()
    expect(cuerpo.totalAlumnos).toBe(100)
    expect(listarEscuelasMapaEnriquecidas).toHaveBeenLastCalledWith({ nivelesJurIds: [9] })
  })

  it('comparte consultas concurrentes y el radar entre páginas y filtros', async () => {
    await Promise.all([
      GET(req('?formato=json&estado=en-riesgo&horizonte=240')),
      GET(req('?formato=json&estado=en-riesgo&horizonte=240&pagina=2')),
      GET(req('?formato=json&estado=en-riesgo&horizonte=240&depto=ER')),
    ])
    expect(listarEscuelasMapaEnriquecidas).toHaveBeenCalledTimes(1)
    expect(radarGET).toHaveBeenCalledTimes(1)
    expect(verificarAccesoLectura).toHaveBeenCalledTimes(3)
  })

  it('comparte la preparación de filas entre ordenamientos sin mutar el orden original', async () => {
    const preparar = vi.spyOn(exportacionesEscuelas, 'filasExportacion')
    try {
      const [asc, desc, original] = await Promise.all([
        GET(req('?formato=json&ordenarPor=escuela&sentido=asc')),
        GET(req('?formato=json&ordenarPor=escuela&sentido=desc')),
        GET(req('?formato=json')),
      ])
      const nombres = (cuerpo: { filas: { escuela: string }[] }) => cuerpo.filas.map(f => f.escuela)
      expect(nombres(await asc.json())).toEqual(['Escuela Afectada', 'Escuela Normal', 'Escuela Otro Depto'])
      expect(nombres(await desc.json())).toEqual(['Escuela Otro Depto', 'Escuela Normal', 'Escuela Afectada'])
      expect(nombres(await original.json())).toEqual(['Escuela Afectada', 'Escuela Normal', 'Escuela Otro Depto'])
      expect(preparar).toHaveBeenCalledOnce()
    } finally {
      preparar.mockRestore()
    }
  })

  it('separa la caché por alcance y canoniza el orden de los niveles', async () => {
    await GET(req('?formato=json'))
    verificarAccesoLectura.mockResolvedValue({ ok: true, user: usuario('director_nivel', [9, 4]) })
    await GET(req('?formato=json'))
    verificarAccesoLectura.mockResolvedValue({ ok: true, user: usuario('director_nivel', [4, 9]) })
    await GET(req('?formato=json'))
    expect(listarEscuelasMapaEnriquecidas).toHaveBeenCalledTimes(2)
    expect(listarEscuelasMapaEnriquecidas).toHaveBeenLastCalledWith({ nivelesJurIds: [4, 9] })
    verificarAccesoLectura.mockResolvedValue({ ok: false, status: 401 })
    expect((await GET(req('?formato=json'))).status).toBe(401)
  })

  it('la caché vence a los 30 segundos y no retiene errores', async () => {
    const ahora = vi.spyOn(Date, 'now').mockReturnValue(1000)
    try {
      await GET(req('?formato=json'))
      ahora.mockReturnValue(31_001)
      await GET(req('?formato=json'))
      expect(listarEscuelasMapaEnriquecidas).toHaveBeenCalledTimes(2)
      vi.mocked(radarGET).mockResolvedValueOnce(Response.json({}, { status: 500 }))
      expect((await GET(req('?formato=json&estado=en-riesgo'))).status).toBe(500)
      expect((await GET(req('?formato=json&estado=en-riesgo'))).status).toBe(200)
      expect(radarGET).toHaveBeenCalledTimes(2)
    } finally {
      ahora.mockRestore()
    }
  })

  it('revalida con ETag después de comprobar acceso, sin repetir la consulta', async () => {
    const respuesta = await GET(req('?formato=json'))
    const etag = respuesta.headers.get('ETag')!
    expect(etag).toBeTruthy()
    const revalidada = await GET(new Request(req('?formato=json'), { headers: { 'If-None-Match': etag } }))
    expect(revalidada.status).toBe(304)
    expect(revalidada.headers.get('Vary')).toContain('Cookie')
    expect(listarEscuelasMapaEnriquecidas).toHaveBeenCalledTimes(1)
    expect(verificarAccesoLectura).toHaveBeenCalledTimes(2)
  })

  it('no reutiliza las filas de otro alcance y las opciones respetan ese alcance', async () => {
    await GET(req('?formato=json'))
    verificarAccesoLectura.mockResolvedValue({ ok: true, user: usuario('director_nivel', [9]) })
    vi.mocked(listarEscuelasMapaEnriquecidas).mockResolvedValue(padron([ESCUELAS[2]]))
    const cuerpo = await (await GET(req('?formato=json'))).json()
    expect(cuerpo.filas.map((f: { cue: string }) => f.cue)).toEqual(['1802001-01'])
    expect(cuerpo.opciones.direcciones).toEqual([{ value: '9', label: 'Nivel Medio' }])
    expect(cuerpo.total).toBe(1)
  })

  it('ajusta una página que ya no existe y entrega solo las columnas visibles', async () => {
    const cuerpo = await (await GET(req('?formato=json&pagina=20&tamanoPagina=2'))).json()
    expect(cuerpo).toMatchObject({ pagina: 2, totalPaginas: 2, total: 3 })
    expect(cuerpo.filas).toHaveLength(1)
    expect(Object.keys(cuerpo.filas[0])).toEqual(cuerpo.columnas.map((c: { clave: string }) => c.clave))
  })

  it.each(['pagina=0', 'pagina=1.5', 'pagina=1e20', 'tamanoPagina=101', 'tamanoPagina=0', 'sentido=otro', 'ordenarPor=inexistente'])(
    'rechaza parámetros inválidos: %s', async parametros => {
      expect((await GET(req(`?formato=json&${parametros}`))).status).toBe(400)
    },
  )

  it('formato desconocido responde 400', async () => {
    expect((await GET(req('?formato=pdf'))).status).toBe(400)
  })
})
