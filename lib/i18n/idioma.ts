export type Idioma = 'es' | 'pt'

export const IDIOMAS: readonly Idioma[] = ['es', 'pt']

export function esIdioma(valor: unknown): valor is Idioma {
  return typeof valor === 'string' && (IDIOMAS as readonly string[]).includes(valor)
}

// Maps a BCP 47 locale (es-AR, pt-BR) to its dictionary language. A locale
// without a dictionary is a region configuration error, so it fails loudly.
export function idiomaDeLocale(locale: string): Idioma {
  const lengua = locale.split(/[-_]/)[0]?.toLowerCase()
  if (esIdioma(lengua)) return lengua
  throw new Error(`Locale sin diccionario de idioma: ${locale}`)
}

type RegionIdiomas = { locale: string; idiomas: readonly string[] }

// The user's preference wins only when the region offers it. Otherwise the
// region default applies: the language of region.locale, or the region's
// first offered language if the locale is not among them.
export function idiomaEfectivo({
  preferencia,
  region,
}: {
  preferencia: string | null | undefined
  region: RegionIdiomas
}): Idioma {
  const ofrecidos = region.idiomas.filter(esIdioma)
  if (esIdioma(preferencia) && ofrecidos.includes(preferencia)) return preferencia
  const porLocale = idiomaDeLocale(region.locale)
  return ofrecidos.includes(porLocale) ? porLocale : ofrecidos[0] ?? porLocale
}

// The selector is offered only where the region has more than one language.
export function mostrarSelectorIdioma(region: { idiomas: readonly string[] }): boolean {
  return region.idiomas.length > 1
}
