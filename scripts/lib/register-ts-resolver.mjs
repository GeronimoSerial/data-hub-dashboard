import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function registerTsResolver(
  root,
  { aliases = true, absolute = true, filesOnly = false, extensionless = false } = {},
) {
  const candidateFor = (base) => {
    const candidates = extensionless
      ? [base, `${base}.ts`, join(base, 'index.ts')]
      : [`${base}.ts`, join(base, 'index.ts')]
    for (const candidate of candidates) {
      if (existsSync(candidate) && (!filesOnly || statSync(candidate).isFile())) return candidate
    }
    return null
  }

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (aliases && specifier.startsWith('@/')) {
        const base = join(root, specifier.slice(2))
        // A specifier that already names an existing JavaScript module keeps that file.
        const exacto = /\.(mjs|cjs|js)$/.test(base) && existsSync(base) && statSync(base).isFile() ? base : null
        const candidate = exacto ?? candidateFor(base)
        if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
      } else if (
        specifier.startsWith('./') ||
        specifier.startsWith('../') ||
        (absolute && specifier.startsWith('/'))
      ) {
        const base = specifier.startsWith('/')
          ? specifier
          : join(dirname(fileURLToPath(context.parentURL)), specifier)
        const candidate = candidateFor(base)
        if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    },
  })
}
