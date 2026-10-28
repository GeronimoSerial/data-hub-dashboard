import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

// Render only the file component: no Next server, credentials or database.
const destination = '/tmp/archivos-html-capturas'
await mkdir(destination, { recursive: true })
const output = '/tmp/archivos-html-preview.cjs'
await build({
  stdin: {
    contents: `
      import React from 'react'
      import { renderToStaticMarkup } from 'react-dom/server'
      import { ArchivoMetadata } from './components/archivo-metadata'
      export default renderToStaticMarkup(<main style={{maxWidth: 860, margin: '40px auto', padding: 20}}>
        <h1>Archivos HTML</h1>
        <p>Datos de ejemplo para revisión visual</p>
        <div className="card-grid">
          <article className="resource-card"><h2>Informe de matrícula</h2><ArchivoMetadata recurso={{id: 'nuevo', mime: 'text/html', storageKey: 'nuevo/uuid', nombreOriginal: 'Matrícula octubre 2026.html', cargadoEn: '2026-10-20T12:00:00Z'}} /></article>
          <article className="resource-card"><h2>Informe histórico</h2><ArchivoMetadata recurso={{id: 'viejo', mime: 'text/html', storageKey: 'viejo/uuid'}} /></article>
        </div>
      </main>)`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
})
const markup = createRequire(import.meta.url)(output).default
const css = await readFile(path.resolve('app/globals.css'), 'utf8')
const document = `<!doctype html><html lang="es"><meta charset="utf-8"><style>${css}</style><body>${markup}</body></html>`
await writeFile(`${destination}/preview.html`, document)
const browser = await chromium.launch({ headless: true })
try {
  for (const [name, width] of [['desktop', 1100], ['mobile', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
    await page.route('**/*', (route) => route.abort())
    await page.setContent(document)
    await page.screenshot({ path: `${destination}/${name}.png`, fullPage: true })
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
      throw new Error(`Horizontal overflow at ${width}px`)
    }
    await page.close()
  }
} finally {
  await browser.close()
}
console.log(`Capturas guardadas en ${destination}`)
