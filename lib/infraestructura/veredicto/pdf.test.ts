import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { DtoVeredicto } from './dto'
import { generarPdfVeredictos, lineasPdf, sanitizarWinAnsi } from './pdf'

function veredicto(over: Partial<DtoVeredicto> = {}): DtoVeredicto {
  return {
    id: 'v1',
    fecha: '2026-10-12',
    ambito: 'provincia',
    tipoDia: 'observado',
    nivel: 'vigilancia',
    texto: 'Hay vigilancia por crecidas. Revise el mapa.',
    fuente: 'regla',
    enCalibracion: false,
    cerrado: true,
    generadoEn: '2026-10-12T12:00:00.000Z',
    version: 1,
    frases: null,
    traza: [],
    metricas: [
      { id: 'p95_caudal', valor: 1, unidad: null, etiqueta: 'Caudal del río', fuenteUrl: 'https://example.org/caudal' },
    ],
    fuentesAusentes: [],
    aguasArriba: [],
    ...over,
  }
}

const generadoEn = new Date('2026-10-13T15:30:00.000Z')

describe('generarPdfVeredictos', () => {
  it('devuelve bytes de un PDF', async () => {
    const bytes = await generarPdfVeredictos({ veredictos: [veredicto()], generadoEn })
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF')
  })

  it('pagina cuando hay muchos veredictos', async () => {
    const largo = 'Texto de prueba que se repite para ocupar espacio en la página. '.repeat(8)
    const veredictos = Array.from({ length: 40 }, (_, i) =>
      veredicto({
        id: `v${i}`,
        fecha: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
        texto: largo,
      }),
    )
    const bytes = await generarPdfVeredictos({ veredictos, generadoEn })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })

  it('genera un PDF válido sin veredictos', async () => {
    const bytes = await generarPdfVeredictos({ veredictos: [], generadoEn })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  it('no lanza con caracteres fuera de WinAnsi', async () => {
    const veredictos = [veredicto({ texto: 'Caudal ≥ umbral 😀 → alerta “moderada”…' })]
    await expect(generarPdfVeredictos({ veredictos, generadoEn })).resolves.toBeInstanceOf(Uint8Array)
  })
})

describe('lineasPdf', () => {
  it('incluye el aviso fijo y no expone métricas técnicas', () => {
    const texto = lineasPdf({ veredictos: [veredicto()], generadoEn }).map((l) => l.texto).join('\n')
    expect(texto).toContain('No es un aviso oficial. Consulte al SMN, a Prefectura Naval y a Defensa Civil.')
    expect(texto).not.toContain('p95')
    expect(texto).not.toContain('p95_caudal')
  })

  it('muestra el aviso de calibración solo si algún veredicto está en calibración', () => {
    const aviso = 'Niveles en calibración: las reglas todavía se están ajustando con eventos reales.'
    const sin = lineasPdf({ veredictos: [veredicto()], generadoEn }).map((l) => l.texto).join('\n')
    const con = lineasPdf({ veredictos: [veredicto({ enCalibracion: true })], generadoEn })
      .map((l) => l.texto)
      .join('\n')
    expect(sin).not.toContain(aviso)
    expect(con).toContain(aviso)
  })

  it('usa nombres legibles para los departamentos con señal', () => {
    const dpto = veredicto({ ambito: 'departamento:paso-de-los-libres', nivel: 'alerta', texto: 'Alerta local. Más detalle.' })
    const texto = lineasPdf({ veredictos: [veredicto(), dpto], generadoEn }).map((l) => l.texto).join('\n')
    expect(texto).toContain('Paso de los Libres: Alerta — Alerta local.')
  })

  it('indica la ausencia de veredictos', () => {
    const texto = lineasPdf({ veredictos: [], generadoEn }).map((l) => l.texto).join('\n')
    expect(texto).toContain('Sin veredictos para el período.')
  })

  it('agrega una línea de aguas arriba como contexto cuando hay datos', () => {
    const aguasArriba = [
      { estacionId: 'pna-iguazu', nombre: 'IGUAZU', rio: 'parana' as const, estadoMax: 'evacuacion' as const, alturaMaxM: 30.8, umbralM: 28 },
      { estacionId: 'pna-posadas', nombre: 'POSADAS', rio: 'parana' as const, estadoMax: 'normal' as const, alturaMaxM: 12.5, umbralM: null },
    ]
    const texto = lineasPdf({ veredictos: [veredicto({ aguasArriba })], generadoEn }).map((l) => l.texto).join('\n')
    expect(texto).toContain(
      'Aguas arriba (contexto, no modifica el nivel): Prefectura Iguazú (río Paraná) — Altura del río: 30,80 m · Evacuación (evacuación 28,00 m); Prefectura Posadas (río Paraná) — Altura del río: 12,50 m',
    )
  })

  it('no agrega línea de aguas arriba cuando no hay datos', () => {
    const texto = lineasPdf({ veredictos: [veredicto()], generadoEn }).map((l) => l.texto).join('\n')
    expect(texto).not.toContain('Aguas arriba')
  })

  it('agrega los eventos confirmados del día sin identificadores técnicos', () => {
    const evento = {
      id: 'EV-7',
      fecha: '2026-10-12',
      fechaTexto: '12/10',
      departamento: 'PASO DE LOS LIBRES',
      lugar: 'Ruta 14',
      titulo: 'Calles anegadas',
      tipo: 'Evento reportado' as const,
      confianza: 'alta' as const,
      confianzaTexto: 'Confianza alta' as const,
      fuente: { medio: 'Diario X', fecha: '13/10/2026', url: 'https://ex.com/nota' },
    }
    const lineas = lineasPdf({ veredictos: [veredicto()], generadoEn, eventos: [evento] }).map((l) => l.texto)
    expect(lineas).toContain('Confirmado en terreno (no modifica el nivel):')
    expect(lineas).toContain(
      '- Calles anegadas - Ruta 14 (Paso de los Libres), 12/10. Confianza alta. Fuente: Diario X, 13/10/2026',
    )
    expect(lineas.join('\n')).not.toContain('EV-')
  })

  it('indica la ausencia de eventos confirmados con fuente verificable', () => {
    const texto = lineasPdf({ veredictos: [veredicto()], generadoEn }).map((l) => l.texto).join('\n')
    expect(texto).toContain('Sin eventos confirmados con fuente verificable.')
  })
})

describe('sanitizarWinAnsi', () => {
  it('reemplaza comillas y guiones tipográficos', () => {
    expect(sanitizarWinAnsi('“x” ‘y’ – —')).toBe(`"x" 'y' - -`)
  })

  it('reemplaza símbolos matemáticos y flechas', () => {
    expect(sanitizarWinAnsi('≥ 1 ≤ 2 → 3')).toBe('>= 1 <= 2 -> 3')
  })

  it('reemplaza puntos suspensivos', () => {
    expect(sanitizarWinAnsi('fin…')).toBe('fin...')
  })

  it('conserva caracteres latinos y reemplaza emojis', () => {
    expect(sanitizarWinAnsi('Corrientes ñandú 😀')).toBe('Corrientes ñandú ?')
  })
})
