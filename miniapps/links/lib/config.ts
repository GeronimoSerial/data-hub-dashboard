import { z } from 'zod'

export const LIMITES = {
  enlaces: 100,
  titulo: 80,
  subtitulo: 200,
  enlaceTitulo: 80,
  descripcion: 160,
  url: 2048,
} as const

// Only absolute http(s) URLs: every link here points outside this site, and the
// value is rendered as an href on a public page, so javascript:, data: and
// relative or protocol-relative forms are rejected.
export function urlSegura(valor: string) {
  if (valor.includes('\\')) return false
  try {
    const { protocol } = new URL(valor)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export const enlaceSchema = z.object({
  id: z.string().min(1).max(64),
  titulo: z.string().trim().min(1).max(LIMITES.enlaceTitulo),
  descripcion: z.string().trim().max(LIMITES.descripcion),
  url: z.string().trim().max(LIMITES.url).refine(urlSegura, 'URL inválida'),
})

export const configSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0).default(0),
  titulo: z.string().trim().min(1).max(LIMITES.titulo),
  subtitulo: z.string().trim().max(LIMITES.subtitulo),
  enlaces: z.array(enlaceSchema).max(LIMITES.enlaces).refine((enlaces) => new Set(enlaces.map((e) => e.id)).size === enlaces.length, 'Los ids de enlace deben ser únicos'),
})

export type Enlace = z.infer<typeof enlaceSchema>
export type LinksConfig = z.infer<typeof configSchema>

export const CONFIG_INICIAL: LinksConfig = {
  version: 1,
  revision: 0,
  titulo: 'Accesos externos',
  subtitulo: '',
  enlaces: [],
}

/** Stored documents are untrusted on read: anything invalid falls back to the defaults. */
export function leerConfig(raw: unknown): LinksConfig {
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) console.warn('links_config_invalida')
  return parsed.success ? parsed.data : CONFIG_INICIAL
}
