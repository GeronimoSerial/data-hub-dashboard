import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAPABILITY_GUARDS, DELEGATED_ENFORCEMENT } from './capability-guards'
import type { Capability } from './capabilities'
import { ROUTE_MANIFEST } from './route-manifest'

// Declared ⇒ enforced: each non-public route must reference a guard of one of
// its declared capabilities. Pages under app/(hub) may be enforced by the
// nearest layout.tsx chain up to app/(hub)/layout.tsx.

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const HUB_DIR = path.join(REPO_ROOT, 'app', '(hub)')

function sourceOf(relPath: string): string {
  return readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
}

function moduleSource(alias: string): string {
  return sourceOf(path.join('lib', alias.replace(/^@\/lib\//, '')) + '.ts')
}

function layoutSourcesFor(relPath: string): string[] {
  if (!relPath.startsWith('app/(hub)/')) return []
  const sources: string[] = []
  let dir = path.dirname(path.join(REPO_ROOT, relPath))
  while (dir.startsWith(HUB_DIR)) {
    const layout = path.join(dir, 'layout.tsx')
    if (existsSync(layout)) sources.push(readFileSync(layout, 'utf8'))
    if (dir === HUB_DIR) break
    dir = path.dirname(dir)
  }
  return sources
}

function referencesAny(source: string, identifiers: readonly string[]): boolean {
  return identifiers.some((id) => new RegExp(`\\b${id}\\b`).test(source))
}

function declaredCapabilities(entry: Capability | readonly Capability[]): Capability[] {
  return Array.isArray(entry) ? [...entry] : [entry as Capability]
}

describe('route enforcement (declared ⇒ enforced)', () => {
  const failures: string[] = []
  const enforced: string[] = []

  for (const [relPath, entry] of Object.entries(ROUTE_MANIFEST)) {
    const caps = declaredCapabilities(entry)
    if (caps.every((cap) => cap === 'public')) continue
    const guards = [...new Set(caps.flatMap((cap) => CAPABILITY_GUARDS[cap]))]
    const ownSource = sourceOf(relPath)
    const layoutSources = layoutSourcesFor(relPath)
    const delegated = DELEGATED_ENFORCEMENT[relPath]
    const delegatedOk = delegated !== undefined
      && ownSource.includes(`from '${delegated.module}'`)
      && referencesAny(moduleSource(delegated.module), delegated.guards)
    const ok = delegatedOk || referencesAny(ownSource, guards) || layoutSources.some((src) => referencesAny(src, guards))
    if (!ok) {
      failures.push(
        `${relPath} -> ${caps.join(' | ')}, expected one of [${guards.join(', ')}]. ` +
          'declare the right capability in lib/access/route-manifest.ts or call its guard',
      )
    } else {
      enforced.push(relPath)
    }
  }

  it('finds at least one enforced route (sanity check on the scan)', () => {
    expect(enforced.length).toBeGreaterThan(0)
  })

  it('every non-public route references a guard for its declared capability', () => {
    expect(
      failures,
      `Routes declared but not enforced:\n${failures.join('\n')}`,
    ).toEqual([])
  })
})
