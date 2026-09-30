import { describe, expect, it } from 'vitest'
import { hrefReplayEpisodio } from './replay-link'

describe('hrefReplayEpisodio', () => {
  it('abre el mapa en replay y codifica el identificador del episodio', () => {
    expect(hrefReplayEpisodio('episodio 1')).toBe(
      '/mapas/infraestructura?modo=replay&episodio=episodio%201',
    )
  })
})
