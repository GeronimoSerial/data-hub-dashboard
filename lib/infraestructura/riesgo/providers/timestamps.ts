/** Interpreta como UTC los timestamps Open-Meteo que no incluyen sufijo de zona horaria. */
export function parsearTimestampUtc(ts: string): number {
  return Date.parse(ts.includes('Z') || ts.includes('+') ? ts : `${ts}Z`)
}

export function isoUtc(ts: string): string {
  return ts.includes('Z') || ts.includes('+') ? ts : `${ts}Z`
}
