import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { ACCIONES_AUDITORIA, type AccionAuditoria } from './catalogo'

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))
const METODOS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Archivos route.ts con un método mutador que todavía no declara conAuditoria.
// A2 y A3 las migran y las quitan de esta lista. Debe quedar vacía al cerrar A3.
const PENDIENTES: string[] = [
  'app/(miniapps)/(links)/links/api/contenido/route.ts',
  'app/(miniapps)/(links)/links/api/sesion/route.ts',
  'app/api/auth/[...all]/route.ts',
  'app/api/auth/ge-login/route.ts',
  'app/api/call-center/llamadas/route.ts',
  'app/api/cuadernillos/assignments/route.ts',
  'app/api/cuadernillos/cabeceras/route.ts',
  'app/api/cuadernillos/memberships/[id]/route.ts',
  'app/api/cuadernillos/memberships/route.ts',
  'app/api/cuadernillos/quotas/route.ts',
  'app/api/cuadernillos/requests/[id]/approve/route.ts',
  'app/api/cuadernillos/requests/[id]/reject/route.ts',
  'app/api/cuadernillos/requests/[id]/remainder/route.ts',
  'app/api/cuadernillos/requests/route.ts',
  'app/api/cuadernillos/stock/route.ts',
  'app/api/recursos/[id]/archivo/route.ts',
  'app/api/recursos/[id]/explain/route.ts',
  'app/api/recursos/[id]/route.ts',
  'app/api/recursos/route.ts',
  'app/api/taxonomia/[kind]/route.ts',
  'app/api/usuario/idioma/route.ts',
  'app/api/usuarios/[id]/route.ts',
  'app/api/usuarios/opciones/route.ts',
  'app/api/usuarios/route.ts',
]

type Lector = (archivo: string) => string | undefined
type Origen =
  | { tipo: 'auditada' }
  | { tipo: 'importada'; desde: string; nombre: string }
  | { tipo: 'otra' }

function literalAuditada(expresion: ts.Expression | undefined): Origen {
  if (!expresion || !ts.isCallExpression(expresion) || expresion.expression.getText() !== 'conAuditoria') return { tipo: 'otra' }
  const [accion, ruta] = expresion.arguments
  if (expresion.arguments.length !== 3 || !ts.isStringLiteral(accion) || !ts.isStringLiteral(ruta)) return { tipo: 'otra' }
  return (ACCIONES_AUDITORIA as readonly string[]).includes(accion.text as AccionAuditoria) ? { tipo: 'auditada' } : { tipo: 'otra' }
}

function tieneExport(st: ts.Statement) {
  return ts.getModifiers(st as ts.HasModifiers)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

/** Declaraciones de nivel superior: locales, imports y re-exports con origen. */
function origenes(sf: ts.SourceFile): Map<string, Origen> {
  const mapa = new Map<string, Origen>()
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) mapa.set(d.name.text, literalAuditada(d.initializer))
    } else if (ts.isFunctionDeclaration(st) && st.name) {
      mapa.set(st.name.text, { tipo: 'otra' })
    } else if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      for (const el of st.importClause.namedBindings.elements) {
        mapa.set(el.name.text, { tipo: 'importada', desde: st.moduleSpecifier.text, nombre: (el.propertyName ?? el.name).text })
      }
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        mapa.set(el.name.text, { tipo: 'importada', desde: st.moduleSpecifier.text, nombre: (el.propertyName ?? el.name).text })
      }
    }
  }
  return mapa
}

/** Métodos exportados con POST/PUT/PATCH/DELETE y el origen de cada uno. */
function exportados(sf: ts.SourceFile): Array<{ metodo: string; origen: Origen }> {
  const locales = origenes(sf)
  const salida: Array<{ metodo: string; origen: Origen }> = []
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st) && tieneExport(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && METODOS.has(d.name.text)) salida.push({ metodo: d.name.text, origen: literalAuditada(d.initializer) })
        if (ts.isObjectBindingPattern(d.name)) {
          for (const el of d.name.elements) {
            if (ts.isIdentifier(el.name) && METODOS.has(el.name.text)) salida.push({ metodo: el.name.text, origen: { tipo: 'otra' } })
          }
        }
      }
    } else if (ts.isFunctionDeclaration(st) && tieneExport(st) && st.name && METODOS.has(st.name.text)) {
      salida.push({ metodo: st.name.text, origen: { tipo: 'otra' } })
    } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        if (!METODOS.has(el.name.text)) continue
        const local = (el.propertyName ?? el.name).text
        const origen: Origen = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)
          ? { tipo: 'importada', desde: st.moduleSpecifier.text, nombre: local }
          : locales.get(local) ?? { tipo: 'otra' }
        salida.push({ metodo: el.name.text, origen })
      }
    }
  }
  return salida
}

function resolverModulo(desde: string, especificador: string, lector: Lector): string | undefined {
  let base: string
  if (especificador.startsWith('@/')) base = especificador.slice(2)
  else if (especificador.startsWith('.')) base = path.posix.join(path.posix.dirname(desde), especificador)
  else return undefined
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(c => lector(c) !== undefined)
}

/** Sigue imports y re-exports hasta la declaración real; falla cerrado si no puede resolverla. */
function auditada(archivo: string, origen: Origen, lector: Lector, profundidad = 0): boolean {
  if (origen.tipo === 'auditada') return true
  if (origen.tipo === 'otra' || profundidad > 5) return false
  const destino = resolverModulo(archivo, origen.desde, lector)
  const fuente = destino ? lector(destino) : undefined
  if (!destino || fuente === undefined) return false
  const sf = ts.createSourceFile(destino, fuente, ts.ScriptTarget.Latest, true)
  return auditada(destino, origenes(sf).get(origen.nombre) ?? { tipo: 'otra' }, lector, profundidad + 1)
}

function analizar(archivo: string, lector: Lector) {
  const fuente = lector(archivo)
  if (fuente === undefined) return { exportaciones: 0, sinDeclarar: [] as string[] }
  const sf = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true)
  const lista = exportados(sf)
  return {
    exportaciones: lista.length,
    sinDeclarar: lista.filter(e => !auditada(archivo, e.origen, lector)).map(e => e.metodo),
  }
}

function rutasRoute(relDirectorio: string): string[] {
  return readdirSync(path.join(RAIZ, relDirectorio), { withFileTypes: true }).flatMap(item => {
    const rel = path.posix.join(relDirectorio, item.name)
    if (item.isDirectory()) return rutasRoute(rel)
    return item.name === 'route.ts' ? [rel] : []
  })
}

const lectorReal: Lector = rel => {
  const abs = path.join(RAIZ, rel)
  return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined
}

const real = rutasRoute('app').sort().reduce(
  (acc, archivo) => {
    const r = analizar(archivo, lectorReal)
    acc.exportaciones += r.exportaciones
    if (r.sinDeclarar.length) acc.sinDeclarar.push(archivo)
    return acc
  },
  { exportaciones: 0, sinDeclarar: [] as string[] },
)

describe('cobertura de auditoría en rutas mutadoras', () => {
  it('toda ruta mutadora de app/ declara conAuditoria o está en PENDIENTES', () => {
    const fuera = real.sinDeclarar.filter(r => !PENDIENTES.includes(r))
    expect(fuera, `PENDIENTES=${PENDIENTES.length}: rutas sin auditar fuera de la lista`).toEqual([])
  })

  it('PENDIENTES solo lista rutas existentes y todavía sin declarar', () => {
    const obsoletas = PENDIENTES.filter(r => !real.sinDeclarar.includes(r))
    expect(obsoletas, `PENDIENTES=${PENDIENTES.length}: entradas ya migradas o inexistentes`).toEqual([])
  })

  it('PENDIENTES tiene exactamente las rutas sin declarar', () => {
    expect(PENDIENTES.length, `PENDIENTES=${PENDIENTES.length}`).toBe(real.sinDeclarar.length)
  })

  it('el escáner encuentra exportaciones mutadoras reales', () => {
    expect(real.exportaciones).toBeGreaterThan(0)
  })
})

describe('escáner de exportaciones mutadoras', () => {
  const CASOS: Array<{ nombre: string; fuentes: Record<string, string>; esperado: string[] }> = [
    {
      nombre: 'const con conAuditoria literal y acción catalogada',
      fuentes: { 'app/x/route.ts': "export const POST = conAuditoria('motivo.guardar', '/x', async () => new Response())" },
      esperado: [],
    },
    {
      nombre: 'función exportada sin auditar',
      fuentes: { 'app/x/route.ts': 'export async function POST() { return new Response() }' },
      esperado: ['POST'],
    },
    {
      nombre: 'handler creado por fábrica',
      fuentes: { 'app/x/route.ts': "export const PUT = crearHandler('x')" },
      esperado: ['PUT'],
    },
    {
      nombre: 'acción fuera del catálogo',
      fuentes: { 'app/x/route.ts': "export const POST = conAuditoria('no.existe', '/x', async () => new Response())" },
      esperado: ['POST'],
    },
    {
      nombre: 'acción no literal',
      fuentes: { 'app/x/route.ts': "export const POST = conAuditoria(accion, '/x', async () => new Response())" },
      esperado: ['POST'],
    },
    {
      nombre: 're-export local auditado con alias',
      fuentes: { 'app/x/route.ts': "const h = conAuditoria('motivo.guardar', '/x', async () => new Response())\nexport { h as POST }" },
      esperado: [],
    },
    {
      nombre: 're-export importado auditado con alias',
      fuentes: {
        'app/x/route.ts': "import { h } from './h'\nexport { h as DELETE }",
        'app/x/h.ts': "export const h = conAuditoria('motivo.guardar', '/x', async () => new Response())",
      },
      esperado: [],
    },
    {
      nombre: 're-export importado sin auditar',
      fuentes: {
        'app/x/route.ts': "import { h } from './h'\nexport { h as DELETE }",
        'app/x/h.ts': 'export async function h() { return new Response() }',
      },
      esperado: ['DELETE'],
    },
    {
      nombre: 're-export directo desde otro módulo auditado',
      fuentes: {
        'app/x/route.ts': "export { h as PATCH } from '@/lib/x/h'",
        'lib/x/h.ts': "export const h = conAuditoria('motivo.eliminar', '/x', async () => new Response())",
      },
      esperado: [],
    },
    {
      nombre: 'exportación desestructurada de un método mutador',
      fuentes: { 'app/x/route.ts': 'export const { GET, POST } = handlers' },
      esperado: ['POST'],
    },
    {
      nombre: 'GET no es mutador',
      fuentes: { 'app/x/route.ts': 'export async function GET() { return new Response() }' },
      esperado: [],
    },
  ]

  it.each(CASOS)('$nombre', ({ fuentes, esperado }) => {
    const lector: Lector = rel => fuentes[rel]
    expect(analizar('app/x/route.ts', lector).sinDeclarar).toEqual(esperado)
  })
})
