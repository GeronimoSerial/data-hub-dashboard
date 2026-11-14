import { describe, expect, it } from 'vitest'
import { COPY, formatCambioPct, semaforoGlosa } from '@/lib/copy/didactica'
import { es } from './es'
import { pt } from './pt'

// pt leaves that are identical to es on purpose: Portuguese cognates, codes and
// proper nouns. Keyed by path, so a Spanish sentence copied into another slot still fails.
const IGUALES_PERMITIDOS = new Set<string>([
  'pt.fichaBitacora.supervisor',
  'pt.fichaBitacora.callCenter',
  'pt.situacion.prioridadesColumnas.departamento',
  'pt.situacion.cue',
  'pt.shellHub.home.recursosPublicados',
  'pt.shellHub.home.temas',
  'pt.shellHub.home.recurso',
  'pt.shellHub.home.recursos',
  'pt.shellHub.home.porTema',
  'pt.shellHub.home.porFormato',
  'pt.shellHub.catalogo.formatos.mapa.label',
  'pt.shellHub.catalogo.formatos.mapa.plural',
  'pt.residuos.veredicto.temporal.observado',
  'pt.residuos.veredicto.tipoDia.observado',
  'pt.residuos.veredicto.niveles.alerta',
  'pt.residuos.veredicto.niveles.severo',
  'pt.residuos.veredicto.acciones.pdf',
  'pt.didactica.legend.enrollment2023',
  'pt.didactica.legend.enrollment2026',
  'pt.didactica.popup.enrollmentSection',
  'pt.didactica.popup.contextExtra',
  'pt.didactica.popup.cue',
  'pt.didactica.popup.department',
  'pt.didactica.popup.zone',
  'pt.didactica.popup.apiSection',
  'pt.didactica.popup.byOffer',
  'pt.didactica.popup.byTurn',
])

type Hoja = { ruta: string; valor: unknown }

function recorrer(valor: unknown, ruta: string, hojas: Hoja[]): Hoja[] {
  if (typeof valor === 'object' && valor !== null) {
    for (const clave of Object.keys(valor)) {
      recorrer((valor as Record<string, unknown>)[clave], `${ruta}.${clave}`, hojas)
    }
    return hojas
  }
  hojas.push({ ruta, valor })
  return hojas
}

function forma(valor: unknown): unknown {
  if (typeof valor === 'function') return `fn/${valor.length}`
  if (typeof valor === 'object' && valor !== null) {
    if (Array.isArray(valor)) return valor.map(forma)
    return Object.fromEntries(
      Object.keys(valor).map((k) => [k, forma((valor as Record<string, unknown>)[k])]),
    )
  }
  return typeof valor
}

describe('diccionarios es y pt', () => {
  it('pt has exactly the same keys, tuple lengths and function arities as es', () => {
    expect(forma(pt)).toEqual(forma(es))
  })

  it('pt has no empty leaf and no leaf copied from es unless allow-listed', () => {
    const hojasEs = recorrer(es, 'es', [])
    const hojasPt = recorrer(pt, 'pt', [])
    expect(hojasPt.length).toBe(hojasEs.length)
    const vacias = hojasPt.filter((h) => typeof h.valor === 'string' && h.valor.trim() === '')
    expect(vacias.map((h) => h.ruta)).toEqual([])
    const copiadas = hojasPt
      .map((hoja, i) => ({ ruta: hoja.ruta, pt: hoja.valor, es: hojasEs[i]!.valor }))
      .filter((h) => typeof h.pt === 'string' && h.pt === h.es && !IGUALES_PERMITIDOS.has(h.ruta))
    expect(copiadas).toEqual([])
  })

  it('es leaves used by the Corrientes map equal the original Spanish copy', () => {
    expect(COPY.legend.evolutionTitle).toBe('Evolución matrícula 2023-2026')
    expect(COPY.legend.noSobreofertaData).toBe('Sin datos de sobreoferta')
    expect(COPY.legend.enrollment2023).toBe('Matrícula 2023')
  })

  it('keeps the Spanish formatting helpers byte-for-byte', () => {
    expect(formatCambioPct(-0.341)).toBe('bajó 34,1%')
    expect(formatCambioPct(0.0002)).toBe('sin cambio')
    expect(formatCambioPct(null)).toBe('—')
    expect(semaforoGlosa('verde')).toBe(COPY.semaforoGlosa.verde)
  })
})
