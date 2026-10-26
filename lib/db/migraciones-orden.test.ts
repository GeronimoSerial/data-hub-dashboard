import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const drizzleDir = path.resolve(process.cwd(), 'drizzle')

type JournalEntry = { idx: number; when: number; tag: string }

const journal = JSON.parse(
  readFileSync(path.join(drizzleDir, 'meta', '_journal.json'), 'utf8'),
) as { entries: JournalEntry[] }

const sqlTags = readdirSync(drizzleDir)
  .filter((archivo) => archivo.endsWith('.sql'))
  .map((archivo) => archivo.slice(0, -'.sql'.length))
  .sort()

describe('orden de migraciones de drizzle', () => {
  it('los valores when del journal son estrictamente crecientes', () => {
    const whens = journal.entries.map((entrada) => entrada.when)
    for (let i = 1; i < whens.length; i++) {
      expect(whens[i], `${journal.entries[i].tag} debe ser mayor que su antecesor`).toBeGreaterThan(
        whens[i - 1],
      )
    }
  })

  it('cada archivo .sql tiene entrada en el journal y cada entrada tiene archivo .sql', () => {
    const tagsJournal = journal.entries.map((entrada) => entrada.tag).sort()
    expect(tagsJournal).toEqual(sqlTags)
  })

  it('0036_radar_forecast_lookup_reapply tiene el mismo SQL que 0032_radar_forecast_lookup', () => {
    const original = readFileSync(path.join(drizzleDir, '0032_radar_forecast_lookup.sql'), 'utf8')
    const reaplicada = readFileSync(
      path.join(drizzleDir, '0036_radar_forecast_lookup_reapply.sql'),
      'utf8',
    )
    expect(reaplicada).toBe(original)
  })
})
