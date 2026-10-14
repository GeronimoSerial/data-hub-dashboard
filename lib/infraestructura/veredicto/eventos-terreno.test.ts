import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cargarEventosTerreno, seleccionarEventosTerreno } from './eventos-terreno'

const EV_HEADER =
  'id_evento,clase,tipo_afectacion,departamento,localidad,inicio_evento,fin_evento,estado_temporal,ultima_actualizacion,evidencias,confianza'
const EVD_HEADER =
  'id_evidencia,fuente,autor_organismo,titulo,url,fecha_publicacion,verificacion'

function csv(header: string, filas: string[]): string {
  return [header, ...filas].join('\n')
}

const EVIDENCIAS_BASE = csv(EVD_HEADER, [
  'EVD-001,Diario X,Agencia Y,Crecida,https://ex.com/a,2026-10-12,verificada_url',
])

describe('seleccionarEventosTerreno', () => {
  it('emite una fila por departamento con fecha, lugar, título y fuente visibles', () => {
    const eventos = seleccionarEventosTerreno({
      eventosCsv: csv(EV_HEADER, [
        'EVT-1,evento_publico,nivel sobre cota de evacuación; evacuaciones preventivas,Capital;Itatí,Ciudad;Pueblo,2026-10-12,,ocurrido,2026-10-12,EVD-001,alta',
      ]),
      evidenciasCsv: EVIDENCIAS_BASE,
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })

    expect(eventos).toEqual([
      {
        id: 'EVT-1',
        fecha: '2026-10-12',
        fechaTexto: '12/10',
        departamento: 'CAPITAL',
        lugar: 'Ciudad, Pueblo',
        titulo: 'Nivel sobre cota de evacuación, evacuaciones preventivas',
        tipo: 'Evento reportado',
        confianza: 'alta',
        confianzaTexto: 'Confianza alta',
        fuente: { medio: 'Diario X', fecha: '12/10/2026', url: 'https://ex.com/a' },
      },
      {
        id: 'EVT-1',
        fecha: '2026-10-12',
        fechaTexto: '12/10',
        departamento: 'ITATI',
        lugar: 'Ciudad, Pueblo',
        titulo: 'Nivel sobre cota de evacuación, evacuaciones preventivas',
        tipo: 'Evento reportado',
        confianza: 'alta',
        confianzaTexto: 'Confianza alta',
        fuente: { medio: 'Diario X', fecha: '12/10/2026', url: 'https://ex.com/a' },
      },
    ])
  })

  it('excluye los eventos con confianza muy baja', () => {
    const eventos = seleccionarEventosTerreno({
      eventosCsv: csv(EV_HEADER, [
        'EVT-2,evento_publico,Crecida,Capital,Ciudad,2026-10-12,,ocurrido,2026-10-12,EVD-001,muy baja',
      ]),
      evidenciasCsv: EVIDENCIAS_BASE,
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
    expect(eventos).toEqual([])
  })

  it('excluye una confianza baja sin enlace verificable y conserva la que lo tiene', () => {
    const evidencias = csv(EVD_HEADER, [
      'EVD-001,Diario X,,Sin enlace,,2026-10-12,verificada_url',
      'EVD-002,Diario Z,,Con enlace,https://ex.com/z,2026-10-12,verificado por orquestador',
    ])
    const eventos = seleccionarEventosTerreno({
      eventosCsv: csv(EV_HEADER, [
        'EVT-3,evento_publico,Crecida,Capital,Ciudad,2026-10-12,,ocurrido,2026-10-12,EVD-001,baja',
        'EVT-4,evento_publico,Crecida,Capital,Ciudad,2026-10-12,,ocurrido,2026-10-12,EVD-002,baja',
      ]),
      evidenciasCsv: evidencias,
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
    expect(eventos.map((e) => e.id)).toEqual(['EVT-4'])
    expect(eventos[0]!.confianzaTexto).toBe('Confianza baja')
    expect(eventos[0]!.fuente.medio).toBe('Diario Z')
  })

  it('omite la evidencia no verificada y usa la siguiente verificada del evento', () => {
    const evidencias = csv(EVD_HEADER, [
      'EVD-001,Diario X,,No encontrada,https://ex.com/x,2026-10-12,no_encontrada',
      'EVD-002,Diario Y,,Verificada,https://ex.com/y,2026-10-13,verificada_url',
    ])
    const eventos = seleccionarEventosTerreno({
      eventosCsv: csv(EV_HEADER, [
        'EVT-5,evento_publico,Nivel alto,Capital,Ciudad,2026-10-12,,ocurrido,2026-10-12,"EVD-001;EVD-002",media',
      ]),
      evidenciasCsv: evidencias,
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
    expect(eventos).toHaveLength(1)
    expect(eventos[0]!.fuente).toEqual({ medio: 'Diario Y', fecha: '13/10/2026', url: 'https://ex.com/y' })
    expect(eventos[0]!.tipo).toBe('Evento reportado')
  })

  it('cubre ambos días de un rango 2026-10-12/13', () => {
    const eventos = seleccionarEventosTerreno({
      eventosCsv: csv(EV_HEADER, [
        'EVT-6,evento_publico,Crecida,Capital,Ciudad,2026-10-12/13,,ocurrido,2026-10-13,EVD-001,alta',
      ]),
      evidenciasCsv: EVIDENCIAS_BASE,
      desde: '2026-10-12',
      hasta: '2026-10-13',
    })
    expect(eventos.map((e) => e.fecha)).toEqual(['2026-10-12', '2026-10-13'])
    expect(eventos.map((e) => e.fechaTexto)).toEqual(['12/10', '13/10'])
  })

  it('extiende un evento vigente hasta su última actualización', () => {
    const eventos = seleccionarEventosTerreno({
      eventosCsv: csv(EV_HEADER, [
        'EVT-7,evento_publico,Crecida,Capital,Ciudad,2026-10-10,,vigente_segun_ultimo_reporte,2026-10-12,EVD-001,alta',
      ]),
      evidenciasCsv: EVIDENCIAS_BASE,
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
    expect(eventos.map((e) => e.fecha)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12'])
  })

  it('recorta los días al rango consultado', () => {
    const eventos = seleccionarEventosTerreno({
      eventosCsv: csv(EV_HEADER, [
        'EVT-8,evento_publico,Crecida,Capital,Ciudad,2026-10-10,2026-10-15,resuelto_explicito,2026-10-15,EVD-001,alta',
      ]),
      evidenciasCsv: EVIDENCIAS_BASE,
      desde: '2026-10-12',
      hasta: '2026-10-13',
    })
    expect(eventos.map((e) => e.fecha)).toEqual(['2026-10-12', '2026-10-13'])
  })

  it('ordena por fecha, clase, confianza y título', () => {
    const evidencias = csv(EVD_HEADER, [
      'EVD-001,Fuente,,T,https://ex.com/1,2026-10-12,verificada_url',
    ])
    const eventos = seleccionarEventosTerreno({
      eventosCsv: csv(EV_HEADER, [
        'EVT-A,medicion_hidrometrica,Zeta,Capital,Ciudad,2026-10-12,,ocurrido,2026-10-12,EVD-001,alta',
        'EVT-B,evento_publico,Beta,Capital,Ciudad,2026-10-12,,ocurrido,2026-10-12,EVD-001,baja',
        'EVT-C,evento_publico,Alfa,Capital,Ciudad,2026-10-12,,ocurrido,2026-10-12,EVD-001,alta',
        'EVT-D,evento_publico,Gamma,Capital,Ciudad,2026-10-11,,ocurrido,2026-10-11,EVD-001,media',
        'EVT-E,evento_publico,Delta,Capital,Ciudad,2026-10-12,,ocurrido,2026-10-12,EVD-001,media',
      ]),
      evidenciasCsv: evidencias,
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
    // Zeta es una medición hidrométrica: no es un evento en terreno y queda fuera.
    expect(eventos.map((e) => e.titulo)).toEqual(['Gamma', 'Alfa', 'Delta', 'Beta'])
  })

  it('respeta comas y comillas dobles dentro de campos entrecomillados', () => {
    const eventos = seleccionarEventosTerreno({
      eventosCsv: csv(EV_HEADER, [
        '"EVT-9",evento_publico,"Crecida, con ""pico""",Capital,"Ciudad, Barrio",2026-10-12,,ocurrido,2026-10-12,EVD-001,alta',
      ]),
      evidenciasCsv: EVIDENCIAS_BASE,
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
    expect(eventos[0]!.titulo).toBe('Crecida, con "pico"')
    expect(eventos[0]!.lugar).toBe('Ciudad, Barrio')
  })

  it('no expone el id del evento en textos visibles', () => {
    const eventos = seleccionarEventosTerreno({
      eventosCsv: csv(EV_HEADER, [
        'EVT-10,evento_publico,Crecida,Capital,Ciudad,2026-10-12,,ocurrido,2026-10-12,EVD-001,alta',
      ]),
      evidenciasCsv: EVIDENCIAS_BASE,
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
    const visibles = eventos.flatMap((e) => [e.titulo, e.lugar, e.tipo, e.fechaTexto, e.confianzaTexto, e.fuente.medio])
    expect(visibles.some((texto) => texto.includes('EVT-10'))).toBe(false)
  })
})

describe('cargarEventosTerreno', () => {
  let dirs: string[] = []

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
    dirs = []
  })

  async function raizConDatos(eventos?: string, evidencias?: string): Promise<string> {
    const raiz = await mkdtemp(join(tmpdir(), 'evt-terreno-'))
    dirs.push(raiz)
    const carpeta = join(raiz, 'public/data/eventos-inundaciones')
    await mkdir(carpeta, { recursive: true })
    if (eventos !== undefined) await writeFile(join(carpeta, 'eventos.csv'), eventos)
    if (evidencias !== undefined) await writeFile(join(carpeta, 'evidencias.csv'), evidencias)
    return raiz
  }

  it('lee los CSV de public/data/eventos-inundaciones y filtra por rango', async () => {
    const raiz = await raizConDatos(
      csv(EV_HEADER, [
        'EVT-1,evento_publico,Crecida,Capital,Ciudad,2026-10-12,,ocurrido,2026-10-12,EVD-001,alta',
      ]),
      EVIDENCIAS_BASE,
    )
    vi.spyOn(process, 'cwd').mockReturnValue(raiz)
    const eventos = await cargarEventosTerreno({ desde: '2026-10-12', hasta: '2026-10-12' })
    expect(eventos.map((e) => e.id)).toEqual(['EVT-1'])
  })

  it('devuelve [] cuando faltan los archivos', async () => {
    const raiz = await mkdtemp(join(tmpdir(), 'evt-terreno-vacio-'))
    dirs.push(raiz)
    vi.spyOn(process, 'cwd').mockReturnValue(raiz)
    await expect(cargarEventosTerreno({ desde: '2026-10-01', hasta: '2026-10-31' })).resolves.toEqual([])
  })
})

describe('seleccionarEventosTerreno: solo afectaciones en terreno', () => {
  it('excluye mediciones hidrométricas y filas sin afectación informada', () => {
    const eventosCsv = [
      'id_evento,clase,tipo_afectacion,departamento,localidad,inicio_evento,fin_evento,estado_temporal,ultima_actualizacion,evidencias,confianza',
      'EV-1,medicion_hidrometrica,ninguna informada,Capital,Corrientes,2026-10-13,,ocurrido,,EVD-1,alta',
      'EV-2,evento_publico,Nivel en alerta (sin afectación informada),Goya,Goya,2026-10-13,,ocurrido,,EVD-1,alta',
      'EV-3,evento_publico,calles anegadas,Goya,Goya,2026-10-13,,ocurrido,,EVD-1,alta',
    ].join('\n')
    const evidenciasCsv = [
      'id_evidencia,fuente,autor_organismo,titulo,url,fecha_publicacion,verificacion',
      'EVD-1,Diario,,Nota,https://example.org/n,2026-10-13,verificada_url',
    ].join('\n')

    const eventos = seleccionarEventosTerreno({ eventosCsv, evidenciasCsv, desde: '2026-10-13', hasta: '2026-10-13' })

    expect(eventos.map((e) => e.titulo)).toEqual(['Calles anegadas'])
  })
})
