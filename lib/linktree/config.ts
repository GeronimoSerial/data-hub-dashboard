import { z } from 'zod'

// Accent options are official palette colours only (Manual de Marca §3.1).
// Each one maps to a background/ink pair that keeps AA contrast; the pairs
// live in the page stylesheet, keyed by these slugs.
export const ACENTOS = ['amarillo', 'celeste', 'verde', 'bordo'] as const
export type Acento = (typeof ACENTOS)[number]

export const ICONOS = [
  'globe',
  'database',
  'map',
  'chart',
  'file-text',
  'school',
  'graduation-cap',
  'book-open',
  'users',
  'calendar',
  'folder',
  'mail',
  'phone',
  'shield-check',
] as const
export type Icono = (typeof ICONOS)[number]

export const LIMITES = {
  grupos: 20,
  enlacesPorGrupo: 50,
  titulo: 80,
  subtitulo: 200,
  pie: 200,
  grupoTitulo: 60,
  descripcion: 160,
  url: 2048,
} as const

// Only absolute http(s) URLs or paths on this host. Anything else (javascript:,
// data:, protocol-relative, backslash tricks) is rejected because the value is
// rendered as an href on a public page.
export function urlSegura(valor: string) {
  if (valor.includes('\\')) return false
  if (valor.startsWith('/')) return !valor.startsWith('//')
  try {
    const { protocol } = new URL(valor)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

const enlaceSchema = z.object({
  id: z.string().min(1).max(64),
  titulo: z.string().trim().min(1).max(LIMITES.titulo),
  descripcion: z.string().trim().max(LIMITES.descripcion),
  url: z.string().trim().max(LIMITES.url).refine(urlSegura, 'URL inválida'),
  icono: z.enum(ICONOS).nullable(),
  visible: z.boolean(),
})

const grupoSchema = z.object({
  id: z.string().min(1).max(64),
  titulo: z.string().trim().min(1).max(LIMITES.grupoTitulo),
  enlaces: z.array(enlaceSchema).max(LIMITES.enlacesPorGrupo),
})

export const configSchema = z.object({
  version: z.literal(1),
  titulo: z.string().trim().min(1).max(LIMITES.titulo),
  subtitulo: z.string().trim().max(LIMITES.subtitulo),
  pie: z.string().trim().max(LIMITES.pie),
  acento: z.enum(ACENTOS),
  mostrarLogo: z.boolean(),
  mostrarDominio: z.boolean(),
  grupos: z.array(grupoSchema).max(LIMITES.grupos),
})

export type LinktreeEnlace = z.infer<typeof enlaceSchema>
export type LinktreeGrupo = z.infer<typeof grupoSchema>
export type LinktreeConfig = z.infer<typeof configSchema>

export const CONFIG_INICIAL: LinktreeConfig = {
  version: 1,
  titulo: 'Sistemas del Ministerio de Educación',
  subtitulo: 'Accesos a las plataformas del Ministerio de Educación de Corrientes.',
  pie: '',
  acento: 'amarillo',
  mostrarLogo: true,
  mostrarDominio: true,
  grupos: [],
}

/** Stored documents are untrusted on read: anything invalid falls back to the defaults. */
export function leerConfig(raw: unknown): LinktreeConfig {
  const parsed = configSchema.safeParse(raw)
  return parsed.success ? parsed.data : CONFIG_INICIAL
}
