import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTE_MANIFEST } from './route-manifest'

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const APP_DIR = path.join(REPO_ROOT, 'app')
const ROUTE_FILE_NAMES = new Set(['route.ts', 'page.tsx'])

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return listRouteFiles(full)
    return ROUTE_FILE_NAMES.has(entry) ? [path.relative(REPO_ROOT, full).split(path.sep).join('/')] : []
  })
}

describe('ROUTE_MANIFEST', () => {
  const onDisk = listRouteFiles(APP_DIR).sort()
  const declared = Object.keys(ROUTE_MANIFEST).sort()

  it('declares a capability for every route.ts and page.tsx on disk', () => {
    const missing = onDisk.filter((file) => !(file in ROUTE_MANIFEST))
    expect(
      missing,
      `Routes without a declared capability. Routes must declare a capability in lib/access/route-manifest.ts:\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('has no entries for route files that are missing on disk', () => {
    const stale = declared.filter((file) => !onDisk.includes(file))
    expect(
      stale,
      `Manifest entries without a route file on disk (remove them from lib/access/route-manifest.ts):\n${stale.join('\n')}`,
    ).toEqual([])
  })
})
