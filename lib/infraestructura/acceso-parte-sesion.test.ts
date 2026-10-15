import { describe, expect, it } from 'vitest'
import { accesoParteSesion } from '@/lib/infraestructura/acceso-parte-sesion'

const CUE_PROPIO = '1801605-04'
const CUE_AJENO = '1800001-00'

const operador = {
  role: 'operador_establecimiento' as const,
  banned: false,
  nivelJurIds: [],
  cueAnexo: CUE_PROPIO,
}

describe('accesoParteSesion: operador de establecimiento', () => {
  it('sin ?cue usa el CUE de su sesión', () => {
    expect(accesoParteSesion(operador, undefined, null)).toEqual({ permitido: true, cue: CUE_PROPIO })
    expect(accesoParteSesion(operador, '', null)).toEqual({ permitido: true, cue: CUE_PROPIO })
  })

  it('con su mismo CUE en la URL, entra', () => {
    expect(accesoParteSesion(operador, CUE_PROPIO, null)).toEqual({ permitido: true, cue: CUE_PROPIO })
  })

  it('con un CUE ajeno en la URL, niega', () => {
    expect(accesoParteSesion(operador, CUE_AJENO, null)).toEqual({ permitido: false, cue: CUE_AJENO })
  })

  it('sin CUE en la sesión no entra, aunque la URL traiga uno', () => {
    const sinCue = { ...operador, cueAnexo: null }
    expect(accesoParteSesion(sinCue, CUE_PROPIO, null).permitido).toBe(false)
    expect(accesoParteSesion(sinCue, undefined, null).permitido).toBe(false)
  })

  it('no depende del nivel jurisdiccional', () => {
    expect(accesoParteSesion({ ...operador, nivelJurIds: [9] }, CUE_AJENO, 9).permitido).toBe(false)
  })
})

describe('accesoParteSesion: director de nivel', () => {
  const director = { role: 'director_nivel' as const, banned: false, nivelJurIds: [3, 7], cueAnexo: null }

  it('entra a un CUE cuyo nivel está en sus niveles asignados', () => {
    expect(accesoParteSesion(director, CUE_AJENO, 7)).toEqual({ permitido: true, cue: CUE_AJENO })
  })

  it('niega un CUE de otro nivel', () => {
    expect(accesoParteSesion(director, CUE_AJENO, 5)).toEqual({ permitido: false, cue: CUE_AJENO })
  })

  it('niega si el CUE no tiene nivel cargado', () => {
    expect(accesoParteSesion(director, CUE_AJENO, null).permitido).toBe(false)
  })

  it('sin CUE en la URL no entra: tiene que elegir la escuela', () => {
    expect(accesoParteSesion(director, undefined, null)).toEqual({ permitido: false, cue: null })
  })

  it('sin niveles asignados no entra', () => {
    expect(accesoParteSesion({ ...director, nivelJurIds: [] }, CUE_AJENO, 7).permitido).toBe(false)
  })
})

describe('accesoParteSesion: resto de los casos', () => {
  it('admin entra sin depender de la sesión por CUE', () => {
    const admin = { role: 'admin' as const, banned: false, nivelJurIds: [], cueAnexo: null }
    expect(accesoParteSesion(admin, CUE_AJENO, null)).toEqual({ permitido: true, cue: CUE_AJENO })
  })

  it('editor y consulta no entran por sesión', () => {
    for (const role of ['editor', 'consulta'] as const) {
      const user = { role, banned: false, nivelJurIds: [1], cueAnexo: CUE_PROPIO }
      expect(accesoParteSesion(user, CUE_PROPIO, 1).permitido).toBe(false)
    }
  })

  it('usuario baneado o sin sesión no entra', () => {
    expect(accesoParteSesion(null, CUE_PROPIO, 1).permitido).toBe(false)
    expect(accesoParteSesion({ ...operador, banned: true }, undefined, null).permitido).toBe(false)
  })

  it('normaliza el CUE de la URL antes de comparar', () => {
    expect(accesoParteSesion(operador, `  ${CUE_PROPIO} `, null)).toEqual({ permitido: true, cue: CUE_PROPIO })
  })
})
