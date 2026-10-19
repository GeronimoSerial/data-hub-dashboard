import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

function rutas(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap(item => {
    const archivo = path.join(directorio, item.name)
    return item.isDirectory() ? rutas(archivo) : item.name === 'route.ts' ? [archivo] : []
  })
}

it('todas las escrituras de reportes y mapa declaran acción y patrón de ruta auditados', () => {
  const faltantes: string[] = []
  let total = 0
  for (const archivo of ['app/api/problematicas', 'app/api/infraestructura', 'app/api/mapas/infraestructura'].flatMap(rutas)) {
    const source = ts.createSourceFile(archivo, readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true)
    for (const statement of source.statements) {
      if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue
      if (ts.isFunctionDeclaration(statement) && /^(POST|PUT|PATCH|DELETE)$/.test(statement.name?.text ?? '')) faltantes.push(`${archivo}: ${statement.name!.text}`)
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !/^(POST|PUT|PATCH|DELETE)$/.test(declaration.name.text)) continue
        total++
        const init = declaration.initializer
        if (!init || !ts.isCallExpression(init) || init.expression.getText(source) !== 'conAuditoria'
          || init.arguments.length !== 3 || !ts.isStringLiteral(init.arguments[0]) || !ts.isStringLiteral(init.arguments[1])) {
          faltantes.push(`${archivo}: ${declaration.name.text}`)
        }
      }
    }
  }
  expect(faltantes).toEqual([])
  expect(total).toBeGreaterThanOrEqual(20)
})
