import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// M2: visible Spanish text of the hub shell, login and parte flows must come
// from the dictionaries, not from literals inside their components. Scans JSX
// text, JSX literal attributes and literal JSX expressions.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

const DIRECTORIOS = [
  'components/infraestructura/actualizar',
  'components/infraestructura/borradores',
  'components/infraestructura/fotos',
  'components/infraestructura/offline',
  'app/problematicas/parte',
  'app/problematicas/verificaciones',
]

const ARCHIVOS = [
  'components/app-shell.tsx',
  'app/(publico)/login/login-form.tsx',
  'components/ui/multi-select.tsx',
  'components/ui/bottom-sheet.tsx',
  'components/ui/confirm-sheet.tsx',
  ...[
    'reporte-inicial-form', 'verificacion-responder', 'verificaciones-cola', 'afectacion-campos',
    'instituto-alcance-campos', 'campos-clases-edificio', 'campo-gravedad', 'campo-vigente',
    'secciones-selector', 'selector-alumnos', 'selector-establecimiento', 'encabezado-parte',
    'estado-envio-aviso', 'materiales-tras-reporte', 'acceso-form', 'nuevo-parte-contenido',
    'alcance-nominal-modal', 'nominal-permisos-admin',
  ].map((f) => `components/infraestructura/${f}.tsx`),
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
  'components/infraestructura/fotos/carga-evidencia.tsx|Cancelar',
  'components/infraestructura/verificaciones-cola.tsx|Cancelar',
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

function scannedFiles(): string[] {
  const enDirectorios = DIRECTORIOS.flatMap((d) => walk(path.join(ROOT, d)))
    .map((p) => path.relative(ROOT, p).split(path.sep).join('/'))
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
  return [...new Set([...enDirectorios, ...ARCHIVOS])].sort()
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

describe('parte, login y shell: textos visibles en diccionario', () => {
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
