// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createHash } from 'node:crypto'
import { RiesgoEscuela } from './riesgo-escuela'
import { RegionProvider } from '@/lib/infraestructura/region/region-provider'
import { regionPublica } from '@/lib/infraestructura/region/esquema'
import { cargarRegion } from '@/lib/infraestructura/region/registro'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarRegionPublicaClienteParaPruebas } from '@/lib/infraestructura/region/publica'
import { PRESENTACION_CRECIDA } from '@/lib/infraestructura/riesgo/__fixtures__/crecida-rio'

// Sha256 of RiesgoEscuela.innerHTML under Corrientes once loaded, recorded before the FABDEM change.
const HASH_CORRIENTES = '98e9c309d351d4864e24786cd7d795efd85d8e8add892bab6276f1dcf67fb2bf'

const CUE = '1801605-04'

const RESPUESTA = {
  snapshot: { nivelRiesgo: 'alto', scoreRiesgo: 50, horizonteHoras: 72, calculadoEn: '2026-10-14T02:26:32.861Z' },
  factores: [{
    tipo: 'amenaza', fuente: 'rio-prefectura', variable: 'altura_rio', valor: 4.03, unidad: 'm', contribucion: 31.25,
    explicacion: 'Rio parana en pna-ituzaingo: 4.03m, estado evacuacion (alerta 3.5m, evacuacion 4m), tendencia crece; escuela expuesta por clase_rio=alto',
    observadoEn: null,
  }],
  crecidaRio: PRESENTACION_CRECIDA,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => RESPUESTA }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  __reiniciarRegionPublicaClienteParaPruebas()
})

describe('RiesgoEscuela con terreno FABDEM', () => {
  it('atribuye el terreno FABDEM al pie de la ficha de riesgo en Manaos', async () => {
    const { container } = render(
      <RegionProvider region={regionPublica(cargarRegion('manaos'))}>
        <IdiomaProvider idioma="pt">
          <RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={null} />
        </IdiomaProvider>
      </RegionProvider>,
    )
    await waitFor(() => expect(container.querySelector('[data-testid="riesgo-escuela-conclusion"]')).not.toBeNull())

    expect(container.querySelector('section.riesgo-escuela')).toHaveTextContent(
      'Terreno: FABDEM V1-2 © Universidade de Bristol / Fathom, CC BY-NC-SA 4.0',
    )
    expect(screen.getByRole('link', { name: 'CC BY-NC-SA 4.0' })).toBeTruthy()
  })

  it('no agrega atribución y mantiene el HTML de Corrientes idéntico', async () => {
    const { container } = render(
      <IdiomaProvider idioma="es">
        <RiesgoEscuela cueAnexo={CUE} horizonte={72} planificacion={null} />
      </IdiomaProvider>,
    )
    await waitFor(() => expect(container.querySelector('[data-testid="riesgo-escuela-conclusion"]')).not.toBeNull())

    expect(container.textContent).not.toContain('FABDEM')
    expect(createHash('sha256').update(container.innerHTML).digest('hex')).toBe(HASH_CORRIENTES)
  })
})
