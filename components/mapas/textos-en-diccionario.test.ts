import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// B10 CA3: visible Spanish text of the infrastructure map must come from the
// dictionaries, not from literals inside its components. Scans JSX text,
// JSX literal attributes and literal JSX expressions of the map components.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

// Modules out of M1 scope. A trailing slash exempts a whole directory.
const EXENTOS: string[] = [
  // Natalidad and matrícula panels: separate map pages, not the Manaos infrastructure map.
  'components/mapas/map-natalidad-page.tsx',
  'components/mapas/estadisticas-natalidad-graficos.tsx',
  'components/mapas/estadisticas-natalidad-panel.tsx',
  'components/mapas/natalidad-escuela-search-box.tsx',
  'components/mapas/matricula-natalidad-panel.tsx',
  'components/mapas/renaper-natalidad-panel.tsx',
  'components/mapas/map-matricula-page.tsx',
  // Reorganización: separate map page.
  'components/mapas/map-reorganizacion-page.tsx',
  'components/mapas/reorganizacion/',
  // Metodología: hidden tab, not part of the infrastructure map.
  'components/mapas/metodologia/',
]

const INFRA_EXPLICIT = [
  'impacto-alumnos-resumen.tsx', 'vigencia-chips.tsx', 'riesgo-escuela.tsx',
  'resumen-pronostico-escuela.tsx', 'ficha-territorial.tsx', 'ficha-acceso-territorial.tsx',
  'referencia-crecida.tsx', 'historial-parte.tsx', 'historial-movimiento.tsx',
  'historial-parte-modal.tsx', 'linea-de-tiempo.tsx', 'evolucion-panel.tsx',
  'evolucion-graficos.tsx', 'situacion-client.tsx', 'estado-datos/panel-estado-datos.tsx',
]

const ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label', 'aria-description', 'data-tooltip'])
const SPANISH_CHARS = /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/
// Accent-free, lowercase words. Compared after stripping diacritics.
const SPANISH_WORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'del', 'al', 'y', 'para', 'por', 'con', 'sin', 'ver',
  'escuela', 'escuelas', 'cargando', 'volver', 'pantalla', 'ninguna', 'ninguno', 'situacion',
  'matricula', 'datos', 'dato', 'mapa', 'capa', 'capas', 'nivel', 'fecha', 'hora', 'alumnos',
  'alumno', 'riesgo', 'cerrar', 'guardar', 'buscar', 'aceptar', 'cancelar', 'siguiente',
  'anterior', 'todos', 'todas', 'hoy', 'cargar',
])

// Literals that are valid, identical Brazilian Portuguese. Keyed by file and exact text.
const IDENTICOS_EN_PT = new Set<string>([
  'components/mapas/exportar/vista-exportar.tsx|Anterior',
  'components/mapas/ficha-escuela-panel.tsx|Ficha de ',
  'components/mapas/ficha-escuela-panel.tsx|Causada por',
  'components/mapas/panel-estadisticas.tsx|Agrupar por',
  'components/mapas/panel-situacion-actual.tsx|de',
  'components/mapas/tarjeta-cruce-agua.tsx|Mapa colaborativo OpenStreetMap',
])

type Hit = { file: string; line: number; text: string }

function isSpanishLiteral(text: string): boolean {
  if (SPANISH_CHARS.test(text)) return true
  const words = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^\p{L}]+/u)
  return words.some((w) => SPANISH_WORDS.has(w))
}

function staticText(expr: ts.Expression): string | null {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  if (ts.isTemplateExpression(expr)) return expr.head.text + expr.templateSpans.map((s) => s.literal.text).join('')
  return null
}

// Expression values of attributes outside ATTRS (id, className, key...) are not visible text.
function isNonVisibleAttr(expr: ts.JsxExpression, sf: ts.SourceFile): boolean {
  return ts.isJsxAttribute(expr.parent) && !ATTRS.has(expr.parent.name.getText(sf))
}

function collect(file: string, src: string): Hit[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const hits: Hit[] = []
  const add = (node: ts.Node, text: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    hits.push({ file, line, text })
  }
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const t = node.getText(sf).trim()
      if (t && isSpanishLiteral(t)) add(node, t)
    } else if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText(sf))
      && node.initializer && ts.isStringLiteral(node.initializer)) {
      if (isSpanishLiteral(node.initializer.text)) add(node.initializer, node.initializer.text)
    } else if (ts.isJsxExpression(node) && node.expression && !isNonVisibleAttr(node, sf)) {
      const t = staticText(node.expression)
      if (t !== null && isSpanishLiteral(t)) add(node, t)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

function isExento(rel: string): boolean {
  return EXENTOS.some((e) => (e.endsWith('/') ? rel.startsWith(e) : rel === e))
}

function scannedFiles(): string[] {
  const mapas = walk(path.join(ROOT, 'components/mapas'))
    .map((p) => path.relative(ROOT, p).split(path.sep).join('/'))
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && !isExento(f))
  const infraDir = path.join(ROOT, 'components/infraestructura')
  const estado = readdirSync(infraDir)
    .filter((f) => /^estado-actual-.*\.tsx$/.test(f) && !f.endsWith('.test.tsx'))
    .map((f) => `components/infraestructura/${f}`)
  return [...mapas, ...estado, ...INFRA_EXPLICIT.map((f) => `components/infraestructura/${f}`)]
}

describe('isSpanishLiteral', () => {
  it.each([
    ['Cargando…', true],
    ['Volver al mapa', true],
    ['Situación actual', true],
    ['¿Continuar?', true],
    ['Escuela sin datos', true],
    ['CUE', false],
    ['Ninguna', true],
    ['Loading schools', false],
    ['Save', false],
  ])('%s -> %s', (text, expected) => {
    expect(isSpanishLiteral(text)).toBe(expected)
  })
})

describe('collect', () => {
  it('ignores JSX expressions that are not literals', () => {
    expect(collect('x.tsx', '<b>{t.capas.x}</b>')).toEqual([])
    expect(collect('x.tsx', '<b id={\'situacion-kpi-\'} />')).toEqual([])
  })
  it('flags JSX text, literal attributes and literal expressions', () => {
    const hits = collect('x.tsx', '<div title="Volver">Cargando…\n{\'Sin datos\'}<i data-x="Cargando" /></div>')
    expect(hits.map((h) => h.text)).toEqual(['Volver', 'Cargando…', 'Sin datos'])
    expect(hits.map((h) => h.line)).toEqual([1, 1, 2])
  })
})

describe('infraestructura y mapas: textos visibles en diccionario', () => {
  it('no component literal is Spanish outside the dictionaries', () => {
    const files = scannedFiles()
    expect(files.length).toBeGreaterThan(0)
    const hits = files.flatMap((f) => collect(f, readFileSync(path.join(ROOT, f), 'utf8')))
    const report = hits
      .filter((h) => !IDENTICOS_EN_PT.has(`${h.file}|${h.text}`))
      .map((h) => `${h.file}:${h.line}  "${h.text}"`)
    expect(report, `${report.length} Spanish literal(s) outside dictionaries:\n${report.join('\n')}`).toHaveLength(0)
  })

  it('every identical-in-Portuguese exemption still matches a literal', () => {
    const vistos = new Set(
      scannedFiles().flatMap((f) => collect(f, readFileSync(path.join(ROOT, f), 'utf8')).map((h) => `${h.file}|${h.text}`)),
    )
    expect([...IDENTICOS_EN_PT].filter((k) => !vistos.has(k))).toEqual([])
  })
})
