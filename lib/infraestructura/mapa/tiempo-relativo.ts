export function tiempoRelativo(iso: string, ahoraMs: number): string {
  const fechaMs = Date.parse(iso)
  if (!Number.isFinite(fechaMs)) return ''

  const minutos = Math.max(0, Math.floor((ahoraMs - fechaMs) / 60_000))
  if (minutos < 60) return `hace ${minutos} min`

  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`

  const dias = Math.floor(horas / 24)
  return `hace ${dias} d`
}
