import { describe, expect, it } from 'vitest'
import { parteComunTextosEs } from './parteComunTextos.es'
import { parteComunTextosPt } from './parteComunTextos.pt'
import { parteCamposEs } from './parteCampos.es'
import { parteCamposPt } from './parteCampos.pt'

describe('confirmaciones de categoría citan la etiqueta de su idioma', () => {
  it('pt cita las etiquetas pt que muestra afectacion-campos', () => {
    expect(parteCamposPt.categoria.confirmarEstablecimiento).toContain(
      parteComunTextosPt.categoriaAfectacion.alumnos.etiqueta,
    )
    expect(parteCamposPt.categoria.confirmarAlumnos).toContain(
      parteComunTextosPt.categoriaAfectacion.establecimiento.etiqueta,
    )
  })

  it('es cita las etiquetas españolas', () => {
    expect(parteCamposEs.categoria.confirmarEstablecimiento).toContain(
      parteComunTextosEs.categoriaAfectacion.alumnos.etiqueta,
    )
    expect(parteCamposEs.categoria.confirmarAlumnos).toContain(
      parteComunTextosEs.categoriaAfectacion.establecimiento.etiqueta,
    )
  })
})
