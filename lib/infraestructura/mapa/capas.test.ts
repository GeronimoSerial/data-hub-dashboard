import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CAPAS_VISIBLES_DEFAULT, visibilidadCapa } from './capas'

describe('capas opcionales del mapa', () => {
  it('activa referencias, estaciones del río y eventos reportados por defecto y deja apagadas la lluvia observada y las escuelas aisladas', () => {
    expect(CAPAS_VISIBLES_DEFAULT).toEqual({
      estacionesRio: true,
      lluviaObservada: false,
      eventosReportados: true,
      limitesDepartamentos: true,
      nombresDepartamentos: true,
      rutaAcceso: true,
      crucesAgua: true,
      escuelasAisladas: false,
    })
  })

  it('traduce el estado de visibilidad al layout de MapLibre', () => {
    expect(visibilidadCapa(true)).toBe('visible')
    expect(visibilidadCapa(false)).toBe('none')
  })

  it('conecta los toggles de departamentos con los layouts de sus capas', () => {
    const pagina = readFileSync(resolve(process.cwd(), 'components/mapas/map-infraestructura-page.tsx'), 'utf8')
    expect(pagina).toMatch(/id=\{?CAPA_DEPARTAMENTOS_BORDE_ID\}?[\s\S]*?layout=\{\{ visibility: visibilidadCapa\(capasVisibles\.limitesDepartamentos\) \}\}/)
    const etiquetaInicio = pagina.indexOf('id="infra-departamentos-etiqueta"')
    const etiqueta = pagina.slice(pagina.lastIndexOf('<Layer', etiquetaInicio), pagina.indexOf('/>', etiquetaInicio))
    expect(etiqueta).toMatch(/layout=\{\{\s*\.\.\.symbolLayoutDepartamentos\(\), visibility: visibilidadCapa\(capasVisibles\.nombresDepartamentos\) \}\}/)
    const rellenoInicio = pagina.indexOf('id={CAPA_DEPARTAMENTOS_RELLENO_ID}')
    const relleno = pagina.slice(pagina.lastIndexOf('<Layer', rellenoInicio), pagina.indexOf('/>', rellenoInicio))
    expect(relleno).not.toMatch(/layout=/)
  })

  it('monta la capa de riesgo después de la fuente de partes y fuera de las capas interactivas', () => {
    const pagina = readFileSync(resolve(process.cwd(), 'components/mapas/map-infraestructura-page.tsx'), 'utf8')
    const inicioRiesgo = pagina.indexOf('<CapaRiesgoSituacion')
    const inicioPartes = pagina.indexOf('<Source\n              id="infra-partes-src"')
    const inicioInteractivas = pagina.indexOf('const capasInteractivas = [')
    const interactivas = pagina.slice(inicioInteractivas, pagina.indexOf('\n  ]', inicioInteractivas))
    expect(inicioRiesgo).toBeGreaterThanOrEqual(0)
    expect(inicioRiesgo).toBeGreaterThan(inicioPartes)
    expect(interactivas).not.toContain('infra-riesgo-situacion')
  })
})
