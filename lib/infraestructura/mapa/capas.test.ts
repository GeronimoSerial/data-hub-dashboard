import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CAPAS_VISIBLES_DEFAULT, CLAVE_CAPAS_VISIBLES, guardarCapas, leerCapasGuardadas, visibilidadCapa } from './capas'

describe('capas opcionales del mapa', () => {
  it('activa referencias, estaciones del río, eventos reportados y lluvia observada por defecto y deja apagadas las escuelas aisladas', () => {
    expect(CAPAS_VISIBLES_DEFAULT).toEqual({
      estacionesRio: true,
      lluviaObservada: true,
      eventosReportados: true,
      limitesDepartamentos: true,
      nombresDepartamentos: true,
      rutaAcceso: true,
      crucesAgua: true,
      escuelasAisladas: false,
      escuelasEnRiesgo: false,
    })
  })

  it('ignora las preferencias guardadas con la clave anterior para que la lluvia observada arranque encendida', () => {
    expect(CLAVE_CAPAS_VISIBLES).not.toBe('mapa-infraestructura:capas-visibles')
    const almacen = almacenEnMemoria({ 'mapa-infraestructura:capas-visibles': JSON.stringify({ ...CAPAS_VISIBLES_DEFAULT, lluviaObservada: false }) })
    expect(leerCapasGuardadas(almacen).lluviaObservada).toBe(true)
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


function almacenEnMemoria(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial))
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void datos.set(clave, valor),
  }
}

describe('capas visibles guardadas', () => {
  it('sin almacén ni dato devuelve los valores por defecto', () => {
    expect(leerCapasGuardadas(null)).toEqual(CAPAS_VISIBLES_DEFAULT)
    expect(leerCapasGuardadas(almacenEnMemoria())).toEqual(CAPAS_VISIBLES_DEFAULT)
  })

  it('recupera lo guardado y completa las capas faltantes con el defecto', () => {
    const almacen = almacenEnMemoria({ [CLAVE_CAPAS_VISIBLES]: JSON.stringify({ estacionesRio: false, otra: true }) })
    expect(leerCapasGuardadas(almacen)).toEqual({ ...CAPAS_VISIBLES_DEFAULT, estacionesRio: false })
  })

  it('ignora un valor corrupto', () => {
    expect(leerCapasGuardadas(almacenEnMemoria({ [CLAVE_CAPAS_VISIBLES]: '{no-json' }))).toEqual(CAPAS_VISIBLES_DEFAULT)
  })

  it('guarda y vuelve a leer, sin romper si el almacén falla', () => {
    const almacen = almacenEnMemoria()
    guardarCapas(almacen, { ...CAPAS_VISIBLES_DEFAULT, lluviaObservada: true })
    expect(leerCapasGuardadas(almacen).lluviaObservada).toBe(true)
    expect(() => guardarCapas({ getItem: () => null, setItem: () => { throw new Error('lleno') } }, CAPAS_VISIBLES_DEFAULT)).not.toThrow()
  })
})
