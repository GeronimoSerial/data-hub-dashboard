export function hrefReplayEpisodio(episodioId: string): string {
  return `/mapas/infraestructura?modo=replay&episodio=${encodeURIComponent(episodioId)}`
}
