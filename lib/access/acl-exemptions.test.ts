import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { puedeLeerMapaInfraestructura } from '@/lib/infraestructura/acceso-lectura'

// S8 / L10: creating a problemática (parte flow, its APIs, the service worker
// and /infraestructura/cargar) must never depend on the recurso allow-list.
// These files must not call puedeAbrir. If one of them needs a resource gate,
// change the design in lib/access first; do not add puedeAbrir here.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

const EXEMPT_PATHS = [
  'app/problematicas/parte',
  'app/api/problematicas',
  'app/(hub)/infraestructura/cargar',
  'public/sw-parte.js',
]

function sourceFiles(relPath: string): string[] {
  const abs = join(ROOT, relPath)
  if (statSync(abs).isFile()) return [abs]
  return readdirSync(abs).flatMap((entry) => {
    const child = join(abs, entry)
    if (statSync(child).isDirectory()) return sourceFiles(relative(ROOT, child))
    return /\.(ts|tsx|js|jsx)$/.test(entry) && !/\.test\./.test(entry) ? [child] : []
  })
}

describe('S8 access exemptions', () => {
  it('finds the exempt flow sources, so the guard is not vacuous', () => {
    for (const relPath of EXEMPT_PATHS) {
      expect(sourceFiles(relPath).length, relPath).toBeGreaterThan(0)
    }
  })

  it('no problemática creation or cargar source calls puedeAbrir (S8, L10)', () => {
    const offenders = EXEMPT_PATHS.flatMap(sourceFiles)
      .filter((file) => /\bpuedeAbrir\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file))
    expect(
      offenders,
      'S8: the parte flow and /infraestructura/cargar must stay outside puedeAbrir',
    ).toEqual([])
  })

  it('infra map helper keeps consulta open on a no-audience recurso (S8)', () => {
    const consulta: SessionUser = {
      id: 'reader',
      role: 'consulta',
      banned: false,
      nivelJurIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
      hubPolicy: { enabledSections: ['infrastructure'], landing: false },
    }
    const sinAudiencia = {
      id: 'infra-map',
      estado: 'publicado' as const,
      audienciaNivelJurIds: [],
      audienciaUserIds: [],
    }
    expect(
      puedeLeerMapaInfraestructura(consulta, sinAudiencia),
      'S8: the infrastructure map must not lose access to consulta on a no-audience recurso',
    ).toBe(true)
  })
})
